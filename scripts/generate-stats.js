/* ===========================================================
   generate-stats.js — Mundial stats vía API-Football
   --------------------------------------------------------------
   Llama a api-sports.io con `league=1&season=2026` y compone
   `data/stats.json` para que el frontend lo sirva como estático.

   Estrategia de cuota (free tier 100 req/día):
     · CHEAPS (cada corrida): 5 endpoints — standings + 4 listas top
       (goleadores, asistentes, amarillas, rojas) = 5 req
     · TEAM_STATS (solo si la última carga fue hace >23 h): 48 req,
       uno por equipo, secuencial respetando el rate-limit de 10 req/min
     · Total/día con 4 corridas: 4×5 + 1×48 = 68 req
   Variables de entorno:
     API_FOOTBALL_KEY            (obligatoria)
     API_FOOTBALL_LEAGUE         (opcional, default '1')
     API_FOOTBALL_SEASON         (opcional, default '2026')
     FORCE_TEAM_STATS=1          (opcional, fuerza el refresh de equipos)
     DRY_RUN=1                   (opcional, no escribe)
   =========================================================== */

'use strict';

const fs   = require('fs');
const path = require('path');

const KEY       = process.env.API_FOOTBALL_KEY;
const LEAGUE    = process.env.API_FOOTBALL_LEAGUE || '1';
const SEASON    = process.env.API_FOOTBALL_SEASON || '2026';
const FORCE_TS  = process.env.FORCE_TEAM_STATS === '1';
const DRY_RUN   = process.env.DRY_RUN === '1';

const BASE    = 'https://v3.football.api-sports.io';
const HEADERS = { 'x-apisports-key': KEY };
const OUT     = path.join(__dirname, '..', 'data', 'stats.json');
const TEAM_STATS_TTL_MS = 23 * 60 * 60 * 1000;        // refresca equipos cada 23 h
const RATE_LIMIT_DELAY_MS = 6500;                      // 10 req/min ⇒ 6.5 s entre llamadas

if (!KEY) {
  console.error('ERROR: API_FOOTBALL_KEY no definido. Añade el secret en GitHub.');
  process.exit(2);
}

/* ===== HTTP wrapper ===== */
async function callAPI(endpoint) {
  const url = `${BASE}${endpoint}`;
  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`${endpoint} → ${res.status} ${res.statusText}: ${body.slice(0, 200)}`);
  }
  const json = await res.json();
  if (json.errors && Object.keys(json.errors).length) {
    console.warn(`  ⚠ ${endpoint} errors:`, JSON.stringify(json.errors));
  }
  return json;
}

/* ===== Main ===== */
async function main() {
  console.log(`> ${new Date().toISOString()} · API-Football pull (league=${LEAGUE} season=${SEASON})`);

  /* 1. Cargar stats existentes (para decidir si tocan team_stats) */
  let existing = {};
  try { existing = JSON.parse(fs.readFileSync(OUT, 'utf8')); } catch (_) { /* primera vez */ }

  /* 2. Endpoints baratos en paralelo */
  console.log('  → fetch endpoints "baratos" en paralelo (5 req)…');
  const [standings, scorers, assists, yellow, red] = await Promise.all([
    callAPI(`/standings?league=${LEAGUE}&season=${SEASON}`),
    callAPI(`/players/topscorers?league=${LEAGUE}&season=${SEASON}`),
    callAPI(`/players/topassists?league=${LEAGUE}&season=${SEASON}`),
    callAPI(`/players/topyellowcards?league=${LEAGUE}&season=${SEASON}`),
    callAPI(`/players/topredcards?league=${LEAGUE}&season=${SEASON}`)
  ]);

  const groups = (standings.response && standings.response[0] && standings.response[0].league && standings.response[0].league.standings) || [];
  const teamIds = [];
  groups.forEach(g => g.forEach(row => { if (row.team && row.team.id) teamIds.push(row.team.id); }));

  console.log(`  · ${groups.length} grupos · ${teamIds.length} equipos · ${(scorers.response||[]).length} goleadores`);

  /* 3. Team stats: refresca sólo si toca o si se fuerza */
  const lastTeamStatsTs = existing.team_stats_generated_at ? new Date(existing.team_stats_generated_at).getTime() : 0;
  const tsStale = Date.now() - lastTeamStatsTs > TEAM_STATS_TTL_MS;
  const needTeamStats = FORCE_TS || tsStale;

  let teamStats = existing.team_stats || {};
  let teamStatsGeneratedAt = existing.team_stats_generated_at;

  if (needTeamStats && teamIds.length) {
    console.log(`  → refrescando team_stats para ${teamIds.length} equipos (${(teamIds.length * RATE_LIMIT_DELAY_MS / 60000).toFixed(1)} min aprox.)…`);
    teamStats = {};
    for (let i = 0; i < teamIds.length; i++) {
      const id = teamIds[i];
      try {
        const r = await callAPI(`/teams/statistics?league=${LEAGUE}&season=${SEASON}&team=${id}`);
        teamStats[id] = r.response || null;
        if ((i+1) % 12 === 0) console.log(`    · ${i+1}/${teamIds.length} equipos`);
      } catch (err) {
        console.warn(`    ⚠ team ${id}: ${err.message}`);
        teamStats[id] = null;
      }
      if (i < teamIds.length - 1) {
        await new Promise(r => setTimeout(r, RATE_LIMIT_DELAY_MS));
      }
    }
    teamStatsGeneratedAt = new Date().toISOString();
    console.log(`  · team_stats refrescado (${Object.keys(teamStats).length} equipos)`);
  } else {
    const ageH = ((Date.now() - lastTeamStatsTs) / 3600000).toFixed(1);
    console.log(`  · team_stats vigente (refresco hace ${ageH} h, TTL 23 h) — se omite`);
  }

  /* 4. Componer output */
  const out = {
    generated_at: new Date().toISOString(),
    team_stats_generated_at: teamStatsGeneratedAt,
    season: SEASON,
    league: LEAGUE,
    groups,
    scorers: scorers.response || [],
    assists: assists.response || [],
    yellow:  yellow.response  || [],
    red:     red.response     || [],
    team_stats: teamStats
  };

  if (DRY_RUN) {
    console.log('> DRY_RUN=1 — no se escribe.');
    return;
  }

  /* 5. Escribir solo si cambió (idempotente) */
  const json = JSON.stringify(out, null, 2);
  let prev = null;
  try { prev = fs.readFileSync(OUT, 'utf8'); } catch (_) {}
  if (prev === json) {
    console.log('> data/stats.json sin cambios.');
    return;
  }
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, json, 'utf8');
  console.log(`> data/stats.json actualizado (${json.length} bytes).`);
}

main().catch(err => {
  console.error('ERROR:', err.message || err);
  process.exit(1);
});
