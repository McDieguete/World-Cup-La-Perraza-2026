/* ===========================================================
   clasif.js — panel "Clasificación": gráfico SVG y tabla diaria
   =========================================================== */

const CL = DATA.clasif;
let clasShowAll = false;

/* Paleta del gráfico — inspirada en la identidad tricolor del Mundial
   (rojo Canadá, verde México, azul USA, navy + acento dorado). */
const CHART_COLORS = [
  '#E2231A', '#1A4FB8', '#00873E', '#C9A227', '#15163A',
  '#9aa0c7', '#ff7264', '#5b86d4', '#5db983', '#e0c46a'
];

function lastDataIdx() {
  if (typeof CL.last_day === 'number') return CL.last_day;
  // index of last day that has any non-zero among series (else 0 = salida)
  const D = CL.day_labels.length;
  for (let i = D - 1; i >= 0; i--) {
    if (Object.values(CL.series).some(a => a[i] > 0)) return i;
  }
  return 0;
}

function standingsAt(idx) {
  // returns sorted [{name,pts,prevPts}] ; ties -> alphabetical
  const arr = Object.keys(CL.series).map(n => ({
    name: n,
    pts:  CL.series[n][idx],
    prev: idx > 0 ? CL.series[n][idx - 1] : 0
  }));
  arr.sort((a, b) => b.pts - a.pts || a.name.localeCompare(b.name, 'es'));
  return arr;
}

function rankMap(idx) {
  const s = standingsAt(idx);
  const m = {};
  let rk = 0, lp = null;
  s.forEach((r, i) => {
    if (r.pts !== lp) { rk = i + 1; lp = r.pts; }
    m[r.name] = rk;
  });
  return m;
}

function buildChart(selNames) {
  const D = CL.day_labels.length;
  const W = 820, H = 360, padL = 46, padR = 14, padT = 18, padB = 46;
  const plotW = W - padL - padR, plotH = H - padT - padB;
  let maxY = 0;
  selNames.forEach(n => CL.series[n].forEach(v => { if (v > maxY) maxY = v; }));
  const niceMax = Math.max(10, Math.ceil(maxY / 10) * 10);
  const x = i => padL + (D <= 1 ? 0 : i * plotW / (D - 1));
  const y = v => padT + plotH - (v / niceMax) * plotH;

  // gridlines
  let grid = '';
  for (let g = 0; g <= 5; g++) {
    const gy = padT + plotH - g * plotH / 5;
    const val = Math.round(niceMax * g / 5);
    grid += `<line x1="${padL}" y1="${gy}" x2="${W-padR}" y2="${gy}" stroke="rgba(21,22,58,.08)"/><text x="${padL-8}" y="${gy+4}" text-anchor="end" font-size="10" fill="#6B7280" font-family="JetBrains Mono">${val}</text>`;
  }

  // x labels (thin out if many)
  let xl = '';
  const step = Math.ceil(D / 12);
  CL.day_labels.forEach((lb, i) => {
    if (i % step !== 0 && i !== D - 1) return;
    xl += `<text x="${x(i)}" y="${H-padB+18}" text-anchor="middle" font-size="9.5" fill="#6B7280" font-family="JetBrains Mono" transform="rotate(0 ${x(i)} ${H-padB+18})">${esc(lb.replace('🏁 ','').replace(' ',' '))}</text>`;
  });

  // lines
  let lines = '';
  selNames.forEach((n, k) => {
    const col = CHART_COLORS[k % CHART_COLORS.length];
    const LI = lastDataIdx();
    const pts = CL.series[n].slice(0, LI + 1).map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
    lines += `<polyline points="${pts}" fill="none" stroke="${col}" stroke-width="2.4" stroke-linejoin="round" opacity="0.95"/>`;
    // end dot
    const li = LI;
    lines += `<circle cx="${x(li)}" cy="${y(CL.series[n][li])}" r="3.2" fill="${col}"/>`;
  });

  const overlay = !CL.started
    ? `<text x="${padL+plotW/2}" y="${padT+plotH/2}" text-anchor="middle" font-size="13" fill="#6B7280" font-family="JetBrains Mono">🏁 Línea de salida · todos a 0 pts</text>`
    : '';
  return `<svg class="chart-svg" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">${grid}${xl}${lines}${overlay}</svg>`;
}

