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
  if (t.dataset.tab === 'stats')   setTimeout(animateBars, 80);
  if (t.dataset.tab === 'buscador' && window.__initBuscador) setTimeout(window.__initBuscador, 30);
  if (t.dataset.tab === 'clasif')  setTimeout(renderClasif, 60);
  if (t.dataset.tab === 'metaporra' && window.__initMetaporra) setTimeout(window.__initMetaporra, 40);
  if (t.dataset.tab === 'mundial' && window.__initMundial) setTimeout(window.__initMundial, 60);
}));

/* ===== Init de la pestaña activa al cargar =====
   El panel activo por defecto (Clasificación) necesita pintarse al arrancar;
   antes solo se renderizaba al hacer clic. Se dispara el inicializador que
   corresponda a la pestaña marcada como .active en el HTML. */
document.addEventListener('DOMContentLoaded', () => {
  const active = $('.tab.active');
  const tab = active && active.dataset.tab;
  if (tab === 'clasif' && typeof renderClasif === 'function') renderClasif();
  else if (tab === 'stats' && typeof animateBars === 'function') animateBars();
  else if (tab === 'buscador' && window.__initBuscador) window.__initBuscador();
  else if (tab === 'metaporra' && window.__initMetaporra) window.__initMetaporra();
  else if (tab === 'mundial' && window.__initMundial) window.__initMundial();
});

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
