/* ===========================================================
   jornada.js — panel "Próxima jornada"
                navegación día a día, frase, curiosidad y partidos
   =========================================================== */

const days    = DATA.matchdays;
const dayKeys = Object.keys(days).sort();

const DOW = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const MON = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
             'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

let curIdx = (function () {
  const t = new Date();
  t.setHours(0, 0, 0, 0);
  for (let i = 0; i < dayKeys.length; i++) {
    if (parseDay(dayKeys[i]) >= t) return i;
  }
  return 0;
})();

/* ===== Selección determinista (semilla por día) ===== */
function pick(arr, dayKey, teamsToday) {
  const rel = arr.filter(q => q.teams && q.teams.some(t => teamsToday.includes(t)));
  const seed = [...dayKey].reduce((a, c) => a + c.charCodeAt(0), 0);
  if (rel.length) return rel[seed % rel.length];
  const gen = arr.filter(q => !q.teams || q.teams.length === 0);
  return gen.length ? gen[seed % gen.length] : arr[seed % arr.length];
}

function fmtDate(key) {
  const [y, m, d] = key.split('-').map(Number);
  return `${d} de ${MON[m-1]}`;
}

function renderDay() {
  const key = dayKeys[curIdx];
  const matches = days[key];
  const dt = parseDay(key);

  $('#dayDow').textContent  = DOW[dt.getDay()];
  $('#dayDate').textContent = fmtDate(key);
  $('#prevDay').disabled = curIdx === 0;
  $('#nextDay').disabled = curIdx === dayKeys.length - 1;

  $('#dayChips').innerHTML = dayKeys.map((k, i) => {
    const [yy, mm, dd] = k.split('-').map(Number);
    return `<div class="chip ${i===curIdx?'active':''}" data-i="${i}">${dd} ${MON[mm-1].slice(0,3)} · ${days[k].length}⚽</div>`;
  }).join('');
  $$('.chip').forEach(c => c.addEventListener('click', () => { curIdx = +c.dataset.i; renderDay(); }));

  const teamsToday = [...new Set(matches.flatMap(m => [m.home, m.away]))];
  const locked = dt > TODAY && !((DATA.unlock_days || []).includes(key));  // no spoilers: solo visible el día exacto (o pasado)

  if (locked) {
    $('#quoteBox').outerHTML = '<div class="locked" id="quoteBox"><div class="lk">🔒</div><div class="lt">La frase del día se desvela el ' + fmtDate(key) + '</div><div class="ld">Sin spoilers — vuelve ese día.</div></div>';
    $('#curioBox').outerHTML = '<div class="locked" id="curioBox"><div class="lk">🔒</div><div class="lt">La curiosidad del día se desvela el ' + fmtDate(key) + '</div><div class="ld">La fila del bigote no admite adelantados.</div></div>';
  } else {
    const __pin = (DATA.pinned_phrases || {})[key];
    const q = __pin ? DATA.phrases.find(x => x.n === __pin) : pick(DATA.phrases, key, teamsToday);
    $('#quoteBox').outerHTML = `<div class="quote" id="quoteBox"><div class="qk">📣 La frase del día</div><div class="qt">${esc(q.text)}</div><div class="qa">— <b>${esc(q.author)}</b> · <span class="yr">${esc(q.year)}</span></div></div>`;

    const __pinC = (DATA.pinned_curiosities || {})[key];
    const c = __pinC ? __pinC : pick(DATA.curiosities, key, teamsToday);
    const src = c.src === 'guardian'
      ? '🗞️ Vía guía de The Guardian'
      : (c.src === 'news' ? '📰 Actualidad mundialista' : '📚 Curiosidades del Mundial');
    $('#curioBox').outerHTML = `<div class="curio" id="curioBox"><div class="ck">🤓 La curiosidad del día</div><div class="ct">${esc(c.text)}</div><div class="csrc">${src}</div></div>`;
  }

  $('#matchList').innerHTML = matches.map(mc => {
    const s = mc.stats;
    const tot = Math.max(s.total, 1);
    const ph = (s['1'] / tot * 100), pa = (s['2'] / tot * 100);
    const time = mc.dt.slice(11);
    const fin = mc.result ? mc.result.split('-').map(Number) : null;
    const finSign = fin ? (fin[0] > fin[1] ? '1' : (fin[0] < fin[1] ? '2' : 'X')) : null;
    const signN = finSign === '1' ? s['1'] : (finSign === '2' ? s['2'] : s.X);

    return `<div class="match-card${fin?' played':''}">
      <div class="mc-head"><span class="mc-time">🇪🇸 ${time} h</span>${fin?'<span class="mc-final">✅ FINAL</span>':''}<span class="mc-tag">Fase de grupos · partido ${mc.num}${mc.triple?' · ⭐ TRIPLE':''}</span></div>
      <div class="mc-teams"><div class="mc-team"><div class="nm">${esc(mc.home)}</div></div>${fin?`<div class="mc-score"><b>${fin[0]}</b><span>–</span><b>${fin[1]}</b></div>`:'<div class="mc-vs">vs</div>'}<div class="mc-team"><div class="nm">${esc(mc.away)}</div></div></div>
      <div class="votebar">
        <div class="vseg home${finSign==='1'?' hit':''}" style="flex:${Math.max(s['1'],0.001)}">${s['1']>0?s['1']:''}</div>
        <div class="vseg draw${finSign==='X'?' hit':''}" style="flex:${Math.max(s.X,0.001)}">${s.X>0?s.X:''}</div>
        <div class="vseg away${finSign==='2'?' hit':''}" style="flex:${Math.max(s['2'],0.001)}">${s['2']>0?s['2']:''}</div>
      </div>
      ${fin?`<div class="mc-real">🏁 Acertaron el 1X2 <b>${signN}</b> de ${s.total} porristas · clavaron el marcador exacto (<b>${esc(mc.result)}</b>) <b>${mc.result_exact}</b>${mc.triple?' · <span class="trip">¡valía TRIPLE!</span>':''}</div>`:''}
      <div class="vlabels"><span>🏠 Gana ${esc(mc.home)}: <b>${s['1']}</b> (${ph.toFixed(0)}%)</span><span>Empate: <b>${s.X}</b></span><span>Gana ${esc(mc.away)}: <b>${s['2']}</b> (${pa.toFixed(0)}%) 🛫</span></div>
      <div class="mc-foot"><span class="lbl">🎯 Resultado exacto más repetido:</span><span class="result-pill">${esc(s.top_result||'—')}</span><span class="rn">lo firman ${s.top_result_n} porristas</span></div>
      <button class="bets-btn" data-num="${mc.num}"><span class="bb-ic">👥</span> Ver las ${s.total} apuestas a este partido</button>
    </div>`;
  }).join('');
  $$('.bets-btn').forEach(b => b.addEventListener('click', () => openMatchBets(+b.dataset.num)));
}

$('#prevDay').addEventListener('click', () => { if (curIdx > 0)                  { curIdx--; renderDay(); } });
$('#nextDay').addEventListener('click', () => { if (curIdx < dayKeys.length - 1) { curIdx++; renderDay(); } });

renderDay();
