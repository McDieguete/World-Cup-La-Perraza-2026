/* ===========================================================
   scoring.js — Reglas de puntuación de La Perraza · Mundial 2026
   --------------------------------------------------------------
   Estas constantes son la ÚNICA fuente de verdad del baremo.
   Si quieres ajustar puntos: edita aquí y vuelve a correr
   `node scripts/update-results.js` (o el cron) para repuntuar.
   =========================================================== */

'use strict';

/* Reglas por ronda. Los puntos por partido son ACUMULATIVOS:
     · "signo" se suma cuando aciertas el 1X2.
     · "diferencia" se suma además si la diferencia de goles coincide
       (sólo si el signo es correcto).
     · "exacto" se suma también si el marcador es exacto.
   Ejemplo (fase de grupos, 2-1 firmado y 2-1 real):
     1 (signo) + 1 (diferencia) + 3 (exacto) = 5 pts.
   En partido triple: × 3 → 15 pts.
*/
const ROUND_POINTS = {
  group:      { signo: 1, diferencia: 1, exacto: 3 },
  r32:        { signo: 2, diferencia: 2, exacto: 3 },   // dieciseisavos (1/16)
  r16:        { signo: 2, diferencia: 2, exacto: 3 },   // octavos
  quarters:   { signo: 3, diferencia: 3, exacto: 5 },
  semis:      { signo: 3, diferencia: 3, exacto: 5 },
  thirdPlace: { signo: 5, diferencia: 6, exacto: 7 },
  final:      { signo: 5, diferencia: 6, exacto: 7 }
};

/* Puntos por acertar la POSICIÓN EXACTA de un equipo dentro de su grupo.
   El porrista firma el orden 1º-4º de cada grupo en bets.group_standings.
   Baremo del Excel ADMIN: 5 pts por cada posición clavada (1º, 2º, 3º, 4º).
   Timing (en recompute.js): 1º y 2º se otorgan al cerrar el grupo; 3º y 4º
   al terminar TODA la fase de grupos (igual que los mejores 3os). */
const POSITION_POINTS = { 1: 5, 2: 5, 3: 5, 4: 5 };

/* Puntos por equipo en cada lista de clasificados.
   Se otorgan cuando termina la ronda que valida esa clasificación. */
const QUALIFIER_POINTS = {
  r32:        10,   // por equipo del player.bets.r32 que realmente pase a 1/16
  r16:        15,   // por equipo del bets.r16 que pase a 1/8
  qf:         20,   // por equipo del bets.qf  que pase a 1/4
  sf:         30,   // por equipo del bets.sf  que pase a semis
  thirdPlace: 40,   // por equipo del bets.sf que acabe jugando el 3º-4º (semifinalista perdedor)
  final:      50    // por equipo del bets.final que llegue a la final
};

/* Premios al final del Mundial (basados en player.champion/runnerup/third
   y player.bets.awards.{balon|bota}_{oro|plata|bronce}). */
const AWARD_POINTS = {
  champion:    60,
  runnerup:    50,
  third:       40,
  balon_oro:   20, balon_plata:  15, balon_bronce:  10,
  bota_oro:    20, bota_plata:   15, bota_bronce:   10
};

/* Fase del Mundial → clave de día_keys donde se acumulan sus puntos.
   - Los partidos de grupos van en su fecha real.
   - Los KO van todos a su bucket de fase (no a la fecha calendario)
     porque clasif.day_keys así lo modela. */
const PHASE_KEY = {
  r32:        'ph_1/16',
  r16:        'ph_1/8',
  quarters:   'ph_1/4',
  semis:      'ph_Semis',
  thirdPlace: 'ph_3º y 4º',
  final:      'ph_Final'
};

/* Mapeo: stage devuelto por football-data.org → nuestra ronda. */
/* Nombres de stage de football-data.org (v4) para el Mundial de 48 equipos.
   Confirmados en la doc oficial (lookup tables → enums):
     LAST_32 · LAST_16 · QUARTER_FINALS · SEMI_FINALS · THIRD_PLACE · FINAL
   OJO: en 2026 la primera ronda KO es el Round of 32 = LAST_32 (no LAST_16). */
const FOOTBALL_DATA_STAGE_TO_ROUND = {
  'GROUP_STAGE':    'group',
  'LAST_32':        'r32',        // dieciseisavos (1/16 · 32 equipos)
  'ROUND_OF_32':    'r32',        // alias defensivo
  'LAST_16':        'r16',        // octavos (1/8 · 16 equipos)
  'ROUND_OF_16':    'r16',        // alias defensivo
  'QUARTER_FINALS': 'quarters',
  'LAST_8':         'quarters',   // alias defensivo
  'SEMI_FINALS':    'semis',
  'LAST_4':         'semis',      // alias defensivo
  'THIRD_PLACE':    'thirdPlace',
  '3RD_PLACE':      'thirdPlace', // alias defensivo
  'FINAL':          'final'
};

/* ===== Helpers de parsing ===== */

/** Convierte una cadena "1|2-0" (signo|gh-ga) en { signo, gh, ga } o null. */
function parsePred(raw) {
  if (!raw || typeof raw !== 'string') return null;
  const m = raw.match(/^([1X2])\|(-?\d+)-(-?\d+)$/);
  return m ? { signo: m[1], gh: +m[2], ga: +m[3] } : null;
}

