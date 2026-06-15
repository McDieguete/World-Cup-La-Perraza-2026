/* ===========================================================
   update-results.js — Fetch a football-data.org → js/data.js
   --------------------------------------------------------------
   1. Lee js/data.js.
   2. Pide a football-data.org los partidos del Mundial 2026.
   3. Para cada partido FINISHED:
        · Si es de grupos: actualiza DATA.matchdays[fecha][i].result.
        · Si es eliminatoria: añade/actualiza entry en DATA.ko_results.
        · Si cierra una ronda KO: deriva DATA.actual_qualifiers[ronda+1].
        · Si se acabó la fase de grupos: deriva actual_qualifiers.r32.
   4. Llama a recompute() (refresca clasif.series, last_day, result_exact).
   5. Sobrescribe js/data.js sólo si hubo cambios.
   6. Sale con código 0 (también si no hay cambios — el workflow detecta
      la modificación con `git diff --quiet`).

   Variables de entorno:
     FOOTBALL_DATA_KEY        (obligatoria, X-Auth-Token)
     FOOTBALL_DATA_COMPETITION (opcional, por defecto "WC")
     FOOTBALL_DATA_SEASON      (opcional, por defecto "2026")
     DRY_RUN=1                 (opcional, no escribe ni hace commit)

   Uso local:
     FOOTBALL_DATA_KEY=xxxxx node scripts/update-results.js
   =========================================================== */

'use strict';

const fs   = require('fs');
const path = require('path');

const { readDataJs, writeDataJs } = require('./data-io');
const { recompute } = require('./recompute');
const { FOOTBALL_DATA_STAGE_TO_ROUND } = require('./scoring');

const API_BASE   = 'https://api.football-data.org/v4';
const KEY        = process.env.FOOTBALL_DATA_KEY;
const COMP       = process.env.FOOTBALL_DATA_COMPETITION || 'WC';
const SEASON     = process.env.FOOTBALL_DATA_SEASON || '2026';
const DRY_RUN    = process.env.DRY_RUN === '1';

if (!KEY) {
  console.error('ERROR: FOOTBALL_DATA_KEY no está definido. Configúralo como secret en GitHub o como variable de entorno local.');
  process.exit(2);
}

const TEAM_MAP = JSON.parse(fs.readFileSync(path.join(__dirname, 'team-mapping.json'), 'utf8'));

/* ===== Lookup ES ↔ API ===== */

const TEAM_MAP_LC = {};
Object.entries(TEAM_MAP).forEach(([k, v]) => {
  if (k.startsWith('_')) return;
  TEAM_MAP_LC[k.toLowerCase()] = v;
});

function apiToEs(apiName) {
  if (!apiName) return null;
  if (TEAM_MAP[apiName]) return TEAM_MAP[apiName];
  const lc = apiName.toLowerCase();
  if (TEAM_MAP_LC[lc]) return TEAM_MAP_LC[lc];
  return null;  // desconocido — quien llame decide qué hacer
}

/* ===== Fetch ===== */

async function fetchMatches() {
  const url = `${API_BASE}/competitions/${COMP}/matches?season=${SEASON}`;
  const res = await fetch(url, { headers: { 'X-Auth-Token': KEY } });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`football-data.org devolvió ${res.status} ${res.statusText}: ${body.slice(0, 200)}`);
  }
  const data = await res.json();
  return data.matches || [];
}

/* ===== Aplicación de resultados al DATA ===== */

function applyMatch(D, apiMatch, log) {
  if (apiMatch.status !== 'FINISHED') return false;
  const sc = apiMatch.score && apiMatch.score.fullTime;
  if (!sc || sc.home == null || sc.away == null) {
    log.finishedNoScore.push(`${apiMatch.homeTeam && apiMatch.homeTeam.name} vs ${apiMatch.awayTeam && apiMatch.awayTeam.name} (stage=${apiMatch.stage})`);
    return false;
  }

  const home = apiToEs(apiMatch.homeTeam && apiMatch.homeTeam.name);
  const away = apiToEs(apiMatch.awayTeam && apiMatch.awayTeam.name);
  if (!home || !away) {
    log.unknownTeams.add(`${apiMatch.homeTeam && apiMatch.homeTeam.name} vs ${apiMatch.awayTeam && apiMatch.awayTeam.name}`);
    return false;
  }

  const round = FOOTBALL_DATA_STAGE_TO_ROUND[apiMatch.stage];
  if (!round) {
    log.unknownStages.add(apiMatch.stage);
    return false;
  }
  const result = `${sc.home}-${sc.away}`;

  if (round === 'group') {
    return applyGroupMatch(D, home, away, result, log);
  }
  return applyKoMatch(D, round, home, away, sc.home, sc.away, apiMatch.utcDate, log);
}

