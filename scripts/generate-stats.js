/* ===========================================================
   generate-stats.js — Mundial stats vía football-data.org
   --------------------------------------------------------------
   API-Football free tier no expone WC 2026 (solo 2022-2024).
   Pivot a football-data.org, donde tu FOOTBALL_DATA_KEY YA tiene
   acceso a WC 2026 (es la que usa el cron de resultados).

   Cobertura ofrecida con esta fuente:
     · Clasificación por grupos (12 grupos)
     · Top goleadores
   No cubre con free tier:
     · Asistentes detallados, tarjetas por jugador, stats por
       selección (goles por minuto, formaciones…). Sus secciones
       en la UI quedan ocultas/vacías y se indica la fuente.

   Variables de entorno:
     FOOTBALL_DATA_KEY            (obligatoria)
     FOOTBALL_DATA_COMPETITION    (opcional, default 'WC')
     FOOTBALL_DATA_SEASON         (opcional, default '2026')
     DRY_RUN=1                    (opcional)
   =========================================================== */

'use strict';

const fs   = require('fs');
const path = require('path');

const KEY    = process.env.FOOTBALL_DATA_KEY;
const COMP   = process.env.FOOTBALL_DATA_COMPETITION || 'WC';
const SEASON = process.env.FOOTBALL_DATA_SEASON || '2026';
const DRY_RUN= process.env.DRY_RUN === '1';

const BASE    = 'https://api.football-data.org/v4';
const HEADERS = { 'X-Auth-Token': KEY };
const OUT     = path.join(__dirname, '..', 'data', 'stats.json');

if (!KEY) {
  console.error('ERROR: FOOTBALL_DATA_KEY no definido.');
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
  return res.json();
}

/* ===== Mapping al esquema que espera el frontend (mundial.js) =====
   El esquema se diseñó originalmente para API-Football. Mantenemos
   la forma para no tocar el frontend. */

function mapStanding(row) {
  return {
    rank: row.position,
    team: {
      id:   row.team && row.team.id,
      name: row.team && (row.team.name || row.team.shortName),
      logo: (row.team && row.team.crest) || ''
    },
    all: {
      played: row.playedGames,
      win:    row.won,
      draw:   row.draw,
      lose:   row.lost,
      goals: { for: row.goalsFor, against: row.goalsAgainst }
    },
    goalsDiff: row.goalDifference,
    points:    row.points,
    /* football-data devuelve 'W,W,D' separado por comas; mundial.js
       espera 'WWD' (sin separadores). */
    form: (row.form || '').replace(/,/g, '')
  };
}

function mapScorer(s) {
  return {
    player: { name: (s.player && s.player.name) || '?' },
    statistics: [{
      team: { name: (s.team && (s.team.shortName || s.team.name)) || '?' },
      games: { appearences: s.playedMatches || 0, minutes: 0 },
      goals: { total: s.goals || 0, assists: s.assists }
    }]
  };
}

/* ===== Main ===== */
async function main() {
  console.log(`> ${new Date().toISOString()} · football-data.org pull (${COMP} ${SEASON})`);

  /* Standings: el endpoint devuelve un array de stages × type × group.
     Para fase de grupos tenemos `stage: 'GROUP_STAGE'` y `type: 'TOTAL'`. */
  console.log('  → /competitions/' + COMP + '/standings');
  const stdRes = await callAPI(`/competitions/${COMP}/standings`);
  const groups = [];
  (stdRes.standings || []).forEach(block => {
    if (block.stage === 'GROUP_STAGE' && block.type === 'TOTAL' && Array.isArray(block.table)) {
      const groupLetter = (block.group || '').replace(/^GROUP_/, '');
      const mapped = block.table.map(row => {
        const out = mapStanding(row);
        out.group = `Group ${groupLetter}`;
        return out;
      });
      if (mapped.length) groups.push(mapped);
    }
  });

  console.log(`  → /competitions/${COMP}/scorers`);
  const scoRes = await callAPI(`/competitions/${COMP}/scorers?limit=20`);
  const scorers = (scoRes.scorers || []).map(mapScorer);

  console.log(`  · ${groups.length} grupos · ${scorers.length} goleadores`);

  const out = {
    generated_at: new Date().toISOString(),
    team_stats_generated_at: null,
    source: 'football-data.org',
    notes: {
      coverage: 'Free tier: standings + top goleadores. Asistentes, tarjetas y stats por equipo NO disponibles en esta fuente.'
    },
    season: SEASON,
    league: COMP,
    groups,
    scorers,
    assists: [],
    yellow:  [],
    red:     [],
    team_stats: {}
  };

  if (DRY_RUN) {
    console.log('> DRY_RUN=1 — no se escribe.');
    return;
  }

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
