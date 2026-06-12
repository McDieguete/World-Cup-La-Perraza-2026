/* ===========================================================
   helpers.js — utilidades compartidas (DOM, escape, fechas)
   Expone constantes globales (N, TODAY) y funciones ($, $$, esc, parseDay).
   =========================================================== */

const $  = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];

const esc = s => (s == null ? '' : String(s)).replace(
  /[&<>"]/g,
  c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])
);

const N = DATA.meta.n;

const TODAY = (() => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
})();

function parseDay(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}