function applyGroupMatch(D, home, away, result, log) {
  for (const [date, matches] of Object.entries(D.matchdays || {})) {
    for (const mc of matches) {
      // Caso 1: home/away coinciden con la orientación del dataset
      if (mc.home === home && mc.away === away) {
        if (mc.result === result) return false;
        log.groupChanged.push(`${date} ${home} ${result} ${away} (antes: "${mc.result || '—'}")`);
        mc.result = result;
        return true;
      }
      // Caso 2: API devuelve los equipos invertidos respecto al dataset.
      // Invertimos el marcador para preservar la perspectiva home/away del dataset.
      if (mc.home === away && mc.away === home) {
        const [gh, ga] = result.split('-').map(Number);
        const flipped = `${ga}-${gh}`;
        if (mc.result === flipped) return false;
        log.groupChanged.push(`${date} ${mc.home} ${flipped} ${mc.away} (API lo dio invertido: ${home} ${result} ${away}; antes: "${mc.result || '—'}")`);
        mc.result = flipped;
        return true;
      }
    }
  }
  log.unmatchedGroup.push(`${home} vs ${away} (${result})`);
  return false;
}

function applyKoMatch(D, round, home, away, gh, ga, dt, log) {
  if (!Array.isArray(D.ko_results)) D.ko_results = [];
  // idempotente: si ya hay una entrada con misma ronda + enfrentamiento (en cualquier orden), la actualizamos
  for (const ko of D.ko_results) {
    if (ko.round === round &&
        ((ko.home === home && ko.away === away) || (ko.home === away && ko.away === home))) {
      // alinear sentido home/away al de la API
      if (ko.home === home && ko.away === away && ko.gh === gh && ko.ga === ga) return false;
      ko.home = home; ko.away = away; ko.gh = gh; ko.ga = ga; ko.dt = dt || ko.dt;
      log.koChanged.push(`${round}: ${home} ${gh}-${ga} ${away}`);
      return true;
    }
  }
  D.ko_results.push({ round, home, away, gh, ga, dt: dt || null });
  log.koChanged.push(`${round} (nuevo): ${home} ${gh}-${ga} ${away}`);
  return true;
}

/* ===== Derivación de clasificados por ronda ===== */

function deriveQualifiers(D, log) {
  if (!D.actual_qualifiers) D.actual_qualifiers = {};
  let changed = false;

  // 1) r32 (clasificados a 1/16) — sólo si terminó la fase de grupos
  const totalGroup = (D.gp_matches || []).length;
  const playedGroup = Object.values(D.matchdays || {})
    .flat().filter(m => m.result && (D.gp_matches || []).some(g => g.name === m.name)).length;
  if (totalGroup > 0 && playedGroup >= totalGroup) {
    const r32 = computeR32(D);
    changed = setIfDifferent(D.actual_qualifiers, 'r32', r32, log, 'qualif.r32') || changed;
  }

  // 2) Para cada ronda KO: si tenemos todos los enfrentamientos jugados,
  //    los ganadores son los clasificados a la siguiente ronda.
  const rounds = [
    { round: 'r32',        expected: 16, advancesTo: 'r16',        next: 'r16'        },
    { round: 'r16',        expected:  8, advancesTo: 'qf',         next: 'qf'         },
    { round: 'quarters',   expected:  4, advancesTo: 'sf',         next: 'sf'         },
    { round: 'semis',      expected:  2, advancesTo: 'final',      next: 'final',
      losersTo: 'thirdPlace' },
  ];
  rounds.forEach(({ round, expected, next, losersTo }) => {
    const ms = (D.ko_results || []).filter(k => k.round === round && k.gh != null && k.ga != null);
    if (ms.length < expected) return;
    const winners = ms.map(m => m.gh > m.ga ? m.home : (m.gh < m.ga ? m.away : null)).filter(Boolean);
    if (winners.length === expected) {
      changed = setIfDifferent(D.actual_qualifiers, next, winners, log, `qualif.${next}`) || changed;
    }
    if (losersTo) {
      const losers = ms.map(m => m.gh > m.ga ? m.away : (m.gh < m.ga ? m.home : null)).filter(Boolean);
      if (losers.length === expected) {
        changed = setIfDifferent(D.actual_qualifiers, losersTo, losers, log, `qualif.${losersTo}`) || changed;
      }
    }
  });

  // 3) Premios podio derivables del KO terminado
  const finalKo = (D.ko_results || []).find(k => k.round === 'final' && k.gh != null && k.ga != null);
  const thirdKo = (D.ko_results || []).find(k => k.round === 'thirdPlace' && k.gh != null && k.ga != null);
  if (finalKo) {
    const champ = finalKo.gh > finalKo.ga ? finalKo.home : (finalKo.gh < finalKo.ga ? finalKo.away : null);
    const runner = champ === finalKo.home ? finalKo.away : finalKo.home;
    if (!D.actual_awards) D.actual_awards = {};
    if (champ && D.actual_awards.champion !== champ) {
      D.actual_awards.champion = champ; changed = true; log.awardsChanged.push(`champion: ${champ}`);
    }
    if (runner && D.actual_awards.runnerup !== runner) {
      D.actual_awards.runnerup = runner; changed = true; log.awardsChanged.push(`runnerup: ${runner}`);
    }
  }
  if (thirdKo) {
    const third = thirdKo.gh > thirdKo.ga ? thirdKo.home : (thirdKo.gh < thirdKo.ga ? thirdKo.away : null);
    if (!D.actual_awards) D.actual_awards = {};
    if (third && D.actual_awards.third !== third) {
      D.actual_awards.third = third; changed = true; log.awardsChanged.push(`third: ${third}`);
    }
  }

  return changed;
}

