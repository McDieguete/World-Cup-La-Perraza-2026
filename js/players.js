/* ===========================================================
   players.js — panel "¿Quién es quién?": fichas, perfiles,
                modal de jugador y bloque "ver toda la apuesta"
   =========================================================== */

/* ===== Estilos de perfil (emoji + clase de color) ===== */
const PROFILE_STYLE = {
  'Soldado de Bordalás':           ['🪖', 'b-slate'],
  'Kompany Enjoyer':               ['🍻', 'b-coral'],
  'Latin Lover':                   ['💃', 'b-coral'],
  'Síndrome Gamal Al-Ghandour':    ['🏟️', 'b-teal'],
  'El Indeciso':                   ['🤷', 'b-slate'],
  'El Stent':                      ['🩺', 'b-teal'],
  'El Apocalíptico':               ['☄️', 'b-red'],
  'El Funcionario del Fútbol':     ['📋', 'b-slate'],
  'Underdogs Enjoyer':             ['🐎', 'b-green'],
  'Panenkita':                     ['🥄', 'b-gold'],
  'El Desactualizado':             ['👴', 'b-slate'],
  'El Caipirinha':                 ['🍹', 'b-green'],
  'El Hater Oficial':              ['😈', 'b-red'],
  'El Cholista Internacional':     ['🚌', 'b-teal'],
  'El Geógrafo':                   ['🗺️', 'b-green'],
  'Eurofan':                       ['🇪🇺', 'b-blue'],
  'Colonialista':                  ['👑', 'b-gold'],
  'El Canciller':                  ['🇩🇪', 'b-gold'],
  "It's Coming Home":              ['🏴', 'b-red'],
  'Forofo Mayor':                  ['🇪🇸', 'b-coral'],
  'King Africa':                   ['🦁', 'b-green'],
  'Denominación de Origen Ibérica':['🥘', 'b-coral']
};
const profStyle = p => PROFILE_STYLE[p] || ['⚽', 'b-slate'];

/* ===== Fichas de jugador ===== */
const players = DATA.players;

function playerCard(p) {
  const [em, cls] = profStyle(p.profile);
  return `<div class="pcard" data-name="${esc(p.name)}">
    <div class="pcard-top">
      <div class="pname">${esc(p.name)}</div>
      <div class="badge ${cls}">${em} ${esc(p.profile)}</div>
    </div>
    <div class="podium">
      <div class="slot"><div class="medal">🥇</div><div class="team">${esc(p.champion||'—')}</div><div class="role">Campeón</div></div>
      <div class="slot"><div class="medal">🥈</div><div class="team">${esc(p.runnerup||'—')}</div><div class="role">Finalista</div></div>
      <div class="slot"><div class="medal">🥉</div><div class="team">${esc(p.third||'—')}</div><div class="role">3.º puesto</div></div>
    </div>
    <div class="prow"><span class="ic">🏅</span><span class="k">Balón de Oro</span><span class="v">${esc(p.balon||'—')}</span></div>
    <div class="prow"><span class="ic">👟</span><span class="k">Bota de Oro</span><span class="v">${esc(p.bota||'—')}</span></div>
    <div class="pedrada">
      <div class="lbl">💥 Su mayor pedrada</div>
      <div class="txt">${esc(p.pedrada||'Quiniela de consenso, sin sorpresas')}</div>
      ${p.pedrada_share!=null?`<div class="share">Solo ${p.pedrada_share} de ${N} lo firman</div>`:''}
    </div>
  </div>`;
}

function renderPlayers(list) {
  const grid = $('#pgrid');
  grid.innerHTML = list.map(playerCard).join('');
  $('#pcount').textContent = list.length;
  $('#noRes').style.display = list.length ? 'none' : 'block';
  $$('.pcard').forEach(c => c.addEventListener('click', () => openPlayer(c.dataset.name)));
}
$('#ptotal').textContent = N;

/* ----- Apuesta completa (botón +) ----- */
function parsePred(v) {
  if (!v || typeof v !== 'string') return null;
  const m = v.match(/^([1X2])\|(-?\d+)-(-?\d+)$/);
  return m ? { signo: m[1], gh: +m[2], ga: +m[3] } : null;
}

