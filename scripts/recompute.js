/* ===========================================================
   recompute.js — Recálculo de DATA.clasif.series, result_exact, etc.
   --------------------------------------------------------------
   Toma el objeto DATA tal cual está en js/data.js y, a partir de
   los resultados ya cargados en:
     · DATA.matchdays[date][i].result            (fase de grupos)
     · DATA.ko_results [{round, home, away, gh, ga}]  (eliminatorias)
     · DATA.actual_qualifiers {r32,r16,qf,sf,thirdPlace,final}
     · DATA.actual_awards    {champion,runnerup,third,balon_*,bota_*}
   recompone:
     · DATA.matchdays[date][i].result_exact       (cuántos lo clavaron)
     · DATA.clasif.series[playerName]             (acumulado por día/fase)
     · DATA.clasif.last_day                       (último índice con datos)
     · DATA.clasif.started                        (true si hay algo)

   Es una función pura: mismo DATA in → mismo DATA out (mutado).
   =========================================================== */

'use strict';

const {
  QUALIFIER_POINTS, POSITION_POINTS, AWARD_POINTS, PHASE_KEY,
  parsePred, parseScore, predictionPoints,
  computeGroupStandings, pickBestThirds
} = require('./scoring');

/** Punto de entrada principal. Muta y devuelve el mismo DATA. */
function recompute(DATA) {
  ensureSlots(DATA);

  const dayKeys = DATA.clasif.day_keys;
  const dayLabels = DATA.clasif.day_labels;
  const players = DATA.players;

  // Índice rápido: nombre del partido de grupo → posición en bets.gp
  const gpIdxByName = {};
  (DATA.gp_matches || []).forEach((g, i) => { gpIdxByName[g.name] = i; });

  // delta[playerName][dayIdx] = puntos ganados ESE día/fase
  const delta = {};
  players.forEach(p => { delta[p.name] = new Array(dayKeys.length).fill(0); });

  // -------- 1) Fase de grupos: puntos por partido en su fecha --------
  Object.entries(DATA.matchdays || {}).forEach(([dateKey, matches]) => {
    const dayIdx = dayKeys.indexOf(dateKey);
    if (dayIdx < 0) return;
    matches.forEach(mc => {
      const actual = parseScore(mc.result);
      if (!actual) return;
      const gpIdx = gpIdxByName[mc.name];
      if (gpIdx == null) return;  // partido no es de grupos (no debería pasar con datos limpios)

      let exactCount = 0;
      players.forEach(p => {
        const pred = parsePred(p.bets && p.bets.gp ? p.bets.gp[gpIdx] : null);
        const pts = predictionPoints('group', pred, actual, !!mc.triple);
        if (pts) delta[p.name][dayIdx] += pts;
        if (pred && pred.gh === actual.gh && pred.ga === actual.ga) exactCount++;
      });
      mc.result_exact = exactCount;
    });
  });

  // -------- 2) Eliminatorias: puntos por partido en su fase --------
  //   REGLA: los puntos por partido (1X2, diferencia, exacto) se cuentan SOLO
  //   hasta la prórroga incluida. ko.gh/ko.ga es el marcador a fin de la prórroga
  //   (football-data.org lo da en score.fullTime, SIN los penaltis). La tanda de
  //   penaltis NO suma puntos de partido: sólo decide quién pasa (ko.winner_team,
  //   usado en deriveQualifiers para los puntos de "equipo que avanza").
  (DATA.ko_results || []).forEach(ko => {
    const round = ko.round;
    const phase = PHASE_KEY[round];
    if (!phase) return;
    const phaseIdx = dayKeys.indexOf(phase);
    if (phaseIdx < 0) return;
    const actual = { gh: +ko.gh, ga: +ko.ga };
    if (!Number.isFinite(actual.gh) || !Number.isFinite(actual.ga)) return;

    const triple = koIsTriple(DATA, ko);   // partidos KO marcados ×3 en DATA.ko_bracket
    players.forEach(p => {
      const pred = matchKoPrediction(p, ko);
      const pts = predictionPoints(round, pred, actual, triple);
      if (pts) delta[p.name][phaseIdx] += pts;
    });
  });

  // -------- 3) Fase de grupos: clasificados a 1/16 y posición exacta --------
  //   Al CERRAR cada grupo (todos sus partidos jugados) ya se conoce su tabla
  //   1º-4º completa, así que ese mismo día se otorgan:
  //     · "Posición exacta" (5 pts) de las 4 posiciones (1º, 2º, 3º y 4º).
  //     · "Equipo clasificado a 1/16" (10 pts) por el 1º y el 2º.
  //   Lo ÚNICO que se difiere a que termine TODA la fase de grupos es el
  //   "Equipo clasificado a 1/16" de los 8 mejores 3os: hasta cerrarse todos
  //   los grupos no se sabe qué terceros se cuelan en 1/16.
  const groupStandings = computeGroupStandings(DATA);
  const allGroupsDone = Object.values(groupStandings).every(g => g.complete);
  const lastGroupDay = lastGroupDateIdx(DATA, dayKeys);

  Object.entries(groupStandings).forEach(([letter, g]) => {
    if (!g.complete) return;
    const dayIdx = dayKeys.indexOf(g.lastDate);
    if (dayIdx < 0) return;
    const order = g.standings.map(r => r.team);   // [1º, 2º, 3º, 4º] reales
    addQualifierPoints(players, delta, dayIdx, 'r32', order.slice(0, 2));
    addPositionPoints(players, delta, dayIdx, letter, order, [0, 1, 2, 3]);
  });

  if (allGroupsDone && lastGroupDay >= 0) {
    addQualifierPoints(players, delta, lastGroupDay, 'r32', pickBestThirds(groupStandings, 8));
  }
  // b) r16, qf, sf, final, thirdPlace → cada uno en su PHASE_KEY
  ['r16', 'qf', 'sf', 'thirdPlace', 'final'].forEach(key => {
    const phaseKey = PHASE_KEY[phaseForQualifier(key)];
    const idx = dayKeys.indexOf(phaseKey);
    if (idx < 0) return;
    const list = DATA.actual_qualifiers && DATA.actual_qualifiers[key];
    if (!list || !list.length) return;
    // El "clasificado a 3º-4º" se cobra por los equipos que el porrista colocó
    // en el 3º-4º de su propio cuadro: sus semifinalistas (bets.sf) que NO puso
    // en la final (bets.final). Los porristas NO firman una lista bets.thirdPlace;
    // los 2 sf que no van a su final son sus perdedores de semis previstos.
    // Un sf que el porrista mandó a la final no cuenta aquí aunque perdiera la
    // semifinal: en su cuadro ese equipo iba a la final, no al 3º-4º.
    addQualifierPoints(players, delta, idx, key, list,
      key === 'thirdPlace' ? 'sf' : key,
      key === 'thirdPlace' ? 'final' : null);
  });

  // -------- 4) Premios finales (campeón, balón, bota) --------
  const awards = DATA.actual_awards || {};
  const finalIdx = dayKeys.indexOf('ph_Final');
  if (finalIdx >= 0) {
    players.forEach(p => {
      if (awards.champion && p.champion === awards.champion) delta[p.name][finalIdx] += AWARD_POINTS.champion;
      if (awards.runnerup && p.runnerup === awards.runnerup) delta[p.name][finalIdx] += AWARD_POINTS.runnerup;
      if (awards.third    && p.third    === awards.third)    delta[p.name][finalIdx] += AWARD_POINTS.third;

      const aw = (p.bets && p.bets.awards) || {};
      ['balon_oro','balon_plata','balon_bronce','bota_oro','bota_plata','bota_bronce'].forEach(k => {
        if (awards[k] && aw[k] === awards[k]) delta[p.name][finalIdx] += AWARD_POINTS[k];
      });
    });
  }

  // -------- 5) Acumular delta → series + last_day + started --------
  let lastWithData = 0;
  players.forEach(p => {
    const arr = delta[p.name];
    const series = new Array(dayKeys.length).fill(0);
    let acc = 0;
    for (let i = 0; i < dayKeys.length; i++) {
      acc += arr[i];
      series[i] = acc;
    }
    DATA.clasif.series[p.name] = series;
  });

  for (let i = dayKeys.length - 1; i >= 0; i--) {
    if (players.some(p => delta[p.name][i] > 0)) { lastWithData = i; break; }
  }

  DATA.clasif.last_day = lastWithData;
  DATA.clasif.started = lastWithData > 0 || players.some(p => DATA.clasif.series[p.name].some(v => v > 0));

  return DATA;
}

