/* ===========================================================
   generate-stats.js — Mundial stats vía football-data.org
   --------------------------------------------------------------
   Fuente: football-data.org (reutiliza FOOTBALL_DATA_KEY).
   Endpoints:
     · /competitions/WC/standings → 12 grupos (con goalsFor/goalsAgainst)
     · /competitions/WC/scorers   → top goleadores
   Salida: data/stats.json — minimalista, sin enriquecimientos
   ni cálculos derivados (lo decide el frontend a la hora de pintar).
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

async function callAPI(endpoint) {
  const res = await fetch(`${BASE}${endpoint}`, { headers: HEADERS });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`${endpoint} → ${res.status} ${res.statusText}: ${body.slice(0, 200)}`);
  }
  return res.json();
}

async function main() {
  console.log(`> ${new Date().toISOString()} · football-data.org (${COMP} ${SEASON})`);

  /* ===== 1. Standings ===== */
  console.log(`  → /competitions/${COMP}/standings`);
  const stdRes = await callAPI(`/competitions/${COMP}/standings`);
  const rawStandings = stdRes.standings || [];
  console.log(`  · respuesta: ${rawStandings.length} bloques`);
  rawStandings.forEach((b, i) => {
    console.log(`    [${i}] stage=${b.stage || '?'} type=${b.type || '?'} group=${b.group || '?'} rows=${(b.table||[]).length}`);
  });

  /* Filtro permisivo: preferimos type=TOTAL pero aceptamos null/missing.
     Aceptamos cualquier bloque con `group` definido y `table` con filas. */
  const groups = [];
  rawStandings.forEach(block => {
    if (block.type && block.type !== 'TOTAL') return;
    if (!Array.isArray(block.table) || !block.table.length) return;
    if (!block.group) return;
    const groupLetter = String(block.group).replace(/^GROUP_/i, '');
    const table = block.table.map(row => ({
      position:  row.position,
      team: {
        id:    row.team && row.team.id,
        name:  row.team && (row.team.name || row.team.shortName),
        tla:   row.team && row.team.tla,
        crest: row.team && (row.team.crest || '')
      },
      playedGames:    row.playedGames,
      won:            row.won,
      draw:           row.draw,
      lost:           row.lost,
      points:         row.points,
      goalsFor:       row.goalsFor,
      goalsAgainst:   row.goalsAgainst,
      goalDifference: row.goalDifference,
      form: (row.form || '').replace(/,/g, '')
    }));
    groups.push({ group: groupLetter, table });
  });

  /* ===== 2. Scorers ===== */
  console.log(`  → /competitions/${COMP}/scorers`);
  const scoRes = await callAPI(`/competitions/${COMP}/scorers?limit=20`);
  const scorers = (scoRes.scorers || []).map(s => ({
    player:        (s.player && s.player.name) || '?',
    team:          (s.team && (s.team.shortName || s.team.name)) || '?',
    teamCrest:     (s.team && s.team.crest) || '',
    goals:         s.goals || 0,
    assists:       s.assists,
    penalties:     s.penalties,
    playedMatches: s.playedMatches || 0
  }));

  console.log(`  · ${groups.length} grupos · ${scorers.length} goleadores`);

  const out = {
    generated_at: new Date().toISOString(),
    source: 'football-data.org',
    competition: COMP,
    season: SEASON,
    groups,
    scorers
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
