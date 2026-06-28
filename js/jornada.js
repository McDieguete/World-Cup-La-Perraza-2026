/* ===========================================================
   jornada.js — panel "Próxima jornada"
                navegación día a día, frase, curiosidad y partidos
                (fase de grupos + eliminatorias)
   =========================================================== */

const days    = DATA.matchdays;

/* ===== Eliminatorias: bracket estático + resolución de cruces =====
   DATA.ko_bracket lo rellena el cron (scripts/update-results.js): equipos y
   marcador a medida que football-data.org publica los cruces. Mientras tanto
   resolvemos lo que ya se sabe (1º/2º de grupos cerrados) y dejamos placeholders
   ("Ganador partido X", "Mejor 3º (…)") para lo que aún no está definido. */
const koBracket = DATA.ko_bracket || [];
const koByDate = {};
const koByNum  = {};
koBracket.forEach(e => {
  (koByDate[e.date] = koByDate[e.date] || []).push(e);
  koByNum[e.num] = e;
});

const KO_ROUND_LABEL = {
  r32: '1/16', r16: '1/8', quarters: '1/4',
  semis: 'Semifinal', thirdPlace: '3º y 4º puesto', final: 'Final'
};

/* Clasificación de cada grupo a partir de los resultados ya cargados.
   Mismo criterio que scripts/scoring.js (pts → dif → GF → alfabético). */
function computeGroupStandings() {
  const groupOfMatch = {};
  const meta = {};
  (DATA.gp_matches || []).forEach(g => {
    const letter = String(g.group || '').replace(/[0-9]/g, '');
    groupOfMatch[g.name] = letter;
    if (!meta[letter]) meta[letter] = { expected: 0, played: 0, st: {} };
    meta[letter].expected++;
  });
  const add = (st, team, gf, ga) => {
    const row = st[team] || (st[team] = { team, pts: 0, gd: 0, gf: 0 });
    row.gf += gf; row.gd += gf - ga;
    if (gf > ga) row.pts += 3; else if (gf === ga) row.pts += 1;
  };
  Object.values(DATA.matchdays || {}).forEach(matches => matches.forEach(m => {
    const letter = groupOfMatch[m.name];
    if (!letter) return;
    const sc = (m.result || '').match(/^(-?\d+)-(-?\d+)$/);
    if (!sc) return;
    const md = meta[letter];
    md.played++;
    add(md.st, m.home, +sc[1], +sc[2]);
    add(md.st, m.away, +sc[2], +sc[1]);
  }));
  const cmp = (a, b) => b.pts - a.pts || b.gd - a.gd || b.gf - a.gf || a.team.localeCompare(b.team, 'es');
  const out = {};
  Object.entries(meta).forEach(([letter, md]) => {
    out[letter] = {
      complete: md.expected > 0 && md.played >= md.expected,
      standings: Object.values(md.st).sort(cmp)
    };
  });
  return out;
}
const GROUP_STANDINGS = computeGroupStandings();

/** Ganador/perdedor real de un partido KO, si ya tiene marcador resuelto. */
function koOutcome(num, which) {
  const e = koByNum[num];
  if (!e || !e.result || !e.home_team || !e.away_team) return null;
  const sc = String(e.result).match(/^(-?\d+)-(-?\d+)$/);
  if (!sc) return null;
  const gh = +sc[1], ga = +sc[2];
  if (gh === ga) return null;                 // sin desempate cargado, no resolvemos
  const winner = gh > ga ? e.home_team : e.away_team;
  const loser  = gh > ga ? e.away_team : e.home_team;
  return which === 'L' ? loser : winner;
}

/** Resuelve un slot del bracket → { team, label }.
 *  team = equipo concreto si ya se conoce; si no, team=null y label es el placeholder. */
function resolveSlot(ref) {
  if (!ref) return { team: null, label: '—' };
  let m;
  if ((m = ref.match(/^([12])([A-L])$/))) {           // 1º / 2º de un grupo
    const pos = +m[1], g = GROUP_STANDINGS[m[2]];
    const label = `${pos}º Grupo ${m[2]}`;
    if (g && g.complete && g.standings[pos - 1]) return { team: g.standings[pos - 1].team, label };
    return { team: null, label };
  }
  if ((m = ref.match(/^3([A-L]+)$/))) {               // mejor 3º de un conjunto de grupos
    return { team: null, label: `Mejor 3º (${m[1].split('').join('/')})` };
  }
  if ((m = ref.match(/^W(\d+)$/))) {                  // ganador de un partido
    return { team: koOutcome(+m[1], 'W'), label: `Ganador partido ${m[1]}` };
  }
  if ((m = ref.match(/^L(\d+)$/))) {                  // perdedor de un partido (3º y 4º)
    return { team: koOutcome(+m[1], 'L'), label: `Perdedor partido ${m[1]}` };
  }
  return { team: ref, label: ref };                  // ya viene un nombre literal
}

