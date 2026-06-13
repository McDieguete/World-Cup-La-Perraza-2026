/* ===========================================================
   sync-triples.js — Mantenimiento de los partidos triples
   --------------------------------------------------------------
   1. Garantiza que la lista canónica de partidos triples del
      Mundial 2026 está marcada como `triple: true` en
      DATA.gp_matches.
   2. Propaga ese flag a DATA.matchdays para que el rendering del
      panel "Próxima jornada" y el motor de puntuación queden
      sincronizados.
   El recompute posterior (update-results / recompute) ya respetará
   estos flags sin sorpresas.
   Uso:  node scripts/sync-triples.js
   =========================================================== */

'use strict';

const { readDataJs, writeDataJs } = require('./data-io');
const { recompute } = require('./recompute');

/* Lista canónica entregada por la comisión de la porra (18 partidos). */
const TRIPLES = [
  ['México',           'Sudáfrica'],
  ['Canadá',           'Bosnia y Herzegovina'],
  ['Estados Unidos',   'Paraguay'],
  ['Brasil',           'Marruecos'],
  ['España',           'Cabo Verde'],
  ['Francia',          'Senegal'],
  ['Inglaterra',       'Croacia'],
  ['Suiza',            'Bosnia y Herzegovina'],
  ['México',           'Corea del Sur'],
  ['Alemania',         'Costa de Marfil'],
  ['España',           'Arabia Saudita'],
  ['Argentina',        'Austria'],
  ['Inglaterra',       'Ghana'],
  ['Suiza',            'Canadá'],
  ['Escocia',          'Brasil'],
  ['Noruega',          'Francia'],
  ['España',           'Uruguay'],
  ['Colombia',         'Portugal']
];

function pairKey(a, b) {
  return [a, b].sort().join('||');
}

function main() {
  const D = readDataJs();
  const canonical = new Set(TRIPLES.map(([a, b]) => pairKey(a, b)));

  /* --- gp_matches: marca true los canónicos, false el resto --- */
  let gpFixed = 0;
  (D.gp_matches || []).forEach(g => {
    const [a, b] = String(g.name).split('-').map(s => s.trim());
    const isTriple = canonical.has(pairKey(a, b));
    if (!!g.triple !== isTriple) {
      g.triple = isTriple;
      gpFixed++;
    }
  });

  /* --- matchdays: el espejo de gp_matches --- */
  let mdFixed = 0;
  Object.entries(D.matchdays || {}).forEach(([date, ms]) => {
    ms.forEach(mc => {
      const isTriple = canonical.has(pairKey(mc.home, mc.away));
      if (!!mc.triple !== isTriple) {
        mc.triple = isTriple;
        mdFixed++;
      }
    });
  });

  /* --- Informe --- */
  const gpCount = (D.gp_matches || []).filter(g => g.triple).length;
  const mdCount = Object.values(D.matchdays || {}).flat().filter(m => m.triple).length;
  console.log(`gp_matches triples: ${gpCount}  (${gpFixed} corregidos)`);
  console.log(`matchdays  triples: ${mdCount}  (${mdFixed} corregidos)`);

  /* --- Lista cualquier canónico que NO esté presente en el dataset --- */
  const seenPairs = new Set();
  (D.gp_matches || []).forEach(g => {
    const [a, b] = String(g.name).split('-').map(s => s.trim());
    seenPairs.add(pairKey(a, b));
  });
  const missing = TRIPLES
    .map(([a, b]) => pairKey(a, b))
    .filter(k => !seenPairs.has(k));
  if (missing.length) {
    console.log('⚠ Canónicos no encontrados en gp_matches:');
    missing.forEach(k => console.log('  · ' + k.replace('||', ' vs ')));
  }

  /* --- Recompute para que clasif.series quede al día con los triples --- */
  recompute(D);

  const wrote = writeDataJs(D);
  console.log(wrote ? '> js/data.js actualizado (flags + series recomputadas).' : '> js/data.js sin cambios.');
}

main();