/** Convierte un marcador "2-1" en { gh, ga } o null. */
function parseScore(s) {
  if (!s || typeof s !== 'string') return null;
  const m = s.match(/^(-?\d+)-(-?\d+)$/);
  return m ? { gh: +m[1], ga: +m[2] } : null;
}

/** Devuelve "1" / "X" / "2" dado un marcador { gh, ga }. */
function scoreSign({ gh, ga }) {
  return gh > ga ? '1' : (gh < ga ? '2' : 'X');
}

/* ===== Cálculo de puntos de UN pronóstico ===== */

/**
 * Aplica las reglas de puntuación acumulativas para un partido.
 * @param {string} round   Una de las claves de ROUND_POINTS.
 * @param {{signo,gh,ga}|null} pred  Predicción del porrista, o null si no la firmó.
 * @param {{gh,ga}|null} actual      Marcador real, o null si el partido no ha terminado.
 * @param {boolean} triple           ¿Vale triple (sólo fase de grupos)?
 * @returns {number} Puntos ganados por este pronóstico (0 si no aplica).
 */
function predictionPoints(round, pred, actual, triple = false) {
  if (!pred || !actual) return 0;
  const cfg = ROUND_POINTS[round];
  if (!cfg) return 0;

  let pts = 0;
  if (pred.signo === scoreSign(actual)) {
    pts += cfg.signo;
    const predDiff = pred.gh - pred.ga;
    const realDiff = actual.gh - actual.ga;
    if (predDiff === realDiff) pts += cfg.diferencia;
    if (pred.gh === actual.gh && pred.ga === actual.ga) pts += cfg.exacto;
  }
  return triple ? pts * 3 : pts;
}

/* ===== Clasificación de la fase de grupos ===== */

/** Orden de clasificación dentro de un grupo: puntos, diferencia de goles,
 *  goles a favor y, a igualdad total, alfabético (criterio estable). */
function cmpGroupTeam(a, b) {
  return b.pts - a.pts || b.gd - a.gd || b.gf - a.gf || a.team.localeCompare(b.team, 'es');
}

/** Acumula un resultado (gf-ga) de `team` en la tabla `st` de su grupo. */
function addGroupResult(st, team, gf, ga) {
  let row = st[team];
  if (!row) { row = st[team] = { team, pts: 0, gd: 0, gf: 0 }; }
  row.gf += gf;
  row.gd += gf - ga;
  if (gf > ga) row.pts += 3;
  else if (gf === ga) row.pts += 1;
}

/**
 * Reconstruye la clasificación de cada grupo a partir de los resultados ya
 * cargados en DATA.matchdays. NO asume que la fase de grupos esté completa:
 * un grupo sólo se marca `complete` cuando tiene cargados TODOS sus partidos.
 *
 * @param {object} DATA  Dataset (usa DATA.gp_matches y DATA.matchdays).
 * @returns {Object<string, {
 *     expected:number, played:number, complete:boolean,
 *     lastDate:string|null, standings:Array<{team,pts,gd,gf}>
 *   }>}  Mapa letra-de-grupo → metadatos + tabla ordenada (1º…4º).
 */
function computeGroupStandings(DATA) {
  const groupOfMatch = {};   // nombre de partido → letra de grupo
  const meta = {};           // letra → { expected, played, lastDate, st }

  (DATA.gp_matches || []).forEach(g => {
    const letter = String(g.group || '').replace(/[0-9]/g, '');
    groupOfMatch[g.name] = letter;
    if (!meta[letter]) meta[letter] = { expected: 0, played: 0, lastDate: null, st: {} };
    meta[letter].expected++;
  });

  Object.entries(DATA.matchdays || {}).forEach(([date, matches]) => {
    matches.forEach(m => {
      const letter = groupOfMatch[m.name];
      if (!letter) return;
      const sc = (m.result || '').match(/^(-?\d+)-(-?\d+)$/);
      if (!sc) return;
      const gh = +sc[1], ga = +sc[2];
      const md = meta[letter];
      md.played++;
      if (!md.lastDate || date > md.lastDate) md.lastDate = date;
      addGroupResult(md.st, m.home, gh, ga);
      addGroupResult(md.st, m.away, ga, gh);
    });
  });

  const out = {};
  Object.entries(meta).forEach(([letter, md]) => {
    out[letter] = {
      expected: md.expected,
      played:   md.played,
      complete: md.expected > 0 && md.played >= md.expected,
      lastDate: md.lastDate,
      standings: Object.values(md.st).sort(cmpGroupTeam)
    };
  });
  return out;
}

/** Dados los grupos de computeGroupStandings, devuelve los N mejores 3os.
 *  Sólo tiene sentido cuando TODOS los grupos están completos. */
function pickBestThirds(groupStandings, n = 8) {
  const thirds = [];
  Object.values(groupStandings).forEach(g => {
    if (g.standings[2]) thirds.push(g.standings[2]);
  });
  thirds.sort(cmpGroupTeam);
  return thirds.slice(0, n).map(r => r.team);
}

module.exports = {
  ROUND_POINTS,
  POSITION_POINTS,
  QUALIFIER_POINTS,
  AWARD_POINTS,
  PHASE_KEY,
  FOOTBALL_DATA_STAGE_TO_ROUND,
  parsePred,
  parseScore,
  scoreSign,
  predictionPoints,
  cmpGroupTeam,
  computeGroupStandings,
  pickBestThirds
};
