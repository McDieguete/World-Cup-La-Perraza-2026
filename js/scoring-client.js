/* ===========================================================
   scoring-client.js — Reglas de puntuación versión navegador
   --------------------------------------------------------------
   Mismo baremo que scripts/scoring.js (que vive en Node y lo usa
   el bot del workflow). Lo replicamos aquí para poder calcular
   los puntos por porrista/partido en el cliente sin tener que
   levantar un servidor.
   Si cambias el baremo en uno, cámbialo en el otro.
   =========================================================== */

'use strict';

const SC_ROUND_POINTS = {
  group:      { signo: 1, diferencia: 1, exacto: 3 },
  r32:        { signo: 2, diferencia: 2, exacto: 3 },
  r16:        { signo: 2, diferencia: 2, exacto: 3 },
  quarters:   { signo: 3, diferencia: 3, exacto: 5 },
  semis:      { signo: 4, diferencia: 4, exacto: 5 },
  thirdPlace: { signo: 5, diferencia: 6, exacto: 7 },
  final:      { signo: 5, diferencia: 6, exacto: 7 }
};

function scParsePred(raw) {
  if (!raw || typeof raw !== 'string') return null;
  const m = raw.match(/^([1X2])\|(-?\d+)-(-?\d+)$/);
  return m ? { signo: m[1], gh: +m[2], ga: +m[3] } : null;
}

function scParseScore(s) {
  if (!s || typeof s !== 'string') return null;
  const m = s.match(/^(-?\d+)-(-?\d+)$/);
  return m ? { gh: +m[1], ga: +m[2] } : null;
}

function scScoreSign({ gh, ga }) {
  return gh > ga ? '1' : (gh < ga ? '2' : 'X');
}

/* Puntos del pronóstico (acumulativos): signo + diferencia + exacto.
   Diferencia y exacto sólo cuentan si el signo es correcto. ×3 si triple. */
function scPredictionPoints(round, pred, actual, triple) {
  if (!pred || !actual) return 0;
  const cfg = SC_ROUND_POINTS[round];
  if (!cfg) return 0;
  let pts = 0;
  if (pred.signo === scScoreSign(actual)) {
    pts += cfg.signo;
    if ((pred.gh - pred.ga) === (actual.gh - actual.ga)) pts += cfg.diferencia;
    if (pred.gh === actual.gh && pred.ga === actual.ga) pts += cfg.exacto;
  }
  return triple ? pts * 3 : pts;
}

/* ===========================================================
   Desglose completo de puntos por porrista (espejo de
   scripts/recompute.js). Permite que "Mis resultados" muestre,
   además de los puntos por partido, los de equipos clasificados
   y posición exacta de grupo — y de forma retroactiva, en el
   mismo día/fase en que recompute.js los otorga.
   Si cambias el baremo o el timing en recompute.js, cámbialo aquí.
   =========================================================== */

const SC_QUALIFIER_POINTS = { r32: 10, r16: 15, qf: 20, sf: 30, thirdPlace: 40, final: 50 };
const SC_POSITION_POINTS  = { 1: 5, 2: 5, 3: 5, 4: 5 };
const SC_AWARD_POINTS = {
  champion: 60, runnerup: 50, third: 40,
  balon_oro: 20, balon_plata: 15, balon_bronce: 10,
  bota_oro: 20, bota_plata: 15, bota_bronce: 10
};
const SC_PHASE_KEY = {
  r32: 'ph_1/16', r16: 'ph_1/8', quarters: 'ph_1/4',
  semis: 'ph_Semis', thirdPlace: 'ph_3º y 4º', final: 'ph_Final'
};
/* Qué ronda KO confirma cada lista de "equipo clasificado a X". */
function scPhaseForQualifier(key) {
  return ({ r16: 'r32', qf: 'r16', sf: 'quarters', thirdPlace: 'semis', final: 'semis' })[key];
}

/* Clasificación de cada grupo a partir de los resultados cargados.
   Mismo criterio que scripts/scoring.js (pts → dif → GF → alfabético). */
