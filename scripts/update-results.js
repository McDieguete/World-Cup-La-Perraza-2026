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
const { FOOTBALL_DATA_STAGE_TO_ROUND, computeGroupStandings, pickBestThirds } = require('./scoring');

const API_BASE   = 'https://api.football-data.org/v4';
const KEY        = process.env.FOOTBALL_DATA_KEY;
const COMP       = process.env.FOOTBALL_DATA_COMPETITION || 'WC';
const SEASON     = process.env.FOOTBALL_DATA_SEASON || '2026';
const DRY_RUN    = process.env.DRY_RUN === '1';

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

/* Versión resiliente: prueba name, luego shortName, luego TLA.
   football-data.org devuelve los 3 campos por equipo. Si name varía
   entre temporadas, tla siempre es estable (código FIFA de 3 letras). */
function apiTeamToEs(team) {
  if (!team) return null;
  return apiToEs(team.name)
      || apiToEs(team.shortName)
      || apiToEs(team.tla)
      || null;
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
  const round = FOOTBALL_DATA_STAGE_TO_ROUND[apiMatch.stage];
  if (!round) {
    log.unknownStages.add(apiMatch.stage);
    return false;
  }

  const sc = apiMatch.score && apiMatch.score.fullTime;
  const finished = apiMatch.status === 'FINISHED' && sc && sc.home != null && sc.away != null;
  if (apiMatch.status === 'FINISHED' && !finished) {
    log.finishedNoScore.push(`${apiMatch.homeTeam && apiMatch.homeTeam.name} vs ${apiMatch.awayTeam && apiMatch.awayTeam.name} (stage=${apiMatch.stage})`);
  }

  const home = apiTeamToEs(apiMatch.homeTeam);
  const away = apiTeamToEs(apiMatch.awayTeam);
  const unknownTeams = () => {
    const ht = apiMatch.homeTeam || {};
    const at = apiMatch.awayTeam || {};
    log.unknownTeams.add(
      `${ht.name || '?'} [shortName="${ht.shortName||''}" tla="${ht.tla||''}"]` +
      ` vs ${at.name || '?'} [shortName="${at.shortName||''}" tla="${at.tla||''}"]`
    );
  };

  // ----- Fase de grupos: solo FINISHED, igual que siempre -----
  if (round === 'group') {
    if (!finished) return false;
    if (!home || !away) { unknownTeams(); return false; }
    return applyGroupMatch(D, home, away, `${sc.home}-${sc.away}`, log);
  }

  // ----- Eliminatorias -----
  let changed = false;

  // a) Calendario para mostrar (DATA.ko_bracket): en cuanto la API publique el
  //    cruce (equipos conocidos), aunque el partido aún no se haya jugado.
  //    Los equipos por definir (homeTeam/awayTeam null en la API) se quedan como
  //    placeholder hasta que se sepan.
  if (home && away) {
    changed = recordKoFixture(D, round, home, away, finished ? sc : null, apiMatch.utcDate, apiMatch.status, log) || changed;
  } else if (finished) {
    unknownTeams();
  }

  // b) Puntuación (DATA.ko_results): solo partidos FINISHED, comportamiento intacto.
  if (finished) {
    if (!home || !away) { unknownTeams(); }
    else changed = applyKoMatch(D, round, home, away, sc.home, sc.away, apiMatch.utcDate, log) || changed;
  }

  return changed;
}

