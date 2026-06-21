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
