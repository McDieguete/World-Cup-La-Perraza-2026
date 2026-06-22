/* ===========================================================
   mundial.js — Pestaña "Mundial": stats reales vía API-Football
   --------------------------------------------------------------
   Lee data/stats.json (generado por el cron refresh-stats.yml) y
   pinta cuatro bloques:
     1. Clasificación de grupos (12 grupos en grid)
     2. Top goleadores · asistentes
     3. Top tarjetas
     4. Estadísticas por selección (dropdown + detalle)
   Si data/stats.json no existe aún, muestra estado "esperando".
   =========================================================== */

(function () {
  'use strict';

  let STATS = null;          // payload cargado de data/stats.json
  let scoreToggle = 'total'; // 'total' | 'p90'
  let assistToggle = 'total';
  let teamStatsSelectedId = null;
  let inited = false;

  /* ===== Helpers ===== */
  function fmt(n)  { return (n == null || isNaN(n)) ? '—' : String(n); }
  function pct(n)  { return (n == null || isNaN(n)) ? '—' : `${n}%`; }
  function ago(iso){
    if (!iso) return 'nunca';
    const d = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
    if (d < 1) return 'hace un instante';
    if (d < 60) return `hace ${d} min`;
    const h = Math.floor(d / 60);
    if (h < 24) return `hace ${h} h`;
    return `hace ${Math.floor(h/24)} d`;
  }

  /* ===== Entry point ===== */
  function init() {
    if (inited) return;
    inited = true;
    const mount = $('#mundial-container');
    if (!mount) return;
    mount.innerHTML = '<div class="mu-loading">Cargando estadísticas…</div>';
    fetch('data/stats.json', { cache: 'no-store' })
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then(data => {
        STATS = data;
        render();
      })
      .catch(err => {
        mount.innerHTML = `<div class="mu-empty">
          <div class="mu-empty-ic">📡</div>
          <div class="mu-empty-title">Estadísticas no disponibles</div>
          <div class="mu-empty-msg">El cron <code>refresh-stats.yml</code> aún no ha generado <code>data/stats.json</code>, o la API-Football no devolvió datos.<br>Detalles: ${esc(err.message)}</div>
        </div>`;
      });
  }

  /* ===== Render ===== */
  function render() {
    if (!STATS) return;
    const mount = $('#mundial-container');
    mount.innerHTML = `
      <div class="mu-meta">
        <span class="mu-meta-pill">📅 Datos: ${ago(STATS.generated_at)}</span>
        <span class="mu-meta-pill mu-meta-pill-team">🛡️ Stats por selección: ${ago(STATS.team_stats_generated_at)}</span>
      </div>
      ${renderStandings(STATS.groups || [])}
      ${renderTopBlocks()}
      ${renderCards()}
      ${renderTeamSelector()}
      <div id="mu-team-detail"></div>
    `;
    wire();
    if (teamStatsSelectedId == null && STATS.team_stats) {
      const firstId = Object.keys(STATS.team_stats)[0];
      if (firstId) { teamStatsSelectedId = +firstId; }
    }
    if (teamStatsSelectedId != null) renderTeamDetail();
  }

  /* ===== 1. Standings (grid 12 grupos) ===== */
  function renderStandings(groups) {
    if (!groups.length) return '<div class="mu-empty-block">Sin clasificación de grupos disponible.</div>';
    return `<section class="mu-block">
      <h3 class="mu-h3">🏟️ Clasificación de grupos</h3>
      <div class="mu-groups">
        ${groups.map(g => renderGroup(g)).join('')}
      </div>
    </section>`;
  }

  function renderGroup(group) {
    if (!group || !group.length) return '';
    const label = (group[0].group || '').replace(/^Group\s*/i, '');
    return `<div class="mu-group">
      <div class="mu-group-head"><span class="mu-group-letter">${esc(label)}</span></div>
      <table class="mu-group-table">
        <thead>
          <tr><th>#</th><th class="mu-tn">Equipo</th><th>J</th><th>G</th><th>E</th><th>P</th><th>GF</th><th>GC</th><th>DG</th><th>Pts</th></tr>
        </thead>
        <tbody>
          ${group.map(row => {
            const top2 = row.rank <= 2 ? ' mu-top' : '';
            const last = row.rank >= 4 ? ' mu-bot' : '';
            const form = renderForm(row.form);
            return `<tr class="${top2}${last}">
              <td class="mu-rank">${row.rank}</td>
              <td class="mu-tn"><img class="mu-flag" src="${esc(row.team.logo||'')}" alt="" loading="lazy"><span>${esc(row.team.name||'?')}</span></td>
              <td>${fmt(row.all && row.all.played)}</td>
              <td>${fmt(row.all && row.all.win)}</td>
              <td>${fmt(row.all && row.all.draw)}</td>
              <td>${fmt(row.all && row.all.lose)}</td>
              <td>${fmt(row.all && row.all.goals && row.all.goals['for'])}</td>
              <td>${fmt(row.all && row.all.goals && row.all.goals['against'])}</td>
              <td>${fmt(row.goalsDiff)}</td>
              <td class="mu-pts">${fmt(row.points)}</td>
            </tr>
            ${form ? `<tr class="mu-form-row"><td colspan="10"><div class="mu-form">${form}</div></td></tr>` : ''}`;
          }).join('')}
        </tbody>
      </table>
    </div>`;
  }

  function renderForm(formStr) {
    if (!formStr) return '';
    return [...formStr].map(c => {
      const cls = c === 'W' ? 'w' : c === 'D' ? 'd' : c === 'L' ? 'l' : '';
      return `<span class="mu-form-pip mu-form-${cls}">${esc(c)}</span>`;
    }).join('');
  }

  /* ===== 2. Top scorers + assists con toggle Total / Por 90' ===== */
  function renderTopBlocks() {
    return `<section class="mu-block mu-grid-2">
      ${renderTopList('scorers', '⚽ Top goleadores', STATS.scorers || [], scoreToggle, 'goals')}
      ${renderTopList('assists', '🎯 Top asistentes', STATS.assists || [], assistToggle, 'assists')}
    </section>`;
  }

  function renderTopList(key, title, players, toggle, statKind) {
    if (!players.length) return `<div class="mu-empty-block"><h3 class="mu-h3">${title}</h3>Sin datos.</div>`;
    const rows = players.slice(0, 10).map((p, i) => {
      const pl = p.player || {};
      const stat = (p.statistics && p.statistics[0]) || {};
      const team = (stat.team && stat.team.name) || '?';
      const gp   = (stat.games && stat.games.appearences) || 0;
      const minutes = (stat.games && stat.games.minutes) || 0;
      const total = (statKind === 'goals')
        ? ((stat.goals && stat.goals.total) || 0)
        : ((stat.goals && stat.goals.assists) || 0);
      const per90 = minutes > 0 ? (total / (minutes / 90)) : 0;
      const value = toggle === 'p90' ? per90.toFixed(2) : total;
      return `<tr>
        <td class="mu-rank">${i + 1}</td>
        <td class="mu-player">
          <span class="mu-player-name">${esc(pl.name || '?')}</span>
          <span class="mu-player-team">${esc(team)}</span>
        </td>
        <td class="mu-stat-val">${value}</td>
        <td class="mu-stat-meta">${gp} pj</td>
      </tr>`;
    }).join('');
    return `<div class="mu-toplist">
      <div class="mu-toplist-head">
        <h3 class="mu-h3">${title}</h3>
        <div class="mu-seg" data-key="${key}">
          <button class="mu-seg-btn ${toggle==='total'?'active':''}" data-val="total">Total</button>
          <button class="mu-seg-btn ${toggle==='p90'?'active':''}" data-val="p90">Por 90'</button>
        </div>
      </div>
      <table class="mu-table">
        <thead><tr><th>#</th><th>Jugador</th><th>${statKind === 'goals' ? 'Goles' : 'Asist.'}</th><th>PJ</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
  }

  /* ===== 3. Tarjetas ===== */
  function renderCards() {
    const yellow = STATS.yellow || [];
    const red = STATS.red || [];
    return `<section class="mu-block mu-grid-2">
      ${renderCardList('🟨 Top tarjetas amarillas', yellow, 'yellow')}
      ${renderCardList('🟥 Top tarjetas rojas',   red,    'red')}
    </section>`;
  }
  function renderCardList(title, players, kind) {
    if (!players.length) return `<div class="mu-empty-block"><h3 class="mu-h3">${title}</h3>Sin datos.</div>`;
    const rows = players.slice(0, 10).map((p, i) => {
      const pl = p.player || {};
      const stat = (p.statistics && p.statistics[0]) || {};
      const team = (stat.team && stat.team.name) || '?';
      const cards = stat.cards || {};
      const val = kind === 'yellow' ? (cards.yellow || 0) : (cards.red || 0);
      return `<tr>
        <td class="mu-rank">${i + 1}</td>
        <td class="mu-player">
          <span class="mu-player-name">${esc(pl.name || '?')}</span>
          <span class="mu-player-team">${esc(team)}</span>
        </td>
        <td class="mu-stat-val">${val}</td>
      </tr>`;
    }).join('');
    return `<div class="mu-toplist">
      <h3 class="mu-h3">${title}</h3>
      <table class="mu-table">
        <thead><tr><th>#</th><th>Jugador</th><th>Tarjetas</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
  }

  /* ===== 4. Selector de equipo + detalle ===== */
  function renderTeamSelector() {
    if (!STATS.team_stats) return '';
    const ids = Object.keys(STATS.team_stats);
    if (!ids.length) return '';
    /* Nombre legible para cada team_id, buscando en cualquier grupo */
    const teamMeta = {};
    (STATS.groups || []).forEach(g => g.forEach(r => {
      if (r.team && r.team.id != null) teamMeta[r.team.id] = { name: r.team.name, logo: r.team.logo };
    }));
    const opts = ids
      .map(id => ({ id, name: (teamMeta[id] && teamMeta[id].name) || `Equipo ${id}` }))
      .sort((a,b) => a.name.localeCompare(b.name, 'es'))
      .map(o => `<option value="${o.id}"${+o.id===teamStatsSelectedId?' selected':''}>${esc(o.name)}</option>`)
      .join('');
    return `<section class="mu-block">
      <h3 class="mu-h3">🛡️ Estadísticas por selección</h3>
      <div class="mu-team-sel">
        <label for="muTeamSel">Selecciona equipo:</label>
        <select id="muTeamSel">${opts}</select>
      </div>
    </section>`;
  }

  function renderTeamDetail() {
    const wrap = $('#mu-team-detail');
    if (!wrap) return;
    const stat = STATS.team_stats && STATS.team_stats[teamStatsSelectedId];
    if (!stat) { wrap.innerHTML = '<div class="mu-empty-block">Sin estadísticas para este equipo.</div>'; return; }

    const t = stat.team || {};
    const fix = stat.fixtures || {};
    const goals = stat.goals || {};
    const gf = (goals['for'] && goals['for'].total) || {};
    const ga = (goals['against'] && goals['against'].total) || {};
    const gfMin = (goals['for'] && goals['for'].minute) || {};
    const gaMin = (goals['against'] && goals['against'].minute) || {};
    const avgGF = (goals['for'] && goals['for'].average) || {};
    const avgGA = (goals['against'] && goals['against'].average) || {};
    const cleanSheet  = stat.clean_sheet || {};
    const failedScore = stat.failed_to_score || {};
    const lineups = stat.lineups || [];
    const penalty = stat.penalty || {};
    const biggest = stat.biggest || {};

    wrap.innerHTML = `<section class="mu-block mu-team-detail">
      <div class="mu-team-head">
        ${t.logo ? `<img src="${esc(t.logo)}" alt="" class="mu-team-logo">` : ''}
        <div>
          <div class="mu-team-name">${esc(t.name || '?')}</div>
          <div class="mu-team-meta">${esc(t.country || '')}</div>
        </div>
      </div>

      <div class="mu-team-grid">
        ${kpi('Partidos jugados', fmt(fix.played && fix.played.total))}
        ${kpi('Victorias',         fmt(fix.wins   && fix.wins.total))}
        ${kpi('Empates',           fmt(fix.draws  && fix.draws.total))}
        ${kpi('Derrotas',          fmt(fix.loses  && fix.loses.total))}
        ${kpi('Goles a favor',     fmt(gf.total))}
        ${kpi('Goles en contra',   fmt(ga.total))}
        ${kpi('Media goles favor', fmt(avgGF.total))}
        ${kpi('Media goles contra',fmt(avgGA.total))}
        ${kpi('Porterías a cero',  fmt(cleanSheet.total))}
        ${kpi('Partidos sin marcar',fmt(failedScore.total))}
        ${kpi('Pen. anotados',     fmt(penalty.scored && penalty.scored.total))}
        ${kpi('Pen. fallados',     fmt(penalty.missed && penalty.missed.total))}
      </div>

      <div class="mu-team-cols">
        <div class="mu-team-card">
          <h4 class="mu-h4">⏱️ Goles por minuto (a favor)</h4>
          ${renderMinuteBars(gfMin)}
        </div>
        <div class="mu-team-card">
          <h4 class="mu-h4">⏱️ Goles por minuto (en contra)</h4>
          ${renderMinuteBars(gaMin)}
        </div>
      </div>

      <div class="mu-team-cols">
        <div class="mu-team-card">
          <h4 class="mu-h4">🧩 Formaciones utilizadas</h4>
          ${renderLineups(lineups)}
        </div>
        <div class="mu-team-card">
          <h4 class="mu-h4">📊 Mayores logros</h4>
          ${renderBiggest(biggest)}
        </div>
      </div>
    </section>`;
  }

  function kpi(label, value) {
    return `<div class="mu-kpi"><div class="mu-kpi-val">${value}</div><div class="mu-kpi-lbl">${esc(label)}</div></div>`;
  }

  function renderMinuteBars(minuteData) {
    const order = ['0-15','16-30','31-45','46-60','61-75','76-90','91-105','106-120'];
    const rows = order
      .filter(k => minuteData[k] != null)
      .map(k => {
        const d = minuteData[k] || {};
        return { k, total: d.total || 0, pct: (d.percentage || '0%').toString() };
      });
    if (!rows.length) return '<div class="mu-empty-block">Sin datos.</div>';
    const max = Math.max(...rows.map(r => r.total), 1);
    return `<div class="mu-bars">${rows.map(r => `
      <div class="mu-bar">
        <div class="mu-bar-lbl">${esc(r.k)}'</div>
        <div class="mu-bar-track"><div class="mu-bar-fill" style="width:${(r.total/max*100).toFixed(1)}%"></div></div>
        <div class="mu-bar-val">${r.total} <span class="mu-bar-pct">${esc(r.pct)}</span></div>
      </div>`).join('')}</div>`;
  }

  function renderLineups(lineups) {
    if (!lineups.length) return '<div class="mu-empty-block">Sin datos.</div>';
    return `<div class="mu-chiprow">${lineups.map(l =>
      `<div class="mu-lineup-chip"><span class="mu-lineup-form">${esc(l.formation||'?')}</span><span class="mu-lineup-played">${l.played||0}×</span></div>`
    ).join('')}</div>`;
  }

  function renderBiggest(b) {
    const items = [
      ['Mayor victoria (casa)', b.wins && b.wins.home],
      ['Mayor victoria (fuera)', b.wins && b.wins.away],
      ['Mayor derrota (casa)', b.loses && b.loses.home],
      ['Mayor derrota (fuera)', b.loses && b.loses.away]
    ].filter(([k,v]) => v);
    if (!items.length) return '<div class="mu-empty-block">Sin datos.</div>';
    return `<table class="mu-biggest"><tbody>${items.map(([k,v]) => `<tr><td>${esc(k)}</td><td><b>${esc(v)}</b></td></tr>`).join('')}</tbody></table>`;
  }

  /* ===== Wiring ===== */
  function wire() {
    $$('.mu-seg').forEach(seg => {
      const key = seg.dataset.key;
      seg.querySelectorAll('.mu-seg-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          if (key === 'scorers') scoreToggle = btn.dataset.val;
          if (key === 'assists') assistToggle = btn.dataset.val;
          render();
        });
      });
    });
    const sel = $('#muTeamSel');
    if (sel) sel.addEventListener('change', e => {
      teamStatsSelectedId = +e.target.value;
      renderTeamDetail();
    });
  }

  /* Exponer init() para que nav.js lo invoque al hacer click en la tab */
  window.__initMundial = init;
})();