function fullBetsHTML(p) {
  const b = p.bets;
  if (!b) return '';
  const aw = b.awards || {};
  const chips = arr => `<div class="chiprow">${(arr||[]).filter(Boolean).map(t=>`<span class="tchip">${esc(t)}</span>`).join('')||'<span class="tchip">—</span>'}</div>`;

  // Knockout rounds with scorelines
  const koRounds = [
    ['Dieciseisavos', 0, 16],
    ['Octavos',       16, 24],
    ['Cuartos',       24, 28],
    ['Semifinales',   28, 30],
    ['3.º y 4.º puesto', 30, 31],
    ['Final',         31, 32]
  ];
  let koHTML = '';
  koRounds.forEach(([lbl, s, e]) => {
    const seg = (b.ko||[]).slice(s, e).filter(Boolean);
    if (!seg.length) return;
    koHTML += `<div class="ko-round">${lbl}</div>`;
    seg.forEach(k => {
      const sc = (k.gh != null) ? `${k.gh}-${k.ga}` : '—';
      koHTML += `<div class="betrow"><span class="mt">${esc(k.match)}</span><span class="sg">${esc(k.signo||'')}</span><span class="sc">${sc}</span></div>`;
    });
  });

  // Group stage 72 matches
  let gpHTML = '';
  (DATA.gp_matches || []).forEach((gm, i) => {
    const pr = parsePred(b.gp[i]);
    const sc = pr ? `${pr.gh}-${pr.ga}` : '—';
    const sg = pr ? pr.signo : '';
    gpHTML += `<div class="betrow${gm.triple?' trip':''}"><span class="mt">${esc(gm.name)}${gm.triple?' <span class="tripflag">x3</span>':''}</span><span class="sg">${esc(sg)}</span><span class="sc">${sc}</span></div>`;
  });

  return `<div class="full-bets" id="fullBets">
    <div class="fb-block"><h4>🏅 Balón de Oro · 👟 Bota de Oro</h4>
      <div class="awgrid">
        <div class="awcol"><div class="ti">Balón de Oro</div>
          <div class="rk">🥇 <b>${esc(aw.balon_oro||'—')}</b></div>
          <div class="rk">🥈 ${esc(aw.balon_plata||'—')}</div>
          <div class="rk">🥉 ${esc(aw.balon_bronce||'—')}</div></div>
        <div class="awcol"><div class="ti">Bota de Oro</div>
          <div class="rk">🥇 <b>${esc(aw.bota_oro||'—')}</b></div>
          <div class="rk">🥈 ${esc(aw.bota_plata||'—')}</div>
          <div class="rk">🥉 ${esc(aw.bota_bronce||'—')}</div></div>
      </div></div>
    <div class="fb-block"><h4>🎟️ Clasificados a Dieciseisavos (1/16)</h4>${chips(b.r32)}</div>
    <div class="fb-block"><h4>🎟️ Clasificados a Octavos (1/8)</h4>${chips(b.r16)}</div>
    <div class="fb-block"><h4>🎟️ Clasificados a Cuartos</h4>${chips(b.qf)}</div>
    <div class="fb-block"><h4>🎟️ Semifinalistas</h4>${chips(b.sf)}</div>
    <div class="fb-block"><h4>🎟️ Finalistas</h4>${chips(b.final)}</div>
    <div class="fb-block"><h4>⚔️ Eliminatorias · resultado exacto pronosticado</h4><div class="ko-list">${koHTML||'<div class="betrow"><span class="mt">—</span></div>'}</div></div>
    <div class="fb-block"><h4>📋 Fase de grupos · 72 partidos (x3 = vale triple)</h4><div class="gp-list">${gpHTML}</div></div>
  </div>`;
}

function openPlayer(name) {
  const p = players.find(x => x.name === name);
  if (!p) return;
  const [em, cls] = profStyle(p.profile);
  const semis = (p.semis && p.semis.length) ? p.semis.join(', ') : '—';
  $('#modalContent').innerHTML = `
    <button class="x" id="closeModal">✕</button>
    <div class="pcard-top" style="margin-bottom:16px;padding-right:38px">
      <div><div class="pname" style="font-size:30px">${esc(p.name)}</div></div>
      <div class="badge ${cls}">${em} ${esc(p.profile)}</div>
    </div>
    <div class="podium">
      <div class="slot"><div class="medal">🥇</div><div class="team">${esc(p.champion||'—')}</div><div class="role">Campeón</div></div>
      <div class="slot"><div class="medal">🥈</div><div class="team">${esc(p.runnerup||'—')}</div><div class="role">Finalista</div></div>
      <div class="slot"><div class="medal">🥉</div><div class="team">${esc(p.third||'—')}</div><div class="role">3.º puesto</div></div>
    </div>
    <div class="prow"><span class="ic">🏅</span><span class="k">Balón de Oro</span><span class="v">${esc(p.balon||'—')}</span></div>
    <div class="prow"><span class="ic">👟</span><span class="k">Bota de Oro</span><span class="v">${esc(p.bota||'—')}</span></div>
    <div class="prow"><span class="ic">🎯</span><span class="k">Semifinalistas</span><span class="v">${esc(semis)}</span></div>
    <div class="prow"><span class="ic">⚽</span><span class="k">Goles totales</span><span class="v">${p.goals} <span style="color:var(--cream-dim);font-weight:400">(media: ${DATA.meta.avg_goals})</span></span></div>
    <div class="pedrada">
      <div class="lbl">💥 Su mayor pedrada</div>
      <div class="txt">${esc(p.pedrada||'Quiniela de consenso, sin sorpresas')}</div>
      ${p.pedrada_share!=null?`<div class="share">Solo ${p.pedrada_share} de ${N} porristas lo firman</div>`:''}
    </div>
    <div class="profile-line"><b>${em} ${esc(p.profile)}:</b> ${esc(p.profile_desc)}
      ${p.profile_crit?`<div class="profile-crit">📌 ${esc(p.profile_crit)}</div>`:''}</div>
    <button class="expand-btn" id="expandBtn"><span class="pm">+</span> Ver toda la apuesta</button>
    ${fullBetsHTML(p)}`;
  $('#modalBg').classList.add('open');
  $('#closeModal').addEventListener('click', closeModal);
  const eb = $('#expandBtn'), fb = $('#fullBets');
  if (eb && fb) eb.addEventListener('click', () => {
    const open = fb.classList.toggle('open');
    eb.innerHTML = open
      ? '<span class="pm">−</span> Ocultar la apuesta'
      : '<span class="pm">+</span> Ver toda la apuesta';
  });
}

/* ===== Búsqueda ===== */
$('#search').addEventListener('input', e => {
  const q = e.target.value.trim().toLowerCase();
  renderPlayers(q ? players.filter(p => p.name.toLowerCase().includes(q)) : players);
});

renderPlayers(players);
