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

  const groups = { '1': [], 'X': [], '2': [] };
  if (gpIdx != null) players.forEach(p => {
    const raw = p.bets && p.bets.gp ? p.bets.gp[gpIdx] : null;
    if (!raw) return;
    const parts = String(raw).split('|');
    const sg = parts[0];
    const res = parts[1] || '—';
    if (groups[sg]) groups[sg].push({ name: p.name, res });
  });

  const byResThenName = (a, b) =>
    a.res === b.res ? a.name.localeCompare(b.name, 'es') : a.res.localeCompare(b.res, 'es');
  Object.values(groups).forEach(g => g.sort(byResThenName));

  const topRes = s.top_result || null;
  const rows = arr => arr.length
    ? arr.map(x => `<div class="bm-row${x.res===topRes?' topres':''}"><span class="pn">${esc(x.name)}</span><span class="rs">${esc(x.res)}</span></div>`).join('')
    : '<div class="bm-empty">Nadie lo ha firmado.</div>';
  const grp = (cls, ico, title, arr) =>
    `<div class="bm-group ${cls}"><h4><span>${ico} ${title}</span><span class="cnt">${arr.length} ${arr.length===1?'porrista':'porristas'}</span></h4><div class="bm-rows">${rows(arr)}</div></div>`;

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
      </div>
    </div>
    <div class="bm-summary">Lo que firman los <b>${tot}</b> porristas · 🎯 más repetido: <b>${esc(topRes||'—')}</b> (${s.top_result_n||0})</div>
    ${grp('home','🏠',`Gana ${esc(mc.home)}`,groups['1'])}
    ${grp('draw','🤝','Empate',groups['X'])}
    ${grp('away','🛫',`Gana ${esc(mc.away)}`,groups['2'])}`;
  $('#modalBg').classList.add('open');
  $('#closeModal').addEventListener('click', closeModal);
}
