/* ===========================================================
   sync-porra-stats.js — refresca los agregados de la pestaña
   "Estadísticas" que se DERIVAN de las quinielas de los porristas.

   Por qué existe: js/data.js guarda, ya precalculados, los conteos
   que pinta js/stats.js (DATA.stats.advancement, DATA.stats.surprise_teams).
   Cuando se corrige a mano la quiniela de un porrista (p. ej. las
   apuestas r32/r16 de un jugador), esos conteos quedan desfasados
   porque ningún cron los recalcula. Este script los vuelve a contar
   desde DATA.players, sin tocar la parte curada (lista y categorías
   de equipos sorpresa, orden de filas, normalización de nombres).

   Uso:  node scripts/sync-porra-stats.js          (escribe)
         DRY_RUN=1 node scripts/sync-porra-stats.js (solo informa)
   =========================================================== */
'use strict';

const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, '..', 'js', 'data.js');

function loadData(raw) {
  const lines = raw.split(/\r?\n/);
  const idx = lines.findIndex((l) => l.startsWith('const DATA = '));
  if (idx === -1) throw new Error('No encuentro la línea "const DATA = ..." en data.js');
  const m = lines[idx].match(/^const DATA = ([\s\S]*);$/);
  if (!m) throw new Error('La línea de DATA no termina en ";" como se esperaba');
  return { lines, idx, data: JSON.parse(m[1]) };
}

/* Cuenta, sobre todos los porristas, cuántos apuestan que cada equipo
   llega a cada fase. Mismas fuentes que pintaba el dataset original:
   r32/r16/qf desde bets, semis desde el array `semis`, final desde
   bets.final y campeón desde el campo `champion`. */
function tallyAdvancement(players) {
  const bump = (m, t) => { if (t) m[t] = (m[t] || 0) + 1; };
  const cols = {
    r32: {}, r16: {}, quarters: {}, semis: {}, final: {}, champion: {},
  };
  players.forEach((p) => {
    const b = p.bets || {};
    (b.r32 || []).forEach((t) => bump(cols.r32, t));
    (b.r16 || []).forEach((t) => bump(cols.r16, t));
    (b.qf || []).forEach((t) => bump(cols.quarters, t));
    (p.semis || []).forEach((t) => bump(cols.semis, t));
    (b.final || []).forEach((t) => bump(cols.final, t));
    bump(cols.champion, p.champion);
  });
  return cols;
}

function main() {
  const raw = fs.readFileSync(DATA_FILE, 'utf8');
  const eol = raw.includes('\r\n') ? '\r\n' : '\n';
  const { lines, idx, data } = loadData(raw);

  const cols = tallyAdvancement(data.players);
  const COLS = ['r32', 'r16', 'quarters', 'semis', 'final', 'champion'];
  const changes = [];

  // 1) advancement: refresca los 6 conteos de cada fila, sin alterar
  //    la lista ni el orden de equipos.
  (data.stats.advancement || []).forEach((row) => {
    COLS.forEach((c) => {
      const next = cols[c][row.team] || 0;
      if (row[c] !== next) {
        changes.push(`advancement ${row.team}.${c}: ${row[c]} -> ${next}`);
        row[c] = next;
      }
    });
  });

  // 2) surprise_teams: sus columnas r32/r16/qf/sf son los mismos conteos
  //    (qf == quarters, sf == semis). Conserva team + cat + orden.
  (data.stats.surprise_teams || []).forEach((row) => {
    const map = { r32: 'r32', r16: 'r16', qf: 'quarters', sf: 'semis' };
    Object.entries(map).forEach(([key, col]) => {
      if (!(key in row)) return;
      const next = cols[col][row.team] || 0;
      if (row[key] !== next) {
        changes.push(`surprise_teams ${row.team}.${key}: ${row[key]} -> ${next}`);
        row[key] = next;
      }
    });
  });

  if (!changes.length) {
    console.log('Sin cambios: los agregados ya coinciden con las quinielas.');
    return;
  }

  console.log(`${changes.length} celda(s) actualizada(s):`);
  changes.forEach((c) => console.log('  ' + c));

  if (process.env.DRY_RUN) {
    console.log('\nDRY_RUN=1 -> no se escribe nada.');
    return;
  }

  lines[idx] = 'const DATA = ' + JSON.stringify(data) + ';';
  fs.writeFileSync(DATA_FILE, lines.join(eol), 'utf8');
  console.log('\njs/data.js actualizado.');
}

main();
