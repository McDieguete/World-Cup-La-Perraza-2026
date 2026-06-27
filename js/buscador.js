/* ===========================================================
   buscador.js — panel "Buscador": preguntas sobre la porra
   --------------------------------------------------------------
   Permite responder preguntas tipo:
     · ¿Qué porristas han apostado que Ecuador se clasifica a cuartos?
     · ¿Qué equipos puso Diego Morgado a dieciseisavos y cuáles acertó?
   Combina una caja de texto que "entiende" la pregunta (detecta
   porrista + equipo + ronda + intención) con tres desplegables que
   son la fuente de verdad y permiten afinar la consulta a mano.
   =========================================================== */
'use strict';

(function () {
  const players = DATA.players;

  /* ===== Universo de equipos (de los standings de grupo) ===== */
  const TEAMS = (() => {
    const set = new Set();
    players.forEach(p => {
      const gs = p.bets && p.bets.group_standings;
      if (gs) Object.values(gs).forEach(g => g.forEach(t => set.add(t)));
    });
    return [...set].sort((a, b) => a.localeCompare(b, 'es'));
  })();

  /* ===== Definición de rondas =====
     betKey: dónde vive en p.bets (champion vive en p.champion)
     actKey: dónde vive el resultado real en DATA.actual_qualifiers
             (champion vive en DATA.actual_awards.champion) */
  const ROUNDS = [
    { key: 'r32',      betKey: 'r32',   actKey: 'r32', label: 'Dieciseisavos (1/16)', to: 'a dieciseisavos (1/16)',
      syn: ['dieciseisavos', 'dieciseisavo', '1/16', '16avos', 'treintaidosavos', 'ronda de 32'] },
    { key: 'r16',      betKey: 'r16',   actKey: 'r16', label: 'Octavos (1/8)', to: 'a octavos (1/8)',
      syn: ['octavos', 'octavo', '1/8', 'ronda de 16'] },
    { key: 'qf',       betKey: 'qf',    actKey: 'qf',  label: 'Cuartos de final', to: 'a cuartos',
      syn: ['cuartos', 'cuarto', '1/4', 'quarter'] },
    { key: 'sf',       betKey: 'sf',    actKey: 'sf',  label: 'Semifinales', to: 'a semifinales',
      syn: ['semifinales', 'semifinal', 'semis', 'semi'] },
    { key: 'final',    betKey: 'final', actKey: 'final', label: 'Final', to: 'a la final',
      syn: ['la final', 'finalista', 'finalistas', 'final'] },
    { key: 'champion', betKey: null,    actKey: 'champion', label: 'Campeón', to: 'campeón',
      syn: ['campeon', 'campeona', 'campeones', 'campeonato', 'ganador del mundial', 'gana el mundial', 'levanta la copa', 'titulo'] }
  ];
  const roundByKey = k => ROUNDS.find(r => r.key === k);

  /* ===== Normalización (sin acentos, minúsculas) ===== */
  const norm = s => (s || '').toString().toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '');
  const escRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  /* ===== Acceso a apuestas / resultados reales ===== */
  function teamsBetForRound(p, round) {
    if (round.key === 'champion') return p.champion ? [p.champion] : [];
    return (p.bets && p.bets[round.betKey]) || [];
  }
  function betReaches(p, round, team) {
    if (round.key === 'champion') return p.champion === team;
    return ((p.bets && p.bets[round.betKey]) || []).includes(team);
  }
  /* true=clasificó, false=no clasificó, null=ronda sin resultado todavía */
  function actualReaches(round, team) {
    if (round.key === 'champion') {
      const c = DATA.actual_awards && DATA.actual_awards.champion;
      return c ? c === team : null;
    }
    const list = DATA.actual_qualifiers && DATA.actual_qualifiers[round.actKey];
    return (list && list.length) ? list.includes(team) : null;
  }
  function roundHasResults(round) {
    if (round.key === 'champion') return !!(DATA.actual_awards && DATA.actual_awards.champion);
    const list = DATA.actual_qualifiers && DATA.actual_qualifiers[round.actKey];
    return !!(list && list.length);
  }

  /* ===== Parser de la caja de texto ===== */
  function detectRound(q) {
    let best = null, bestLen = 0;
    ROUNDS.forEach(r => r.syn.forEach(s => {
      const sn = norm(s);
      if (q.includes(sn) && sn.length > bestLen) { best = r; bestLen = sn.length; }
    }));
    return best;
  }
  function detectTeam(q) {
    let best = null, bestLen = 0;
    TEAMS.forEach(t => {
      const tn = norm(t);
      const re = new RegExp('\\b' + escRe(tn) + '\\b');
      if (re.test(q) && tn.length > bestLen) { best = t; bestLen = tn.length; }
    });
    return best;
  }
  function detectPlayer(q) {
    let best = null, bestLen = 0;
    players.forEach(p => {
      const pn = norm(p.name);
      const re = new RegExp('\\b' + escRe(pn) + '\\b');
      if (re.test(q) && pn.length > bestLen) { best = p; bestLen = pn.length; }
    });
    if (best) return best;
    // Respaldo: un único porrista cuyo nombre comparte una palabra (≥3) con la pregunta
    const words = new Set(q.split(/[^a-z0-9]+/).filter(w => w.length >= 3));
    const cands = players.filter(p =>
      norm(p.name).split(/[^a-z0-9]+/).some(w => w.length >= 3 && words.has(w)));
    return cands.length === 1 ? cands[0] : null;
  }
  function detectMode(q) {
    if (/\bno\s+acert|fall|errad/.test(q)) return 'misses';
    if (/acert|acier|clavad/.test(q)) return 'hits';
    return 'all';
  }

  /* ===== Estado + DOM ===== */
  const elInput  = () => $('#qInput');
  const elPlayer = () => $('#qPlayer');
  const elTeam   = () => $('#qTeam');
  const elRound  = () => $('#qRound');
  const elMode   = () => $('#qMode');
  const elResults = () => $('#qResults');

  let built = false;
  function build() {
    if (built) return;
    built = true;

    elPlayer().innerHTML = '<option value="">— cualquier porrista —</option>' +
      players.slice().sort((a, b) => a.name.localeCompare(b.name, 'es'))
        .map(p => `<option value="${esc(p.name)}">${esc(p.name)}</option>`).join('');
    elTeam().innerHTML = '<option value="">— cualquier equipo —</option>' +
      TEAMS.map(t => `<option value="${esc(t)}">${esc(t)}</option>`).join('');
    elRound().innerHTML = '<option value="">— cualquier ronda —</option>' +
      ROUNDS.map(r => `<option value="${r.key}">${esc(r.label)}</option>`).join('');

    elInput().addEventListener('input', onType);
    elInput().addEventListener('keydown', e => { if (e.key === 'Enter') onType(); });
    [elPlayer(), elTeam(), elRound(), elMode()].forEach(s =>
      s.addEventListener('change', run));
    $('#qClear').addEventListener('click', clearAll);

    $$('.q-example').forEach(b => b.addEventListener('click', () => {
      elInput().value = b.dataset.q;
      onType();
    }));

    // Delegación: abrir ficha de porrista / drill-down de equipo
    elResults().addEventListener('click', e => {
      const pc = e.target.closest('.q-player-chip');
      if (pc) { openPlayer(pc.dataset.name); return; }
      const tl = e.target.closest('.q-team-link');
      if (tl) {
        elPlayer().value = '';
        elTeam().value = tl.dataset.team;
        elRound().value = tl.dataset.round || '';
        elInput().value = '';
        run();
      }
    });

    run();
  }

  function onType() {
    const raw = elInput().value.trim();
    // Caja vacía: no piso lo que el usuario haya puesto en los desplegables.
    if (!raw) { run(); return; }
    // Con texto, la pregunta manda: fijo cada campo al valor detectado
    // (o lo limpio si no aparece) para no arrastrar consultas anteriores.
    const q = norm(raw);
    const p = detectPlayer(q), t = detectTeam(q), r = detectRound(q);
    elPlayer().value = p ? p.name : '';
    elTeam().value = t || '';
    elRound().value = r ? r.key : '';
    elMode().value = detectMode(q);
    run();
  }

  function clearAll() {
    elInput().value = '';
    elPlayer().value = ''; elTeam().value = ''; elRound().value = ''; elMode().value = 'all';
    run();
  }

  /* ===== Render helpers ===== */
  const hitBadge = state =>
    state === true  ? '<span class="q-badge ok">✅ Acertó</span>' :
    state === false ? '<span class="q-badge no">❌ Falló</span>' :
                      '<span class="q-badge pend">⏳ Pendiente</span>';

  const playerChip = name => `<button class="q-player-chip" data-name="${esc(name)}">${esc(name)}</button>`;
  const sortNames = arr => arr.slice().sort((a, b) => a.localeCompare(b, 'es'));

  /* Predicado que sigue al nombre del equipo, presente y pasado */
  const reachNow  = r => r.key === 'champion' ? 'es campeón' : 'se clasifica ' + r.to;
  const reachPast = r => r.key === 'champion' ? 'fue campeón' : 'se clasificó ' + r.to;

  function intro(html) {
    return `<div class="q-empty">${html}</div>`;
  }

  /* ===== Motor principal ===== */
  function run() {
    const p = elPlayer().value ? players.find(x => x.name === elPlayer().value) : null;
    const team = elTeam().value || null;
    const round = elRound().value ? roundByKey(elRound().value) : null;
    const mode = elMode().value || 'all';
    const out = elResults();

    // Nada seleccionado
    if (!p && !team && !round) {
      out.innerHTML = intro(
        'Escribe una pregunta arriba o usa los desplegables. Por ejemplo: ' +
        '<em>«¿Quién ha puesto a Ecuador en cuartos?»</em> o ' +
        '<em>«¿Qué acertó Diego Morgado en dieciseisavos?»</em>');
      return;
    }

    // CASO A · equipo + ronda (con o sin porrista)
    if (team && round && !p) { out.innerHTML = renderTeamRound(team, round, mode); return; }
    // CASO B · porrista + ronda (equipo opcional)
    if (p && round) { out.innerHTML = renderPlayerRound(p, round, team, mode); return; }
    // CASO C · porrista + equipo (sin ronda)
    if (p && team && !round) { out.innerHTML = renderPlayerTeam(p, team); return; }
    // CASO D · solo porrista
    if (p && !team && !round) { out.innerHTML = renderPlayer(p); return; }
    // CASO E · solo equipo
    if (team && !p && !round) { out.innerHTML = renderTeam(team); return; }
    // CASO F · solo ronda
    if (round && !p && !team) { out.innerHTML = renderRound(round); return; }
    out.innerHTML = intro('Afina la búsqueda con los desplegables.');
  }

  /* A · ¿Qué porristas apostaron que <team> llega a <round>? */
  function renderTeamRound(team, round, mode) {
    const who = sortNames(players.filter(p => betReaches(p, round, team)).map(p => p.name));
    const actual = actualReaches(round, team);
    let banner = '';
    if (actual === true)  banner = `<div class="q-banner ok">✅ ${esc(team)} ${esc(reachPast(round))} — estos porristas lo acertaron.</div>`;
    else if (actual === false) banner = `<div class="q-banner no">❌ ${esc(team)} no ${esc(reachPast(round))} — estos porristas fallaron esta apuesta.</div>`;
    else banner = `<div class="q-banner pend">⏳ Esta ronda aún no tiene resultado oficial.</div>`;

    const head = `<div class="q-result-head">
      <h3>Porristas que apostaron que <em>${esc(team)}</em> ${esc(reachNow(round))}</h3>
      <div class="q-count">${who.length} de ${players.length} porristas</div></div>`;

    if (!who.length) return head + banner +
      intro(`Nadie en la porra apostó que ${esc(team)} ${esc(reachNow(round))}.`);
    return head + banner +
      `<div class="q-chiprow">${who.map(playerChip).join('')}</div>`;
  }

  /* B · ¿Qué equipos puso <player> a <round>? (y cuáles acertó) */
  function renderPlayerRound(p, round, team, mode) {
    let teams = teamsBetForRound(p, round).slice();
    const results = roundHasResults(round);
    let rows = teams.map(t => ({ t, st: actualReaches(round, t) }));
    if (mode === 'hits')   rows = rows.filter(r => r.st === true);
    if (mode === 'misses') rows = rows.filter(r => r.st === false);
    rows.sort((a, b) => a.t.localeCompare(b.t, 'es'));

    const hits = teams.filter(t => actualReaches(round, t) === true).length;
    const head = `<div class="q-result-head">
      <h3>Equipos que <em>${esc(p.name)}</em> apostó ${esc(round.to)}</h3>
      <div class="q-count">${teams.length} equipo(s)${results ? ` · ${hits} acertado(s)` : ''}</div></div>`;

    let body;
    if (!teams.length) {
      body = intro(`${esc(p.name)} no firmó ningún equipo ${esc(round.to)}.`);
    } else if (!rows.length) {
      body = intro(mode === 'hits'
        ? `Ninguno de los equipos de ${esc(p.name)} ${esc(round.to)} se ha clasificado (todavía).`
        : `Sin coincidencias para ese filtro.`);
    } else {
      body = `<div class="q-team-list">` + rows.map(r =>
        `<div class="q-team-row"><span class="q-team-name">${esc(r.t)}</span>${results || r.st !== null ? hitBadge(r.st) : '<span class="q-badge pend">⏳ Pendiente</span>'}</div>`
      ).join('') + `</div>`;
    }
    // Si además hay equipo concreto seleccionado, resaltar la respuesta directa
    let direct = '';
    if (team) {
      const did = betReaches(p, round, team);
      direct = `<div class="q-banner ${did ? 'ok' : 'no'}">${did ? '✔️ Sí' : '✖️ No'}: ${esc(p.name)} ${did ? 'apostó' : 'no apostó'} que ${esc(team)} ${esc(reachNow(round))}.</div>`;
    }
    return head + direct + body;
  }

  /* C · ¿Apostó <player> a <team> en cada ronda? */
  function renderPlayerTeam(p, team) {
    const head = `<div class="q-result-head">
      <h3>Apuestas de <em>${esc(p.name)}</em> sobre <em>${esc(team)}</em></h3>
      <div class="q-count">Hasta dónde lo hizo llegar</div></div>`;
    const rows = ROUNDS.map(r => {
      const did = betReaches(p, r, team);
      return `<div class="q-team-row"><span class="q-team-name">${esc(r.label)}</span>` +
        (did ? '<span class="q-badge ok">✔️ Sí lo puso</span>' : '<span class="q-badge no">— No</span>') +
        `</div>`;
    }).join('');
    return head + `<div class="q-team-list">${rows}</div>`;
  }

  /* D · Ruta completa de un porrista */
  function renderPlayer(p) {
    const head = `<div class="q-result-head">
      <h3>La ruta de <em>${esc(p.name)}</em></h3>
      <div class="q-count"><button class="q-player-chip" data-name="${esc(p.name)}">Ver ficha completa →</button></div></div>`;
    const blocks = ROUNDS.filter(r => r.key !== 'champion').map(r => {
      const teams = sortNames(teamsBetForRound(p, r));
      return `<div class="q-route-block"><div class="q-route-lbl">${esc(r.label)} · ${teams.length}</div>` +
        `<div class="q-chiprow">${teams.map(t =>
          `<button class="q-team-link" data-team="${esc(t)}" data-round="${r.key}">${esc(t)}</button>`).join('') || '—'}</div></div>`;
    }).join('');
    const podium = `<div class="q-route-block"><div class="q-route-lbl">Podio</div>` +
      `<div class="q-chiprow">🥇 ${esc(p.champion || '—')} · 🥈 ${esc(p.runnerup || '—')} · 🥉 ${esc(p.third || '—')}</div></div>`;
    return head + podium + blocks;
  }

  /* E · Hasta dónde ve la peña a un equipo */
  function renderTeam(team) {
    const head = `<div class="q-result-head">
      <h3>¿Hasta dónde ve la porra a <em>${esc(team)}</em>?</h3>
      <div class="q-count">Porristas que lo hacen llegar a cada ronda</div></div>`;
    const rows = ROUNDS.map(r => {
      const n = players.filter(p => betReaches(p, r, team)).length;
      const pct = Math.round(n / players.length * 100);
      return `<button class="q-team-link q-adv-row" data-team="${esc(team)}" data-round="${r.key}">
        <span class="q-team-name">${esc(r.label)}</span>
        <span class="q-adv-bar"><span class="q-adv-fill" style="width:${pct}%"></span></span>
        <span class="q-adv-num">${n}</span></button>`;
    }).join('');
    return head + `<div class="q-team-list">${rows}</div>` +
      `<p class="q-hint">Pulsa una ronda para ver quién la firma.</p>`;
  }

  /* F · Reparto de votos de una ronda */
  function renderRound(round) {
    const counts = {};
    players.forEach(p => teamsBetForRound(p, round).forEach(t => counts[t] = (counts[t] || 0) + 1));
    const ranked = Object.entries(counts).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'es'));
    const max = ranked.length ? ranked[0][1] : 1;
    const head = `<div class="q-result-head">
      <h3>¿Quién llega ${esc(round.to)} según la porra?</h3>
      <div class="q-count">${ranked.length} equipos con algún voto</div></div>`;
    const rows = ranked.map(([t, n]) =>
      `<button class="q-team-link q-adv-row" data-team="${esc(t)}" data-round="${round.key}">
        <span class="q-team-name">${esc(t)}</span>
        <span class="q-adv-bar"><span class="q-adv-fill" style="width:${Math.round(n / max * 100)}%"></span></span>
        <span class="q-adv-num">${n}</span></button>`).join('');
    return head + `<div class="q-team-list">${rows}</div>` +
      `<p class="q-hint">Pulsa un equipo para ver quién lo firma en esta ronda.</p>`;
  }

  /* Init perezoso al abrir la pestaña (lo llama nav.js) */
  window.__initBuscador = build;
})();
