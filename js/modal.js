/* ===========================================================
   modal.js — cierre genérico del modal y modal "apuestas por partido"
   =========================================================== */

function closeModal() {
  $('#modalBg').classList.remove('open');
}

$('#modalBg').addEventListener('click', e => {
  if (e.target.id === 'modalBg') closeModal();
});

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') closeModal();
});

/* ===== Lookup de partido por número ===== */
function matchByNum(num) {
  for (const k of dayKeys) {
    const m = days[k].find(x => x.num === num);
    if (m) return m;
  }
  return null;
}

const GP_IDX = (function () {
  const m = {};
  (DATA.gp_matches || []).forEach((g, j) => { m[g.name] = j; });
  return m;
})();

function openMatchBets(num) {
  const mc = matchByNum(num);
  if (!mc) return;
  const gpIdx = GP_IDX[mc.name];          // bets.gp va en orden oficial FIFA, no por num cronológico
  const gp = (DATA.gp_matches || [])[gpIdx] || {};
  const s = mc.stats || {};
  const tot = Math.max(s.total || 0, 1);
  const topRes = s.top_result || null;
  const actualRes = mc.result || null;   // marcador real, si el partido ya se jugó

  /* Agrupar apuestas por signo (1/X/2) y dentro de cada signo por resultado exacto.
     Estructura: bySigno[sg] = { "2-1": ["Pi","Chencho"], "1-0": [...] }   */
  const bySigno = { '1': {}, 'X': {}, '2': {} };
  const totalsBySigno = { '1': 0, 'X': 0, '2': 0 };

  if (gpIdx != null) players.forEach(p => {
    const raw = p.bets && p.bets.gp ? p.bets.gp[gpIdx] : null;
    if (!raw) return;
    const parts = String(raw).split('|');
    const sg = parts[0];
    const res = parts[1] || '—';
    if (!bySigno[sg]) return;
    if (!bySigno[sg][res]) bySigno[sg][res] = [];
    bySigno[sg][res].push(p.name);
    totalsBySigno[sg]++;
  });

  /* Votantes de cada resultado: orden alfabético español. */
  Object.values(bySigno).forEach(group => {
    Object.values(group).forEach(names => names.sort((a, b) => a.localeCompare(b, 'es')));
  });

  /* Resultados ordenados por nº de votos descendente, desempate por valor. */
  function sortedResults(sg) {
    return Object.entries(bySigno[sg])
      .sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0], 'es'));
  }

  const renderResult = (res, names) => {
    const isTop    = res === topRes;
    const isActual = res === actualRes;
    const flags = [isTop && 'topres', isActual && 'actual'].filter(Boolean).join(' ');
    const badges = [
      isActual ? '<span class="bm-res-badge actual">✓ resultado real</span>' : '',
      (isTop && !isActual) ? '<span class="bm-res-badge top">🎯 más votado</span>' : ''
    ].join('');
    return `<div class="bm-result ${flags}" data-res="${esc(res)}">
      <button class="bm-result-head" type="button">
        <span class="bm-res-score">${esc(res)}</span>
        ${badges}
        <span class="bm-res-count">${names.length} ${names.length===1?'voto':'votos'}</span>
        <span class="bm-res-toggle" aria-hidden="true">▾</span>
      </button>
      <div class="bm-result-voters">
        ${names.map(n => `<span class="bm-voter" data-name="${esc(n.toLowerCase())}">${esc(n)}</span>`).join('')}
      </div>
    </div>`;
  };

  const renderGroup = (cls, ico, title, sg) => {
    const total = totalsBySigno[sg];
    if (!total) return `<div class="bm-group ${cls}">
      <h4><span>${ico} ${title}</span><span class="cnt">0 porristas</span></h4>
      <div class="bm-empty">Nadie lo ha firmado.</div>
    </div>`;
    const results = sortedResults(sg);
    return `<div class="bm-group ${cls}">
      <h4><span>${ico} ${title}</span><span class="cnt">${total} ${total===1?'porrista':'porristas'}</span></h4>
      <div class="bm-results">${results.map(([res, names]) => renderResult(res, names)).join('')}</div>
    </div>`;
  };

  const time = mc.dt ? mc.dt.slice(11) : '';
  $('#modalContent').innerHTML = `
    <button class="x" id="closeModal">✕</button>
    <div class="bm-head">
      <div class="bm-teams">${esc(mc.home)} <span class="vs">vs</span> ${esc(mc.away)}</div>
      <div class="bm-meta">
        <span class="bm-chip">⚽ Partido ${mc.num} · Fase de grupos</span>
        ${time?`<span class="bm-chip">🇪🇸 ${time} h</span>`:''}
        ${gp.group?`<span class="bm-chip">Grupo ${esc(String(gp.group).replace(/[0-9]/g,''))}</span>`:''}
        ${gp.triple?`<span class="bm-chip trip">✖3 Vale triple</span>`:''}
        ${actualRes?`<span class="bm-chip actual">✓ Final ${esc(actualRes)}</span>`:''}
      </div>
    </div>
    <div class="bm-summary">Lo que firman los <b>${tot}</b> porristas · 🎯 más repetido: <b>${esc(topRes||'—')}</b> (${s.top_result_n||0})</div>
    <div class="bm-search">
      <span class="bm-search-ico" aria-hidden="true">🔍</span>
      <input type="text" id="bmSearch" placeholder="Buscar porrista (p. ej. Chema, Pi, Diego)…" autocomplete="off">
      <span class="bm-search-clear" id="bmSearchClear" aria-hidden="true">✕</span>
    </div>
    <div class="bm-no-match" id="bmNoMatch" style="display:none">Ningún porrista coincide con esa búsqueda.</div>
    ${renderGroup('home','🏠',`Gana ${esc(mc.home)}`,'1')}
    ${renderGroup('draw','🤝','Empate','X')}
    ${renderGroup('away','🛫',`Gana ${esc(mc.away)}`,'2')}`;

  $('#modalBg').classList.add('open');
  $('#closeModal').addEventListener('click', closeModal);

  /* ===== Toggle de cada resultado al hacer click ===== */
  $$('.bm-result-head').forEach(btn => {
    btn.addEventListener('click', () => {
      btn.parentElement.classList.toggle('open');
    });
  });

  /* ===== Buscador de porrista ===== */
  const inp = $('#bmSearch');
  const clr = $('#bmSearchClear');
  const noMatch = $('#bmNoMatch');

  function applySearch(q) {
    q = (q || '').trim().toLowerCase();
    const empty = !q;
    let anyMatch = false;
    $$('.bm-result').forEach(r => {
      const voters = [...r.querySelectorAll('.bm-voter')];
      if (empty) {
        voters.forEach(v => v.classList.remove('search-match'));
        r.classList.remove('search-hit', 'open');
        r.style.display = '';
        return;
      }
      let hit = false;
      voters.forEach(v => {
        const m = v.dataset.name.includes(q);
        v.classList.toggle('search-match', m);
        if (m) hit = true;
      });
      r.classList.toggle('search-hit', hit);
      r.classList.toggle('open', hit);
      r.style.display = hit ? '' : 'none';
      if (hit) anyMatch = true;
    });
    /* Ocultar cabeceras de grupos vacíos durante búsqueda */
    $$('.bm-group').forEach(g => {
      const visible = [...g.querySelectorAll('.bm-result')].some(r => r.style.display !== 'none');
      g.style.display = (empty || visible) ? '' : 'none';
    });
    clr.style.display = empty ? 'none' : 'inline';
    noMatch.style.display = (!empty && !anyMatch) ? 'block' : 'none';
  }

  if (inp) inp.addEventListener('input', e => applySearch(e.target.value));
  if (clr) clr.addEventListener('click', () => { inp.value = ''; applySearch(''); inp.focus(); });
}
