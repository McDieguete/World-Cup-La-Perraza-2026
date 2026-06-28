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

  /* Etiquetas de ronda KO */
  const KO_MATCH_LABEL = { r32: '1/16', r16: '1/8', quarters: '1/4', semis: 'Semifinal', thirdPlace: '3º y 4º puesto', final: 'Final' };
  const KO_QUAL_LABEL  = { r32: 'dieciseisavos (1/16)', r16: 'octavos', qf: 'cuartos', sf: 'semifinales', thirdPlace: '3º y 4º puesto', final: 'la final' };

  function renderDetail(name) {
    const p = players.find(x => x.name === name);
    if (!p) { $('#resDetail').innerHTML = ''; return; }

    const today = todayKey();
    const dayKeysAll = DATA.clasif.day_keys;
    const dayLabels  = DATA.clasif.day_labels;
    const bd = scComputePlayerBreakdown(DATA, p);

    /* Día/fase más reciente con puntos → se auto-despliega. */
    let lastActive = null;
    dayKeysAll.forEach(k => { if (bd.byKey[k] && bd.byKey[k].subtotal > 0) lastActive = k; });

    const dayBlocks = dayKeysAll.map(key => {
      if (key === 'salida') return '';
      const cell = bd.byKey[key] || { items: [], subtotal: 0 };
      const isPhase = key.startsWith('ph_');
      const isGroupDate = !!matchdays[key];
      if (!isPhase && !isGroupDate) return '';
      // Las fases sólo se muestran cuando ya tienen algo; los días de grupo siempre.
      if (isPhase && cell.items.length === 0) return '';

      const idx = dayKeysAll.indexOf(key);
      const title = isPhase ? (dayLabels[idx] || key.replace('ph_', '')) : fmtDate(key);
      const sub   = isPhase ? 'Eliminatorias' : dowOf(key);

      const rows = cell.items.map(itemMarkup).join('') ||
        '<div class="res-empty-day">Aún sin puntos este día.</div>';

      let meta;
      if (isPhase) {
        meta = `${cell.items.length} ${cell.items.length === 1 ? 'concepto' : 'conceptos'}`;
      } else {
        const matches = matchdays[key] || [];
        const played = matches.filter(m => m.result).length;
        meta = `${matches.length} ${matches.length === 1 ? 'partido' : 'partidos'} · ${played} jugado${played === 1 ? '' : 's'}`;
      }

      const open = (key === today || key === lastActive) ? ' open' : '';
      return `<div class="res-day${open}${isPhase ? ' res-day-ko' : ''}" data-key="${esc(key)}">
        <button class="res-day-head" type="button">
          <div class="res-day-info">
            <span class="res-day-date">${esc(title)}</span>
            <span class="res-day-dow">${esc(sub)}</span>
          </div>
          <span class="res-day-meta">${esc(meta)}</span>
          <span class="res-day-pts">${cell.subtotal} pts</span>
          <span class="res-day-toggle" aria-hidden="true">▾</span>
        </button>
        <div class="res-day-matches">${rows}</div>
      </div>`;
    }).join('');

    $('#resDetail').innerHTML = `
      <div class="res-detail-head">
        <div class="res-detail-name">${esc(p.name)}</div>
        <div class="res-detail-meta">
          <span class="res-detail-pill">🏆 Total acumulado: <b>${bd.total} pts</b></span>
        </div>
      </div>
      <p class="res-detail-note">Incluye puntos por partido, por equipos que pasan de fase y por posición exacta de grupo.</p>
      <div class="res-days">${dayBlocks}</div>`;

    $$('.res-day-head').forEach(btn => {
      btn.addEventListener('click', () => btn.parentElement.classList.toggle('open'));
    });
  }

  /* Despacha cada concepto a su markup según el tipo. */
  function itemMarkup(it) {
    switch (it.kind) {
      case 'gpmatch':   return gpRowMarkup(it.mc, it.pred, it.actual, it.pts);
      case 'komatch':   return koRowMarkup(it);
      case 'position':  return conceptRow('pos', '🎯',
                          `Posición exacta · Grupo ${esc(it.group)}`,
                          `${it.pos}º: ${esc(it.team)}`, it.pts);
      case 'qualifier': return conceptRow('qual', '✅',
                          `Equipos clasificados a ${esc(KO_QUAL_LABEL[it.round] || it.round)}`,
                          `${it.teams.map(esc).join(', ')} · ${it.teams.length} × ${SC_QUALIFIER_POINTS[it.round]} pts`, it.pts);
      case 'qualbet':   return pendingConceptRow('qual', '🔖',
                          `Equipos firmados a ${esc(KO_QUAL_LABEL[it.round] || it.round)}`,
                          `${it.teams.map(esc).join(', ')} · +${SC_QUALIFIER_POINTS[it.round]} por equipo que pase`);
      case 'kobet':     return koRowMarkup(it, true);
      case 'award':     return conceptRow('award', '⭐', esc(it.label), '', it.pts);
      default:          return '';
    }
  }

  function conceptRow(cls, icon, title, detail, pts) {
    const ptsClass = pts > 0 ? 'res-pts win' : 'res-pts zero';
    return `<div class="res-row res-row-concept res-${cls}">
      <div class="res-row-left">
        <span class="res-concept-ic">${icon}</span>
        <span class="res-teams">
          <span class="res-concept-title">${title}</span>
          ${detail ? `<span class="res-concept-detail">${detail}</span>` : ''}
        </span>
      </div>
      <div class="${ptsClass}">${pts > 0 ? '+' + pts : pts}</div>
    </div>`;
  }

  function gpRowMarkup(mc, pred, actual, pts) {
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

  function koRowMarkup(it, pending) {
    const predStr = it.pred ? `${it.pred.signo}|${it.pred.gh}-${it.pred.ga}` : '—';
    const ptsClass = pending ? 'res-pts pending' : (it.pts > 0 ? 'res-pts win' : 'res-pts zero');
    const real = pending ? '<span class="res-pending">pdte.</span>' : esc(it.result);
    const ptsCell = pending ? '—' : (it.pts > 0 ? '+' + it.pts : it.pts);
    return `<div class="res-row res-row-ko">
      <div class="res-row-left">
        <span class="res-time res-ko-tag">${esc(KO_MATCH_LABEL[it.round] || 'KO')}</span>
        <span class="res-teams">
          <span class="res-home">${esc(it.home)}</span>
          <span class="res-vs">vs</span>
          <span class="res-away">${esc(it.away)}</span>
        </span>
      </div>
      <div class="res-row-mid">
        <span class="res-label">tu apuesta</span>
        <span class="res-pred">${esc(predStr)}</span>
      </div>
      <div class="res-row-mid">
        <span class="res-label">real</span>
        <span class="res-actual">${real}</span>
      </div>
      <div class="${ptsClass}">${ptsCell}</div>
    </div>`;
  }

  function pendingConceptRow(cls, icon, title, detail) {
    return `<div class="res-row res-row-concept res-${cls} res-row-pending">
      <div class="res-row-left">
        <span class="res-concept-ic">${icon}</span>
        <span class="res-teams">
          <span class="res-concept-title">${title}</span>
          ${detail ? `<span class="res-concept-detail">${detail}</span>` : ''}
        </span>
      </div>
      <div class="res-pts pending">—</div>
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