/* ===== Helpers ===== */

function ensureSlots(DATA) {
  if (!DATA.ko_results) DATA.ko_results = [];
  if (!DATA.actual_qualifiers) DATA.actual_qualifiers = {};
  if (!DATA.actual_awards) DATA.actual_awards = {};
  if (!DATA.clasif) throw new Error('DATA.clasif no existe — revisa el dataset');
  if (!Array.isArray(DATA.clasif.day_keys) || !DATA.clasif.day_keys.length) {
    throw new Error('DATA.clasif.day_keys vacío');
  }
}

/** Devuelve la última fecha (YYYY-MM-DD) presente en DATA.matchdays
 *  y la traduce al índice de day_keys. -1 si no hay coincidencia. */
function lastGroupDateIdx(DATA, dayKeys) {
  const dates = Object.keys(DATA.matchdays || {}).sort();
  for (let j = dates.length - 1; j >= 0; j--) {
    const idx = dayKeys.indexOf(dates[j]);
    if (idx >= 0) return idx;
  }
  return -1;
}

/** Mapea la clave de "equipo clasificado a X" a la fase que la cierra.
 *  Ej.: r16 (predicción de octavos) se confirma cuando termina r32 (1/16). */
function phaseForQualifier(key) {
  return ({
    r16:        'r32',
    qf:         'r16',
    sf:         'quarters',
    thirdPlace: 'semis',
    final:      'semis'
  })[key];
}

