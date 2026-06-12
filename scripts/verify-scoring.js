'use strict';
/* ===========================================================
   verify-scoring.js — Test rápido del motor de puntuación.
   Recompone series con los resultados YA cargados en js/data.js
   y muestra:
     · Total y primeros días de un par de porristas conocidos.
     · result_exact por partido jugado.
   No escribe nada (modo lectura).
   Uso:  node scripts/verify-scoring.js
   =========================================================== */
const { readDataJs } = require('./data-io');
const { recompute } = require('./recompute');

const D = readDataJs();
recompute(D);

const SAMPLE = ['Taown', 'Diego'];
SAMPLE.forEach(name => {
  const s = D.clasif.series[name];
  if (!s) { console.log(`${name}: no encontrado`); return; }
  console.log(`${name}: total=${s[D.clasif.last_day]}  series[0..3]=${s.slice(0,4).join(', ')}`);
});

console.log('last_day:', D.clasif.last_day, ' started:', D.clasif.started);

// Mostrar result_exact de los partidos jugados
Object.entries(D.matchdays).forEach(([date, ms]) => {
  ms.forEach(m => {
    if (m.result) console.log(`  ${date}  ${m.home} ${m.result} ${m.away}  triple=${!!m.triple}  exact=${m.result_exact}`);
  });
});
