/* ===========================================================
   resultados.js — Panel "Mis resultados"
   --------------------------------------------------------------
   Buscador por porrista. Al elegir un porrista se muestra su
   tirada día a día con:
     · Sus apuestas de cada partido (signo + marcador firmado).
     · Resultado real (si el partido se jugó).
     · Puntos ganados ese partido (con scoring-client.js).
     · Subtotal de puntos del día.
   El día actual aparece auto-expandido.
   =========================================================== */

(function () {
  'use strict';

  const players = DATA.players;
  const matchdays = DATA.matchdays;
  const dayKeys = Object.keys(matchdays).sort();      // sólo días con fecha real
  const gpMatches = DATA.gp_matches || [];

  /* Construir índices rápidos */
  const gpIdxByName = {};
  gpMatches.forEach((g, i) => { gpIdxByName[g.name] = i; });

  const MON = ['enero','febrero','marzo','abril','mayo','junio',
               'julio','agosto','septiembre','octubre','noviembre','diciembre'];
  const DOW = ['domingo','lunes','martes','miércoles','jueves','viernes','sábado'];

  function fmtDate(key) {
    const [y, m, d] = key.split('-').map(Number);
    return `${d} de ${MON[m - 1]}`;
  }
  function dowOf(key) {
    const [y, m, d] = key.split('-').map(Number);
    return DOW[new Date(y, m - 1, d).getDay()];
  }
  function todayKey() {
    const t = new Date();
    return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2,'0')}-${String(t.getDate()).padStart(2,'0')}`;
  }
  function normalize(s) {
    return (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'');
  }

  /* ===== Render principal ===== */

  let currentPlayer = null;

  function render() {
    renderChips($('#resBmSearch').value.trim());
    if (currentPlayer) renderDetail(currentPlayer);
    else $('#resDetail').innerHTML = '<div class="res-empty">Elige un porrista para ver sus apuestas día a día.</div>';
  }

  function renderChips(query) {
    const q = normalize(query);
    const cumIdx = (DATA.clasif && typeof DATA.clasif.last_day === 'number') ? DATA.clasif.last_day : 0;
    const ranked = [...players]
      .map(p => ({
        name: p.name,
        pts: (DATA.clasif && DATA.clasif.series && DATA.clasif.series[p.name])
          ? DATA.clasif.series[p.name][cumIdx] : 0
      }))
      .filter(p => !q || normalize(p.name).includes(q))
      .sort((a,b) => b.pts - a.pts || a.name.localeCompare(b.name, 'es'));

    const list = q ? ranked : ranked.slice(0, 12);
    const grid = $('#resChips');

    if (!list.length) {
      grid.innerHTML = '<div class="res-empty">Ningún porrista coincide con esa búsqueda.</div>';
      return;
    }
    grid.innerHTML = list.map(p =>
      `<button class="res-chip${currentPlayer===p.name?' active':''}" data-name="${esc(p.name)}">
        <span class="res-chip-name">${esc(p.name)}</span>
        <span class="res-chip-pts">${p.pts} pts</span>
      </button>`
    ).join('');

    $$('.res-chip').forEach(c => c.addEventListener('click', () => {
      currentPlayer = c.dataset.name;
      renderChips($('#resBmSearch').value.trim());
      renderDetail(currentPlayer);
      document.getElementById('resDetail').scrollIntoView({ behavior: 'smooth', block: 'start' });
    }));
  }

  function renderDetail(name) {
    const p = players.find(x => x.name === name);
    if (!p) { $('#resDetail').innerHTML = ''; return; }

    const today = todayKey();
    const totals = [];
    let grandTotal = 0;

    const dayBlocks = dayKeys.map(dateKey => {
      const matches = matchdays[dateKey] || [];
      let dayPts = 0;
      let played = 0;
      const rows = matches.map(mc => {
        const gpIdx = gpIdxByName[mc.name];
        const pred = (gpIdx != null) ? scParsePred(p.bets && p.bets.gp ? p.bets.gp[gpIdx] : null) : null;
        const actual = scParseScore(mc.result);
        const pts = scPredictionPoints('group', pred, actual, !!mc.triple);
        if (actual) played++;
        dayPts += pts;
        return rowMarkup(mc, pred, actual, pts);
      }).join('');
      grandTotal += dayPts;
      totals.push({ dateKey, dayPts });
      const open = (dateKey === today) ? ' open' : '';
      return `<div class="res-day${open}" data-date="${dateKey}">
        <button class="res-day-head" type="button">
          <div class="res-day-info">
            <span class="res-day-date">${esc(fmtDate(dateKey))}</span>
            <span class="res-day-dow">${esc(dowOf(dateKey))}</span>
          </div>
          <span class="res-day-meta">${matches.length} ${matches.length===1?'partido':'partidos'} · ${played} jugado${played===1?'':'s'}</span>
          <span class="res-day-pts">${dayPts} pts</span>
          <span class="res-day-toggle" aria-hidden="true">▾</span>
        </button>
        <div class="res-day-matches">${rows || '<div class="res-empty-day">Sin partidos.</div>'}</div>
      </div>`;
    }).join('');

    $('#resDetail').innerHTML = `
      <div class="res-detail-head">
        <div class="res-detail-name">${esc(p.name)}</div>
        <div class="res-detail-meta">
          <span class="res-detail-pill">🏆 Total acumulado: <b>${grandTotal} pts</b></span>
        </div>
      </div>
      <div class="res-days">${dayBlocks}</div>`;

    $$('.res-day-head').forEach(btn => {
      btn.addEventListener('click', () => btn.parentElement.classList.toggle('open'));
    });
  }

  function rowMarkup(mc, pred, actual, pts) {
    const time = mc.dt ? mc.dt.slice(11) : '';
    const triple = mc.triple ? '<span class="res-trip">×3</span>' : '';
    const predStr = pred ? `${pred.signo}|${pred.gh}-${pred.ga}` : '—';
    const actualStr = actual ? `${actual.gh}-${actual.ga}` : '<span class="res-pending">pdte.</span>';
    const ptsClass = !actual ? 'res-pts pending'
                   : pts > 0  ? 'res-pts win'
                   :            'res-pts zero';
    return `<div class="res-row">
      <div class="res-row-left">
        <span class="res-time">${esc(time)}</span>
        ${triple}
        <span class="res-teams">
          <span class="res-home">${esc(mc.home)}</span>
          <span class="res-vs">vs</span>
          <span class="res-away">${esc(mc.away)}</span>
        </span>
      </div>
      <div class="res-row-mid">
        <span class="res-label">tu apuesta</span>
        <span class="res-pred">${esc(predStr)}</span>
      </div>
      <div class="res-row-mid">
        <span class="res-label">real</span>
        <span class="res-actual">${actualStr}</span>
      </div>
      <div class="${ptsClass}">${actual ? (pts > 0 ? '+'+pts : pts) : '—'}</div>
    </div>`;
  }

  /* ===== Wire-up ===== */

  function init() {
    const inp = $('#resBmSearch');
    if (!inp) return;
    /* Limpia cualquier valor que Chrome/Edge haya autofill-eado al cargar. */
    inp.value = '';
    inp.addEventListener('input', () => renderChips(inp.value.trim()));

    /* Render inicial: top-12 de la clasificación como sugerencia clicable. */
    render();
  }

  /* Render inicial. helpers.js, scoring-client.js y data.js ya están cargados
     por el orden de defer en index.html, así que podemos pintar sin esperar. */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