function scComputeGroupStandings(DATA) {
  const groupOfMatch = {}, meta = {};
  (DATA.gp_matches || []).forEach(g => {
    const letter = String(g.group || '').replace(/[0-9]/g, '');
    groupOfMatch[g.name] = letter;
    if (!meta[letter]) meta[letter] = { expected: 0, played: 0, lastDate: null, st: {} };
    meta[letter].expected++;
  });
  const add = (st, team, gf, ga) => {
    const row = st[team] || (st[team] = { team, pts: 0, gd: 0, gf: 0 });
    row.gf += gf; row.gd += gf - ga;
    if (gf > ga) row.pts += 3; else if (gf === ga) row.pts += 1;
  };
  Object.entries(DATA.matchdays || {}).forEach(([date, matches]) => matches.forEach(m => {
    const letter = groupOfMatch[m.name];
    if (!letter) return;
    const sc = (m.result || '').match(/^(-?\d+)-(-?\d+)$/);
    if (!sc) return;
    const md = meta[letter];
    md.played++;
    if (!md.lastDate || date > md.lastDate) md.lastDate = date;
    add(md.st, m.home, +sc[1], +sc[2]);
    add(md.st, m.away, +sc[2], +sc[1]);
  }));
  const cmp = (a, b) => b.pts - a.pts || b.gd - a.gd || b.gf - a.gf || a.team.localeCompare(b.team, 'es');
  const out = {};
  Object.entries(meta).forEach(([letter, md]) => {
    out[letter] = {
      expected: md.expected, played: md.played,
      complete: md.expected > 0 && md.played >= md.expected,
      lastDate: md.lastDate,
      standings: Object.values(md.st).sort(cmp)
    };
  });
  return out;
}

function scPickBestThirds(gs, n) {
  const cmp = (a, b) => b.pts - a.pts || b.gd - a.gd || b.gf - a.gf || a.team.localeCompare(b.team, 'es');
  const thirds = [];
  Object.values(gs).forEach(g => { if (g.standings[2]) thirds.push(g.standings[2]); });
  return thirds.sort(cmp).slice(0, n).map(r => r.team);
}

/* Empareja la predicción KO del porrista con un partido KO real `ko`
   (mismo cruce en cualquier orden). Espejo de recompute.js. */
function scMatchKoPrediction(p, ko) {
  if (!p.bets || !Array.isArray(p.bets.ko)) return null;
  const a = ko.home, b = ko.away;
  for (const k of p.bets.ko) {
    if (!k || !k.match) continue;
    const m = k.match.split('-');
    if (m.length !== 2) continue;
    const [h, w] = m.map(s => s.trim());
    if ((h === a && w === b) || (h === b && w === a)) {
      if (h === a) return { signo: k.signo, gh: k.gh, ga: k.ga };
      const flip = k.signo === '1' ? '2' : (k.signo === '2' ? '1' : 'X');
      return { signo: flip, gh: k.ga, ga: k.gh };
    }
  }
  return null;
}

/**
 * Desglose por porrista: para cada clave de DATA.clasif.day_keys (días de
 * grupos + buckets de fase ph_*), la lista de conceptos puntuados y su subtotal.
 * El total coincide con DATA.clasif.series[player] (misma lógica que recompute.js).
 * Tipos de item: gpmatch | komatch | position | qualifier | award.
 */
