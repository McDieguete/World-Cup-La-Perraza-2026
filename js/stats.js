/* ===========================================================
   stats.js — panel "Estadísticas de la porra"
              tablas, barras, sorpresas, riesgo y patitos feos
   =========================================================== */

/* ===== Tabla "hasta dónde llega cada selección" (heatmap) ===== */
(function () {
  const rounds = [
    ['r32', '1/16'], ['r16', '1/8'], ['quarters', '1/4'],
    ['semis', 'Semis'], ['final', 'Final'], ['champion', 'Campeón']
  ];
  const adv = DATA.stats.advancement;

  function heatColor(v) {
    const r = v / N;
    if (v === 0) return 'background:rgba(255,255,255,.03);color:var(--cream-dim)';
    const a = 0.12 + r * 0.78;
    return `background:rgba(254,221,0,${a.toFixed(2)});color:${r>0.45?'#1a0f06':'var(--cream)'}`;
  }

  let html = `<thead><tr><th class="rank"></th><th class="tname">Selección</th>`
    + rounds.map(r => `<th>${r[1]}</th>`).join('')
    + `</tr></thead><tbody>`;
  adv.forEach((t, i) => {
    html += `<tr><td class="rank">${i+1}</td><td class="tname">${esc(t.team)}</td>`
      + rounds.map(r => `<td><span class="heat" style="${heatColor(t[r[0]])}">${t[r[0]]}</span></td>`).join('')
      + `</tr>`;
  });
  $('#advTable').innerHTML = html + `</tbody>`;
})();

/* ===== Helper: lista de barras ===== */
function bars(el, arr, cls) {
  const max = Math.max(...arr.map(a => a[1]), 1);
  $(el).innerHTML = arr.map((a, i) =>
    `<div class="barrow"><div class="top"><span class="name"><span class="pos">${i+1}.</span>${esc(a[0])}</span><span class="val">${a[1]}</span></div><div class="track"><div class="fill ${cls||''}" style="width:0" data-w="${(a[1]/max*100).toFixed(1)}"></div></div></div>`
  );
}

/* ===== Tabla de cifras / curiosidades ===== */
(function () {
  const m = DATA.summary;
  const r0 = (DATA.riskiest && DATA.riskiest[0]) || { who: '—', bet: '—' };
  const rows = [
    ['🥇 Campeón más votado',           `${m.champ_top} — ${m.champ_n} de ${m.n} (${m.champ_pct}%)`, 1],
    ['🥈 Subcampeón más votado',        `${m.runner_top} — ${m.runner_n} votos`, 0],
    ['🎯 Semifinalista más repetido',   `${m.semis_top} — ${m.semis_n} de ${m.n}`, 0],
    ['🏅 Balón de Oro favorito',        `${m.balon_top} — ${m.balon_n} votos`, 0],
    ['👟 Bota de Oro favorita',         `${m.bota_top} — ${m.bota_n} votos`, 0],
    ['🚀 Sorpresa más popular',         `${m.surprise_team} en cuartos — ${m.surprise_qf} porristas`, 0],
    ['⚡ Apuesta más arriesgada',       `${r0.who}: ${r0.bet}`, 1],
    ['🦆 Patito feo nº1',               `${m.fourth_top} — ${m.fourth_n} votos a último de su grupo`, 0],
    ['🪖 Soldado de Bordalás (menos goles)', `${m.soldado} — ${m.soldado_goals} goles`, 0],
    ['🍻 Kompany Enjoyer (más goles)',  `${m.kompany} — ${m.kompany_goals} goles`, 0],
    ['⚽ Media de goles por quiniela',  `${m.avg_goals} goles en todo el Mundial`, 0],
  ];
  $('#factsTable').innerHTML = '<tbody>'
    + rows.map(r => `<tr><td>${r[0]}</td><td class="${r[2]?'big':''}">${esc(r[1])}</td></tr>`).join('')
    + '</tbody>';
})();

/* ===== Listas de barras (top 8 de cada premio) ===== */
bars('#champBars',  DATA.stats.champ.slice(0, 8),       '');
bars('#runnerBars', DATA.stats.runner.slice(0, 8),      'teal');
bars('#semisBars',  DATA.stats.semis_dist.slice(0, 8),  'coral');
bars('#balonBars',  DATA.stats.balon.slice(0, 8),       '');
bars('#botaBars',   DATA.stats.bota.slice(0, 8),        'coral');

/* ===== Sorpresas por equipo ===== */
(function () {
  const EMO = {
    'Agente del caos': '🎲', 'Cholista': '🚌', 'Exótico': '🌍',
    'Romántico': '❤️', 'Dark Horse': '🐎', 'Equipo de moda': '🔥',
    'Vieja gloria': '👴', 'Anfitrión': '🏟️'
  };
  const arr = DATA.stats.surprise_teams || [];
  $('#surpriseTeams').innerHTML = arr.map(t => {
    const val = t.qf > 0
      ? `${t.qf} a cuartos · ${t.r16} a octavos`
      : (t.r16 > 0 ? `${t.r16} a octavos · ${t.r32} a 1/16` : `${t.r32} pasan de grupo`);
    return `<div class="surp-row"><span class="st-team">${esc(t.team)}</span><span class="st-cat">${EMO[t.cat]||'•'} ${esc(t.cat)}</span><span class="st-val">${val}</span></div>`;
  }).join('');
})();

/* ===== Apuestas más arriesgadas ===== */
(function () {
  $('#riskList').innerHTML = (DATA.riskiest || []).map(r =>
    `<div class="risk-card"><div class="rk-bet">⚡ ${esc(r.bet)}</div><div class="rk-who">🎫 ${esc(r.who)}</div><div class="rk-why">${esc(r.why)}</div></div>`
  ).join('');
})();

/* ===== Patitos feos (último de grupo) ===== */
(function () {
  $('#worstGrid').innerHTML = DATA.stats.fourth.slice(0, 8).map((t, i) =>
    `<div class="worst-card"><span class="rk">#${i+1}</span><div class="tm">${esc(t[0])}</div><div class="v"><b>${t[1]}</b> votos a farolillo rojo</div></div>`
  ).join('');
})();

function animateBars() {
  $$('.fill').forEach(f => { f.style.width = f.dataset.w + '%'; });
}