function buildLegend(selNames) {
  return `<div class="legend">`
    + selNames.map((n, k) => `<div class="li"><span class="sw" style="background:${CHART_COLORS[k%CHART_COLORS.length]}"></span>${esc(n)}</div>`).join('')
    + `</div>`;
}

function fillDaySelect() {
  const sel = $('#clasDaySel');
  if (!sel) return;
  const li = lastDataIdx();
  sel.innerHTML = CL.day_labels.map((lb, i) => ({ lb, i }))
    .filter(o => o.i <= li)
    .map(({ lb, i }) => `<option value="${i}" ${i===li?'selected':''}>${esc(lb)}</option>`)
    .join('');
}

function renderClasTable(idx) {
  const st = standingsAt(idx);
  const prevRank = idx > 0 ? rankMap(idx - 1) : null;
  const topNames = new Set(standingsAt(lastDataIdx()).slice(0, 5).map(r => r.name));
  let rows = '';
  let __rk = 0, __lp = null;
  st.forEach((r, i) => {
    if (r.pts !== __lp) { __rk = i + 1; __lp = r.pts; }
    const pos = __rk;
    let mv;
    if (!CL.started || idx <= 1) {
      mv = `<span class="mv new">▬</span>`;
    } else {
      const pr = prevRank[r.name];
      const diff = pr - pos;
      if (diff > 0)      mv = `<span class="mv up">▲ ${diff}</span>`;
      else if (diff < 0) mv = `<span class="mv down">▼ ${-diff}</span>`;
      else               mv = `<span class="mv same">=</span>`;
    }
    const dpts = r.pts - r.prev;
    rows += `<tr class="${topNames.has(r.name)?'hl-top':''}"><td class="pos">${pos}</td><td class="nm">${esc(r.name)}</td><td class="pts">${r.pts}</td><td>${(CL.started&&idx>0&&dpts!==0)?(dpts>0?'+'+dpts:dpts):'—'}</td><td>${mv}</td></tr>`;
  });
  $('#clasTable').innerHTML = `<thead><tr><th>Pos</th><th style="text-align:left;padding-left:14px">Jugador</th><th>Puntos</th><th>Pts día</th><th>Δ posición</th></tr></thead><tbody>${rows}</tbody>`;
}

function renderClasif() {
  const nb = $('#clasNote');
  if (nb) nb.textContent = CL.note;

  if ($('#clasChart').dataset.done !== '1') {
    fillDaySelect();
    $('#clasDaySel').addEventListener('change', e => renderClasTable(+e.target.value));
    $('#toggleAll').addEventListener('click', () => {
      clasShowAll = !clasShowAll;
      $('#toggleAll').classList.toggle('on', clasShowAll);
      $('#toggleAll').textContent = clasShowAll ? 'Ver solo top 5' : 'Ver todos (81)';
      drawChart();
    });
    $('#clasChart').dataset.done = '1';
  }
  drawChart();
  renderClasTable(lastDataIdx());
}

function drawChart() {
  const li = lastDataIdx();
  const ranking = standingsAt(li);
  const sel = clasShowAll ? ranking.map(r => r.name) : ranking.slice(0, 5).map(r => r.name);
  $('#clasChart').innerHTML = buildChart(sel);
  $('#clasLegend').innerHTML = clasShowAll
    ? '<div class="legend"><div class="li" style="color:var(--cream-dim)">Mostrando los 81 porristas — la leyenda se omite por espacio.</div></div>'
    : buildLegend(sel);
}

/* Auto-render al cargar: la Clasificación es la pestaña activa por defecto, así
   que se pinta ya al ejecutarse este módulo (script defer → el DOM y DATA ya
   están listos), sin depender de eventos ni de que el usuario pulse la pestaña.
   Mismo patrón que players.js. Idempotente si nav.js la vuelve a invocar. */
if (typeof DATA !== 'undefined' && $('#clasChart')) renderClasif();