function applyGroupMatch(D, home, away, result, log) {
  for (const [date, matches] of Object.entries(D.matchdays || {})) {
    for (const mc of matches) {
      // Caso 1: home/away coinciden con la orientación del dataset
      if (mc.home === home && mc.away === away) {
        if (mc.result_manual) {
          log.manualLocked.push(`${date} ${mc.home}-${mc.away}: manual=${mc.result} (API: ${result}) — no sobrescribo`);
          return false;
        }
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
        if (mc.result_manual) {
          log.manualLocked.push(`${date} ${mc.home}-${mc.away}: manual=${mc.result} (API: ${flipped}) — no sobrescribo`);
          return false;
        }
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
 *  Sólo se llama cuando ya están jugados los 72.
 *  Comparte la lógica de clasificación con recompute.js vía scoring.js. */
function computeR32(D) {
  const groups = computeGroupStandings(D);
  const r32 = [];
  Object.keys(groups).sort().forEach(letter => {
    const arr = groups[letter].standings;
    if (arr[0]) r32.push(arr[0].team);
    if (arr[1]) r32.push(arr[1].team);
  });
  pickBestThirds(groups, 8).forEach(t => r32.push(t));
  return r32;
}

/* ===== Calendario de eliminatorias para mostrar (DATA.ko_bracket) =====
   ko_bracket es el esqueleto estático del cuadro (num, round, date, home, away
   donde home/away son referencias tipo "1A"/"2B"/"3ABCDF"/"W74"/"L101").
   Aquí lo "rellenamos" con los equipos y marcadores reales que va publicando
   football-data.org, sin tocar ko_results (que es lo que puntúa). */

/** Fecha/hora en horario de España a partir del utcDate de la API. */
function madridParts(iso) {
  if (!iso) return { date: null, time: null };
  const d = new Date(iso);
  if (isNaN(d.getTime())) return { date: null, time: null };
  const date = d.toLocaleDateString('en-CA', { timeZone: 'Europe/Madrid' });        // YYYY-MM-DD
  const time = d.toLocaleTimeString('es-ES', { timeZone: 'Europe/Madrid', hour: '2-digit', minute: '2-digit', hour12: false });
  return { date, time };
}

/** Ganador/perdedor de un partido KO según lo ya resuelto en ko_bracket. */
function koOutcomeBracket(D, num, which) {
  const e = (D.ko_bracket || []).find(x => x.num === num);
  if (!e || !e.result || !e.home_team || !e.away_team) return null;
  const m = String(e.result).match(/^(-?\d+)-(-?\d+)$/);
  if (!m) return null;
  const gh = +m[1], ga = +m[2];
  if (gh === ga) return null;                       // sin desempate cargado, no resolvemos
  if (which === 'L') return gh > ga ? e.away_team : e.home_team;
  return gh > ga ? e.home_team : e.away_team;
}

/** Equipo concreto de una referencia de slot, si ya se conoce; si no, null. */
function slotTeam(D, ref, standings) {
  let m;
  if ((m = String(ref).match(/^([12])([A-L])$/))) {
    const g = standings[m[2]];
    return (g && g.complete && g.standings[+m[1] - 1]) ? g.standings[+m[1] - 1].team : null;
  }
  if (/^3/.test(ref)) return null;                  // mejor 3º: solo se sabe vía API
  if ((m = String(ref).match(/^W(\d+)$/))) return koOutcomeBracket(D, +m[1], 'W');
  if ((m = String(ref).match(/^L(\d+)$/))) return koOutcomeBracket(D, +m[1], 'L');
  return ref;                                       // ya es un nombre literal
}

/** Casa un cruce real de la API contra la entrada del bracket que le corresponde,
 *  anclando por el lado ya resoluble (1º/2º de grupo o ganador de partido previo). */
function recordKoFixture(D, round, home, away, scOrNull, dt, status, log) {
  if (!Array.isArray(D.ko_bracket)) return false;
  const standings = computeGroupStandings(D);
  const apiSet = new Set([home, away]);

  for (const e of D.ko_bracket) {
    if (e.round !== round) continue;
    const rh = e.home_team || slotTeam(D, e.home, standings);
    const ra = e.away_team || slotTeam(D, e.away, standings);

    // El cruce de la API debe ser consistente con lo ya resuelto y anclar en ≥1 lado.
    const consistent = (rh == null || apiSet.has(rh)) && (ra == null || apiSet.has(ra)) && (rh != null || ra != null);
    if (!consistent) continue;

    let newHome, newAway;
    if (rh != null && apiSet.has(rh)) { newHome = rh; newAway = (home === rh ? away : home); }
    else { newAway = ra; newHome = (home === ra ? away : home); }

    let newResult = e.result || null;
    if (scOrNull) newResult = (newHome === home) ? `${scOrNull.home}-${scOrNull.away}` : `${scOrNull.away}-${scOrNull.home}`;

    const { date, time } = madridParts(dt);
    const nextDate = date || e.date;
    const nextTime = time || e.time || null;

    if (e.home_team === newHome && e.away_team === newAway && e.result === (newResult || e.result) &&
        e.status === status && e.date === nextDate && (e.time || null) === nextTime) {
      return false;                                 // sin cambios
    }
    e.home_team = newHome;
    e.away_team = newAway;
    if (newResult) e.result = newResult;
    e.status = status;
    if (nextDate) e.date = nextDate;
    if (nextTime) e.time = nextTime;
    log.koChanged.push(`bracket ${round} p${e.num}: ${newHome} vs ${newAway}${newResult ? ` (${newResult})` : ''} [${status}]`);
    return true;
  }
  return false;
}

/** Clave de la combinación de los 8 mejores terceros (grupos, alfabético). */
function thirdsKeyCron(standings) {
  if (!Object.values(standings).every(g => g.complete)) return null;
  const teamGroup = {};
  Object.entries(standings).forEach(([L, g]) => g.standings.forEach(r => { teamGroup[r.team] = L; }));
  const thirds = pickBestThirds(standings, 8);
  if (thirds.length < 8) return null;
  return thirds.map(t => teamGroup[t]).sort().join('');
}

/** Tercero real que enfrenta al cabeza de serie local `hostRef` (p. ej. "1E")
 *  según DATA.thirds_alloc (tabla oficial FIFA). */
function resolveThirdCron(D, hostRef, standings, key) {
  const alloc = D.thirds_alloc;
  if (!alloc || !key) return null;
  const row = alloc.map[key];
  if (!row) return null;
  const idx = alloc.order.indexOf(hostRef);
  if (idx < 0) return null;
  const g = standings[row[idx]];
  return (g && g.complete && g.standings[2]) ? g.standings[2].team : null;
}

/** Propaga al bracket los equipos ya deducibles (1º/2º de grupos cerrados, mejor
 *  3º vía la tabla de combinaciones, y ganadores/perdedores de partidos ya
 *  resueltos), aunque la API no haya publicado todavía ese cruce.
 *  Varias pasadas: Wn depende de la ronda previa. */
function resolveKoBracket(D, log) {
  if (!Array.isArray(D.ko_bracket)) return false;
  const standings = computeGroupStandings(D);
  const tkey = thirdsKeyCron(standings);
  let changed = false;
  const resolveSide = (e, side) => {
    if (e[side + '_team']) return;
    const ref = e[side];
    let t = null;
    if (/^3[A-L]+$/.test(ref)) {
      const other = e[side === 'home' ? 'away' : 'home'];
      if (/^1[A-L]$/.test(other)) t = resolveThirdCron(D, other, standings, tkey);
    } else {
      t = slotTeam(D, ref, standings);
    }
    if (t) { e[side + '_team'] = t; changed = true; }
  };
  for (let pass = 0; pass < 4; pass++) {
    for (const e of D.ko_bracket) { resolveSide(e, 'home'); resolveSide(e, 'away'); }
  }
  if (changed) log.qualifChanged.push('ko_bracket: equipos deducibles propagados');
  return changed;
}

/* ===== Main ===== */

async function main() {
  if (!KEY) {
    console.error('ERROR: FOOTBALL_DATA_KEY no está definido. Configúralo como secret en GitHub o como variable de entorno local.');
    process.exit(2);
  }
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
    manualLocked:    [],
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
  if (resolveKoBracket(D, log)) touched = true;

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
  if (log.manualLocked.length) {
    console.log('  🔒 Resultados bloqueados manualmente (result_manual: true) — la API no los pisa:');
    log.manualLocked.forEach(l => console.log('    · ' + l));
  }
}

if (require.main === module) {
  main().catch(err => {
    console.error('ERROR:', err.message || err);
    process.exit(1);
  });
}

module.exports = {
  applyMatch, applyGroupMatch, applyKoMatch,
  recordKoFixture, resolveKoBracket, slotTeam, koOutcomeBracket, madridParts,
  deriveQualifiers, computeR32
};
