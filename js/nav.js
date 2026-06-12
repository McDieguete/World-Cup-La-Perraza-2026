/* ===========================================================
   nav.js — navegación por tabs y countdown de cabecera
   =========================================================== */

/* ===== Tabs ===== */
$$('.tab').forEach(t => t.addEventListener('click', () => {
  $$('.tab').forEach(x => x.classList.remove('active'));
  $$('.panel').forEach(x => x.classList.remove('active'));
  t.classList.add('active');
  $('#' + t.dataset.tab).classList.add('active');
  window.scrollTo({ top: 0, behavior: 'smooth' });
  if (t.dataset.tab === 'stats')  setTimeout(animateBars, 80);
  if (t.dataset.tab === 'clasif') setTimeout(renderClasif, 60);
}));

/* ===== Countdown ===== */
(function () {
  const start = new Date(2026, 5, 11, 0, 0, 0);
  const now = new Date();
  const d = Math.max(0, Math.ceil((start - now) / 86400000));
  $('#cdNum').textContent = d;
  if (d === 0) {
    $('#cdNum').textContent = '¡YA!';
    $('.countdown .lbl').textContent = 'el balón ya rueda';
  }
})();