/** Lado de un cruce KO: prioriza el equipo que el cron haya fijado (home_team/away_team). */
function koSide(entry, side) {
  const fixed = entry[side + '_team'];
  if (fixed) return { team: fixed, label: fixed, tbd: false };
  const r = resolveSlot(entry[side]);
  return { team: r.team, label: r.team || r.label, tbd: !r.team };
}

/** Nº de porristas que firmaron exactamente este cruce (en cualquier orden). */
function koBetsCount(homeTeam, awayTeam) {
  if (!homeTeam || !awayTeam) return 0;
  let n = 0;
  DATA.players.forEach(p => {
    const ko = p.bets && p.bets.ko;
    if (!Array.isArray(ko)) return;
    if (ko.some(k => {
      if (!k || !k.match) return false;
      const parts = k.match.split('-').map(s => s.trim());
      return parts.length === 2 &&
        ((parts[0] === homeTeam && parts[1] === awayTeam) ||
         (parts[0] === awayTeam && parts[1] === homeTeam));
    })) n++;
  });
  return n;
}

/* ===== Lista unificada de días (grupos + KO), ordenada ===== */
const dayKeys = [...new Set([...Object.keys(days), ...Object.keys(koByDate)])].sort();

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
function dayCount(k) {
  return (days[k] ? days[k].length : 0) + (koByDate[k] ? koByDate[k].length : 0);
}

function renderDay() {
  const key = dayKeys[curIdx];
  const matches = days[key] || [];
  const koMatches = koByDate[key] || [];
  const dt = parseDay(key);

  $('#dayDow').textContent  = DOW[dt.getDay()];
  $('#dayDate').textContent = fmtDate(key);
  $('#prevDay').disabled = curIdx === 0;
  $('#nextDay').disabled = curIdx === dayKeys.length - 1;

  $('#dayChips').innerHTML = dayKeys.map((k, i) => {
    const [yy, mm, dd] = k.split('-').map(Number);
    return `<div class="chip ${i===curIdx?'active':''}" data-i="${i}">${dd} ${MON[mm-1].slice(0,3)} · ${dayCount(k)}⚽</div>`;
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

  const groupCards = matches.map(mc => {
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

  const koCards = koMatches.map(renderKoCard).join('');
  const koHeader = (koMatches.length && matches.length)
    ? '<div class="ko-sep">🏆 Eliminatorias</div>' : '';

  $('#matchList').innerHTML = groupCards + koHeader + koCards;
  $$('.bets-btn').forEach(b => b.addEventListener('click', () => openMatchBets(+b.dataset.num)));
}

function renderKoCard(e) {
  const home = koSide(e, 'home');
  const away = koSide(e, 'away');
  const roundLabel = KO_ROUND_LABEL[e.round] || 'Eliminatoria';
  const time = e.time || (e.dt ? String(e.dt).slice(11, 16) : '');
  const fin = e.result ? String(e.result).split('-').map(Number) : null;
  const both = home.team && away.team;
  const betsN = both ? koBetsCount(home.team, away.team) : 0;

  return `<div class="match-card ko${fin?' played':''}">
    <div class="mc-head">
      <span class="mc-time">🗓️ ${esc(fmtDate(e.date))}${time?` · 🇪🇸 ${esc(time)} h`:''}</span>
      ${fin?'<span class="mc-final">✅ FINAL</span>':''}
      <span class="mc-tag">Eliminatorias · ${esc(roundLabel)} · partido ${e.num}</span>
    </div>
    <div class="mc-teams">
      <div class="mc-team"><div class="nm${home.tbd?' tbd':''}">${esc(home.label)}</div></div>
      ${fin?`<div class="mc-score"><b>${fin[0]}</b><span>–</span><b>${fin[1]}</b></div>`:'<div class="mc-vs">vs</div>'}
      <div class="mc-team"><div class="nm${away.tbd?' tbd':''}">${esc(away.label)}</div></div>
    </div>
    ${betsN ? `<div class="mc-real">👥 <b>${betsN}</b> porrista${betsN===1?'':'s'} firmaron este cruce en su quiniela.</div>` : ''}
  </div>`;
}

$('#prevDay').addEventListener('click', () => { if (curIdx > 0)                  { curIdx--; renderDay(); } });
$('#nextDay').addEventListener('click', () => { if (curIdx < dayKeys.length - 1) { curIdx++; renderDay(); } });

renderDay();