function setIfDifferent(obj, key, value, log, label) {
  const prev = obj[key];
  if (Array.isArray(prev) && Array.isArray(value) &&
      prev.length === value.length && prev.every((v, i) => v === value[i])) return false;
  obj[key] = value;
  log.qualifChanged.push(`${label} (${value.length} equipos)`);
  return true;
}

/** Calcula los 32 clasificados de la fase de grupos:
 *    · top 2 de cada uno de los 12 grupos = 24
 *    · 8 mejores 3os
 *  Sólo se llama cuando ya están jugados los 72. */
function computeR32(D) {
  const standings = {}; // group letter → [{team, pts, gd, gf}]
  // Para cada grupo, los 4 equipos. Necesitamos partidos jugados ↔ qué grupo.
  // Cada partido en matchdays.name está también en gp_matches con group "A1".
  const groupOfMatch = {};
  const groupOfTeam = {};
  (D.gp_matches || []).forEach(g => {
    const letter = String(g.group || '').replace(/[0-9]/g, '');
    groupOfMatch[g.name] = letter;
    const [a, b] = g.name.split('-').map(s => s.trim());
    groupOfTeam[a] = letter;
    groupOfTeam[b] = letter;
  });

  Object.values(D.matchdays || {}).flat().forEach(m => {
    const g = groupOfMatch[m.name];
    if (!g) return;
    const sc = (m.result || '').match(/^(-?\d+)-(-?\d+)$/);
    if (!sc) return;
    const gh = +sc[1], ga = +sc[2];
    addResult(standings, g, m.home, gh, ga);
    addResult(standings, g, m.away, ga, gh);
  });

  // Top 2 de cada grupo
  const groups = Object.keys(standings).sort();
  const top2 = [];
  const thirds = [];
  groups.forEach(g => {
    const arr = standings[g].sort(cmpTeam);
    if (arr[0]) top2.push(arr[0].team);
    if (arr[1]) top2.push(arr[1].team);
    if (arr[2]) thirds.push(arr[2]);
  });
  // 8 mejores 3os
  thirds.sort(cmpTeam);
  thirds.slice(0, 8).forEach(t => top2.push(t.team));
  return top2;
}

function addResult(st, group, team, gf, ga) {
  if (!st[group]) st[group] = [];
  let row = st[group].find(r => r.team === team);
  if (!row) { row = { team, pts: 0, gd: 0, gf: 0 }; st[group].push(row); }
  row.gf += gf;
  row.gd += gf - ga;
  if (gf > ga) row.pts += 3;
  else if (gf === ga) row.pts += 1;
}

function cmpTeam(a, b) {
  return b.pts - a.pts || b.gd - a.gd || b.gf - a.gf || a.team.localeCompare(b.team, 'es');
}