/** Añade los puntos de "Equipo clasificado a X" al delta del día indicado.
 *  @param betsKey     Lista del porrista contra la que se cruza (por defecto `key`).
 *  @param excludeKey  Si se indica, los equipos presentes en esta otra lista del
 *                     porrista NO puntúan (p.ej. el 3º-4º excluye los bets.final). */
function addQualifierPoints(players, delta, dayIdx, key, actualList, betsKey = key, excludeKey = null) {
  const set = new Set(actualList);
  const pts = QUALIFIER_POINTS[key];
  players.forEach(p => {
    const picks = (p.bets && p.bets[betsKey]) || [];
    const excluded = excludeKey ? new Set((p.bets && p.bets[excludeKey]) || []) : null;
    let hits = 0;
    picks.forEach(team => { if (set.has(team) && !(excluded && excluded.has(team))) hits++; });
    if (hits) delta[p.name][dayIdx] += hits * pts;
  });
}

/** Añade los puntos de "Posición exacta" de un grupo al delta del día indicado.
 *  @param letter     Letra del grupo (clave de p.bets.group_standings).
 *  @param realOrder  [1º, 2º, 3º, 4º] reales del grupo.
 *  @param positions  Índices 0..3 a evaluar (0 = 1º … 3 = 4º). */
function addPositionPoints(players, delta, dayIdx, letter, realOrder, positions) {
  players.forEach(p => {
    const pred = p.bets && p.bets.group_standings && p.bets.group_standings[letter];
    if (!pred) return;
    positions.forEach(i => {
      if (pred[i] && pred[i] === realOrder[i]) delta[p.name][dayIdx] += POSITION_POINTS[i + 1];
    });
  });
}

/** ¿El partido KO `ko` está marcado como triple (×3) en DATA.ko_bracket? */
function koIsTriple(DATA, ko) {
  return (DATA.ko_bracket || []).some(e => e.triple && e.round === ko.round &&
    ((e.home_team === ko.home && e.away_team === ko.away) ||
     (e.home_team === ko.away && e.away_team === ko.home)));
}

/** Ronda a la que pertenece la entrada `i` del bracket personal `bets.ko`.
 *  El bracket son 32 cruces en orden canónico:
 *    0-15 → r32 (1/16) · 16-23 → r16 (octavos) · 24-27 → quarters ·
 *    28-29 → semis · 30 → thirdPlace (3º y 4º) · 31 → final. */
function koPredRound(i) {
  if (i < 16) return 'r32';
  if (i < 24) return 'r16';
  if (i < 28) return 'quarters';
  if (i < 30) return 'semis';
  if (i === 30) return 'thirdPlace';
  return 'final';
}

/** Busca la predicción KO del player que corresponde al partido real `ko`.
 *  Estrategia: matchea por enfrentamiento exacto (home-away o away-home)
 *  PERO SÓLO dentro de la misma ronda: un cruce sólo puntúa si el player lo
 *  firmó en la fase en la que realmente se jugó. Así, si alguien puso
 *  España-Portugal en la final y ese cruce cae en octavos, NO cobra por él. */
function matchKoPrediction(p, ko) {
  if (!p.bets || !Array.isArray(p.bets.ko)) return null;
  const a = ko.home, b = ko.away;
  for (let i = 0; i < p.bets.ko.length; i++) {
    const k = p.bets.ko[i];
    if (!k || !k.match) continue;
    if (koPredRound(i) !== ko.round) continue;   // la ronda predicha debe coincidir
    const m = k.match.split('-');
    if (m.length !== 2) continue;
    const [h, w] = m.map(s => s.trim());
    if ((h === a && w === b) || (h === b && w === a)) {
      // Si están del revés, hay que invertir signo y marcador
      if (h === a) {
        return { signo: k.signo, gh: k.gh, ga: k.ga };
      } else {
        const flippedSign = k.signo === '1' ? '2' : (k.signo === '2' ? '1' : 'X');
        return { signo: flippedSign, gh: k.ga, ga: k.gh };
      }
    }
  }
  return null;
}

module.exports = { recompute };