function scComputePlayerBreakdown(DATA, p) {
  const dayKeys = DATA.clasif.day_keys;
  const byKey = {};
  dayKeys.forEach(k => { byKey[k] = { items: [], subtotal: 0 }; });
  const add = (key, item) => { if (!byKey[key]) return; byKey[key].items.push(item); byKey[key].subtotal += item.pts; };

  const gpIdxByName = {};
  (DATA.gp_matches || []).forEach((g, i) => { gpIdxByName[g.name] = i; });

  // 1) Fase de grupos: puntos por partido (en su fecha real)
  Object.entries(DATA.matchdays || {}).forEach(([dateKey, matches]) => {
    if (!byKey[dateKey]) return;
    matches.forEach(mc => {
      const gpIdx = gpIdxByName[mc.name];
      if (gpIdx == null) return;
      const pred = scParsePred(p.bets && p.bets.gp ? p.bets.gp[gpIdx] : null);
      const actual = scParseScore(mc.result);
      const pts = scPredictionPoints('group', pred, actual, !!mc.triple);
      add(dateKey, { kind: 'gpmatch', mc, pred, actual, pts });
    });
  });

  // 2) Eliminatorias: puntos por partido (en su bucket de fase)
  (DATA.ko_results || []).forEach(ko => {
    const phase = SC_PHASE_KEY[ko.round];
    if (!byKey[phase]) return;
    const actual = { gh: +ko.gh, ga: +ko.ga };
    if (!Number.isFinite(actual.gh) || !Number.isFinite(actual.ga)) return;
    const pred = scMatchKoPrediction(p, ko);
    const pts = scPredictionPoints(ko.round, pred, actual, false);
    add(phase, { kind: 'komatch', round: ko.round, home: ko.home, away: ko.away, result: `${ko.gh}-${ko.ga}`, pred, pts });
  });

  // 2b) Cruces KO firmados por el porrista (su propio cuadro) que AÚN no se han
  //     jugado → se muestran como pendientes (0 pts) en su ronda. bets.ko va
  //     ordenado por ronda: 16 (1/16) + 8 (1/8) + 4 (1/4) + 2 (semis) + 1 (3º) + 1 (final).
  const koPlayed = new Set((DATA.ko_results || []).map(k => [k.home, k.away].sort().join('|')));
  const koRoundByIdx = i => (i < 16 ? 'r32' : i < 24 ? 'r16' : i < 28 ? 'quarters' : i < 30 ? 'semis' : i < 31 ? 'thirdPlace' : 'final');
  ((p.bets && p.bets.ko) || []).forEach((k, i) => {
    if (!k || !k.match) return;
    const parts = k.match.split('-').map(s => s.trim());
    if (parts.length !== 2) return;
    if (koPlayed.has([parts[0], parts[1]].sort().join('|'))) return;   // ya cubierto por komatch
    const round = koRoundByIdx(i);
    const phase = SC_PHASE_KEY[round];
    if (!byKey[phase]) return;
    add(phase, { kind: 'kobet', round, home: parts[0], away: parts[1], pred: { signo: k.signo, gh: k.gh, ga: k.ga }, pts: 0 });
  });

  // 3) Clasificados y posición exacta
  const gs = scComputeGroupStandings(DATA);
  const allGroupsDone = Object.values(gs).every(g => g.complete);
  const groupDates = Object.keys(DATA.matchdays || {}).sort();
  let lastGroupKey = null;
  for (let j = groupDates.length - 1; j >= 0; j--) { if (byKey[groupDates[j]]) { lastGroupKey = groupDates[j]; break; } }

  const addQualifier = (key, round, actualList) => {
    const set = new Set(actualList);
    const picks = (p.bets && p.bets[round]) || [];
    const hits = picks.filter(t => set.has(t));
    if (hits.length) add(key, { kind: 'qualifier', round, teams: hits, pts: hits.length * SC_QUALIFIER_POINTS[round] });
  };

  Object.entries(gs).forEach(([letter, g]) => {
    if (!g.complete || !byKey[g.lastDate]) return;
    const order = g.standings.map(r => r.team);   // [1º,2º,3º,4º] reales
    const pred = p.bets && p.bets.group_standings && p.bets.group_standings[letter];
    if (pred) {
      [0, 1, 2, 3].forEach(i => {
        if (pred[i] && pred[i] === order[i]) add(g.lastDate, { kind: 'position', group: letter, pos: i + 1, team: order[i], pts: SC_POSITION_POINTS[i + 1] });
      });
    }
    addQualifier(g.lastDate, 'r32', order.slice(0, 2));
  });
  if (allGroupsDone && lastGroupKey) addQualifier(lastGroupKey, 'r32', scPickBestThirds(gs, 8));

  ['r16', 'qf', 'sf', 'thirdPlace', 'final'].forEach(round => {
    const phaseKey = SC_PHASE_KEY[scPhaseForQualifier(round)];
    if (!byKey[phaseKey]) return;
    const list = DATA.actual_qualifiers && DATA.actual_qualifiers[round];
    if (list && list.length) {
      addQualifier(phaseKey, round, list);            // ya resuelto: puntos reales
    } else {
      const picks = (p.bets && p.bets[round]) || [];   // pendiente: equipos firmados
      if (picks.length) add(phaseKey, { kind: 'qualbet', round, teams: picks, pts: 0 });
    }
  });

  // 4) Premios (bucket de la final)
  const awards = DATA.actual_awards || {};
  if (byKey['ph_Final']) {
    const aw = (p.bets && p.bets.awards) || {};
    if (awards.champion && p.champion === awards.champion) add('ph_Final', { kind: 'award', label: `🏆 Campeón: ${p.champion}`, pts: SC_AWARD_POINTS.champion });
    if (awards.runnerup && p.runnerup === awards.runnerup) add('ph_Final', { kind: 'award', label: `🥈 Subcampeón: ${p.runnerup}`, pts: SC_AWARD_POINTS.runnerup });
    if (awards.third && p.third === awards.third) add('ph_Final', { kind: 'award', label: `🥉 3º puesto: ${p.third}`, pts: SC_AWARD_POINTS.third });
    [['balon_oro', '🏅 Balón de Oro'], ['balon_plata', '🏅 Balón de Plata'], ['balon_bronce', '🏅 Balón de Bronce'],
     ['bota_oro', '👟 Bota de Oro'], ['bota_plata', '👟 Bota de Plata'], ['bota_bronce', '👟 Bota de Bronce']].forEach(([k, lbl]) => {
      if (awards[k] && aw[k] === awards[k]) add('ph_Final', { kind: 'award', label: `${lbl}: ${aw[k]}`, pts: SC_AWARD_POINTS[k] });
    });
  }

  let total = 0;
  dayKeys.forEach(k => { total += byKey[k].subtotal; });
  return { byKey, total };
}