/* ===== Main ===== */

async function main() {
  console.log(`> Cargando ${path.relative(process.cwd(), require('./data-io').DATA_PATH)}`);
  const D = readDataJs();

  console.log(`> Pidiendo /competitions/${COMP}/matches?season=${SEASON}`);
  const matches = await fetchMatches();
  console.log(`  recibidos ${matches.length} partidos`);

  // Resumen por status — útil para diagnosticar si la API aún no marca FINISHED
  const byStatus = {};
  const byStage  = {};
  matches.forEach(m => {
    byStatus[m.status || '?'] = (byStatus[m.status || '?'] || 0) + 1;
    if (m.status === 'FINISHED') byStage[m.stage || '?'] = (byStage[m.stage || '?'] || 0) + 1;
  });
  console.log(`  por status: ${Object.entries(byStatus).map(([k,v])=>`${k}=${v}`).join(', ')}`);
  if (byStatus.FINISHED) {
    console.log(`  FINISHED por stage: ${Object.entries(byStage).map(([k,v])=>`${k}=${v}`).join(', ')}`);
  }

  const log = {
    groupChanged:    [],
    koChanged:       [],
    qualifChanged:   [],
    awardsChanged:   [],
    unmatchedGroup:  [],
    finishedNoScore: [],
    unknownTeams:    new Set(),
    unknownStages:   new Set()
  };

  // Diagnóstico: lista de partidos FINISHED tal cual los devuelve la API.
  // Aparece SIEMPRE en el log del workflow, así futuras sorpresas se ven a la primera.
  const finished = matches.filter(m => m.status === 'FINISHED');
  if (finished.length) {
    console.log(`  partidos FINISHED en la API (${finished.length}):`);
    finished.forEach(m => {
      const h = (m.homeTeam && m.homeTeam.name) || '?';
      const a = (m.awayTeam && m.awayTeam.name) || '?';
      const ft = m.score && m.score.fullTime;
      const r = ft ? `${ft.home}-${ft.away}` : '(sin marcador)';
      console.log(`    · [${m.stage}] ${h} ${r} ${a}`);
    });
  }

  let touched = false;
  matches.forEach(m => { if (applyMatch(D, m, log)) touched = true; });
  if (deriveQualifiers(D, log)) touched = true;

  // SIEMPRE recomputamos: aun sin partidos nuevos podrías haber editado scoring.js
  recompute(D);

  // Imprime informe
  printReport(log);

  if (DRY_RUN) {
    console.log('> DRY_RUN=1 — no se escribe nada.');
    return;
  }
  const wrote = writeDataJs(D);
  console.log(wrote ? '> js/data.js actualizado.' : '> js/data.js sin cambios.');
}

function printReport(log) {
  if (log.groupChanged.length) {
    console.log('  Partidos de grupos actualizados:');
    log.groupChanged.forEach(l => console.log('    · ' + l));
  }
  if (log.koChanged.length) {
    console.log('  KO:');
    log.koChanged.forEach(l => console.log('    · ' + l));
  }
  if (log.qualifChanged.length) {
    console.log('  Clasificados recalculados:');
    log.qualifChanged.forEach(l => console.log('    · ' + l));
  }
  if (log.awardsChanged.length) {
    console.log('  Premios derivados:');
    log.awardsChanged.forEach(l => console.log('    · ' + l));
  }
  if (log.unmatchedGroup.length) {
    console.log('  ⚠ Partidos de grupos sin match en DATA.matchdays (revisa team-mapping.json):');
    log.unmatchedGroup.forEach(l => console.log('    · ' + l));
  }
  if (log.unknownTeams.size) {
    console.log('  ⚠ Equipos no reconocidos por team-mapping.json:');
    [...log.unknownTeams].forEach(l => console.log('    · ' + l));
  }
  if (log.unknownStages.size) {
    console.log('  ⚠ Stages desconocidos por scoring.js (FOOTBALL_DATA_STAGE_TO_ROUND):');
    [...log.unknownStages].forEach(l => console.log('    · ' + l));
  }
  if (log.finishedNoScore.length) {
    console.log('  ⚠ Partidos FINISHED sin marcador en la API (probable bug del proveedor):');
    log.finishedNoScore.forEach(l => console.log('    · ' + l));
  }
}

main().catch(err => {
  console.error('ERROR:', err.message || err);
  process.exit(1);
});
