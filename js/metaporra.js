/* ===========================================================
   metaporra.js — panel "Metaporra": apuesta por quién ganará
   La Perraza. Solo por diversión (no suma puntos).
   --------------------------------------------------------------
   · Votante: cualquiera de los 81 (selector "¿quién eres?").
   · Candidato: por defecto los contendientes reales
     (DATA.metaporra.candidates); botón "Ver los 81" despliega
     la lista completa.
   · Los votos se guardan en un endpoint gratuito (Apps Script).
     El voto propio se recuerda en localStorage.
   · Si el endpoint no responde, se ofrece enviar el voto por
     WhatsApp al grupo como plan B (cero pérdida de datos).
   =========================================================== */

(function () {
  const MP = DATA.metaporra || {};
  const LS_KEY = 'metaporra_vote_v1';
  let showAllCands = false;
  let liveVotes = null;     // votos del endpoint; null = aún no cargado / error

  /* ---------- datos ---------- */
  const allPlayers = () => DATA.players.map(p => p.name).sort((a, b) => a.localeCompare(b, 'es'));
  const candidateList = () => (Array.isArray(MP.candidates) && MP.candidates.length ? MP.candidates : allPlayers());
  const isCandidate = n => candidateList().includes(n);

  function currentLeader() {
    const s = DATA.clasif && DATA.clasif.series;
    if (!s) return null;
    let best = null;
    Object.keys(s).forEach(n => {
      const v = s[n][s[n].length - 1];
      if (!best || v > best.pts) best = { name: n, pts: v };
    });
    return best;
  }

  /* ---------- localStorage ---------- */
  function getLocalVote() { try { return JSON.parse(localStorage.getItem(LS_KEY)); } catch (_) { return null; } }
  function setLocalVote(v) { try { localStorage.setItem(LS_KEY, JSON.stringify(v)); } catch (_) {} }

  /* ---------- endpoint ---------- */
  async function fetchVotes() {
    if (!MP.endpoint) return MP.votes || [];
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 8000);
      const r = await fetch(MP.endpoint, { signal: ctrl.signal });
      clearTimeout(t);
      const j = await r.json();
      if (j && j.ok && Array.isArray(j.votes)) return j.votes;
    } catch (_) { /* endpoint aún no público / sin red */ }
    return null;
  }

  async function postVote(voter, pick) {
    if (!MP.endpoint) return { ok: false, error: 'no_endpoint' };
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 9000);   // no dejar el botón colgado
      // body como texto plano (sin cabecera Content-Type) para evitar preflight CORS
      const r = await fetch(MP.endpoint, {
        method: 'POST',
        body: JSON.stringify({ code: MP.vote_code, voter, pick }),
        signal: ctrl.signal
      });
      clearTimeout(t);
      return await r.json();
    } catch (_) { return { ok: false, error: 'network' }; }
  }

  function whatsappHref(voter, pick) {
    const txt = `META:${pick} · voto de ${voter}`;
    return 'https://wa.me/?text=' + encodeURIComponent(txt);
  }

  /* ---------- render: formulario de voto ---------- */
  function optionTags(list, selected) {
    return list.map(n => `<option value="${esc(n)}" ${n === selected ? 'selected' : ''}>${esc(n)}</option>`).join('');
  }

  function candidateOptions(selected) {
    if (showAllCands) {
      const cands = candidateList();
      const rest = allPlayers().filter(n => !cands.includes(n));
      return `<optgroup label="Contendientes reales">${optionTags(cands, selected)}</optgroup>`
        + `<optgroup label="Sin opciones matemáticas — voto de fe 🙏">${optionTags(rest, selected)}</optgroup>`;
    }
    return optionTags(candidateList(), selected);
  }

  function renderVote() {
    const box = $('#mpVote');
    if (!box) return;
    const mine = getLocalVote();
    const lead = currentLeader();

    if (MP.open === false) {
      box.innerHTML = `<div class="mp-card mp-closed">
        <div class="mp-closed-ico">🔒</div>
        <div><b>Apuestas cerradas.</b> Ya no se puede cambiar el pronóstico${mine ? ` — tú apostaste por <b>${esc(mine.pick)}</b>.` : '.'}</div>
      </div>`;
      return;
    }

    const yourLine = mine
      ? `<div class="mp-yourvote">🎟️ Tu apuesta actual: <b>${esc(mine.pick)}</b> <span class="mp-changeable">(puedes cambiarla)</span></div>`
      : '';

    box.innerHTML = `
      <div class="mp-card">
        <div class="mp-lead">${lead ? `🏁 Ahora mismo va ganando <b>${esc(lead.name)}</b> (${lead.pts} pts). Quedan ~673 en juego, así que…` : ''}</div>
        <div class="mp-form">
          <div class="mp-field">
            <label for="mpWho">¿Quién eres?</label>
            <select id="mpWho">
              <option value="">— elígete —</option>
              ${optionTags(allPlayers(), mine ? mine.voter : '')}
            </select>
          </div>
          <div class="mp-field">
            <label for="mpPick">Tu ganador de La Perraza</label>
            <select id="mpPick">
              <option value="">— elige porrista —</option>
              ${candidateOptions(mine ? mine.pick : '')}
            </select>
            <button type="button" class="mp-seeall ${showAllCands ? 'on' : ''}" id="mpSeeAll">${showAllCands ? 'Ver solo contendientes' : 'Ver los 81'}</button>
          </div>
          <button type="button" class="mp-save" id="mpSave">Guardar mi apuesta</button>
        </div>
        ${yourLine}
        <div class="mp-status" id="mpStatus"></div>
      </div>`;

    $('#mpSeeAll').addEventListener('click', () => { showAllCands = !showAllCands; renderVote(); });
    $('#mpSave').addEventListener('click', onSave);
  }

  async function onSave() {
    const voter = $('#mpWho').value;
    const pick = $('#mpPick').value;
    const status = $('#mpStatus');
    if (!voter || !pick) { status.innerHTML = `<span class="mp-err">Elige quién eres y tu ganador.</span>`; return; }
    if (voter === pick) { status.innerHTML = `<span class="mp-warn">¿Apostar por ti mismo? 😏 Vale, pero que conste.</span>`; }

    $('#mpSave').disabled = true;
    status.innerHTML = `<span class="mp-info">Guardando…</span>`;
    const res = await postVote(voter, pick);
    $('#mpSave').disabled = false;

    if (res && res.ok) {
      setLocalVote({ voter, pick });
      liveVotes = await fetchVotes();
      renderVote();                 // reconstruye el formulario (muestra "tu apuesta actual")
      renderBoard();
      // el mensaje va DESPUÉS del re-render para que no se borre
      const st = $('#mpStatus');
      if (st) st.innerHTML = `<span class="mp-ok">✅ ¡Apuesta registrada! Has apostado por <b>${esc(pick)}</b>.</span>`;
    } else if (res && res.error === 'bad_code') {
      status.innerHTML = `<span class="mp-err">Código de grupo incorrecto (revisa la configuración).</span>`;
    } else {
      // Plan B: endpoint no accesible → guardar local + enviar por WhatsApp
      setLocalVote({ voter, pick });
      status.innerHTML = `<span class="mp-warn">No he podido contactar con el servidor de votos. Tu apuesta se ha guardado en este dispositivo.
        Envíala al grupo para que cuente: </span>
        <a class="mp-wa" href="${whatsappHref(voter, pick)}" target="_blank" rel="noopener">Enviar por WhatsApp</a>`;
    }
  }

  /* ---------- render: tablón ---------- */
  function renderBoard() {
    const box = $('#mpBoard');
    if (!box) return;
    const votes = liveVotes !== null ? liveVotes : (MP.votes || []);
    const offline = liveVotes === null && MP.endpoint;

    if (!votes.length) {
      box.innerHTML = `<div class="mp-board">
        <h3>🗳️ El tablón</h3>
        <p class="mp-empty">${offline ? 'Aún no he podido leer los votos del servidor (o todavía no hay ninguno). Vuelve en un rato.' : 'Todavía no ha votado nadie. ¡Sé el primero!'}</p>
      </div>`;
      return;
    }

    const total0 = votes.length;

    // Mientras la votación está abierta: recuento y lista nominal ocultos
    // (nadie ve a quién ha votado nadie ni las tendencias). Se destapan al cerrar.
    if (MP.open !== false) {
      box.innerHTML = `
        <div class="mp-board">
          <h3>🗳️ El tablón <span class="mp-count">${total0} voto${total0 === 1 ? '' : 's'}</span></h3>
          <div class="mp-card mp-hidden">
            <div class="mp-hidden-ico">🙈</div>
            <div><b>Votos en secreto.</b> El recuento y quién ha votado a quién se revelarán cuando se cierren las apuestas. De momento solo se sabe cuánta gente ha votado.</div>
          </div>
          ${offline ? '' : '<p class="mp-live">🟢 En vivo desde el servidor de votos.</p>'}
        </div>`;
      return;
    }

    // conteo por candidato elegido
    const tally = {};
    votes.forEach(v => { if (v && v.pick) tally[v.pick] = (tally[v.pick] || 0) + 1; });
    const rows = Object.entries(tally).sort((a, b) => b[1] - a[1]);
    const total = votes.length;
    const maxN = rows[0][1];
    const fav = rows[0][0];

    const bars = rows.map(([name, n]) => {
      const pct = Math.round(n / total * 100);
      const w = Math.round(n / maxN * 100);
      const flag = isCandidate(name) ? '' : ' <span class="mp-fe">voto de fe</span>';
      return `<div class="mp-barrow">
        <div class="mp-bartop"><span class="mp-barname">${esc(name)}${flag}</span><span class="mp-barval">${n} · ${pct}%</span></div>
        <div class="mp-bartrack"><div class="mp-barfill" style="width:${w}%"></div></div>
      </div>`;
    }).join('');

    const list = votes.slice().sort((a, b) => a.voter.localeCompare(b.voter, 'es'))
      .map(v => `<li><span class="mp-voter">${esc(v.voter)}</span> → <b>${esc(v.pick)}</b></li>`).join('');

    box.innerHTML = `
      <div class="mp-board">
        <h3>🗳️ El tablón <span class="mp-count">${total} voto${total === 1 ? '' : 's'}</span></h3>
        <p class="mp-fav">Favorito de la metaporra: <b>${esc(fav)}</b></p>
        <div class="mp-bars">${bars}</div>
        <details class="mp-whovoted"><summary>Ver quién ha votado a quién</summary><ul class="mp-votelist">${list}</ul></details>
        ${offline ? '' : '<p class="mp-live">🟢 En vivo desde el servidor de votos.</p>'}
      </div>`;
  }

  /* ---------- init ---------- */
  async function init() {
    renderVote();
    renderBoard();               // pinta al instante con lo último que tengamos
    const v = await fetchVotes();  // refresca desde el endpoint en cada visita
    if (v !== null) liveVotes = v; // si el fetch falla, conservamos lo anterior
    renderVote();
    renderBoard();
  }

  window.__initMetaporra = init;
})();
