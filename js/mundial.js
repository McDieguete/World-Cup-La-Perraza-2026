/* ===========================================================
   mundial.js — Pestaña "Mundial": stats reales del torneo
   --------------------------------------------------------------
   Lee data/stats.json (generado por refresh-stats.yml usando
   football-data.org) y renderiza 4 secciones:
     1. Clasificaciones (12 grupos)
     2. Máximos goleadores (top 20)
     3. Selecciones más goleadoras (top 5 por goalsFor)
     4. Selecciones menos goleadas  (top 5 por goalsAgainst)
   Sin cálculos: las 3 y 4 son sólo la misma data de standings
   ordenada por el campo correspondiente.
   =========================================================== */

(function () {
  'use strict';

  let STATS = null;
  let inited = false;

  function ago(iso) {
    if (!iso) return 'nunca';
    const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
    if (m < 1) return 'hace un instante';
    if (m < 60) return `hace ${m} min`;
    const h = Math.floor(m / 60);
    if (h < 24) return `hace ${h} h`;
    return `hace ${Math.floor(h/24)} d`;
  }

  function init() {
    if (inited) return;
    inited = true;
    const mount = $('#mundial-container');
    if (!mount) return;
    mount.innerHTML = '<div class="mu-loading">Cargando…</div>';
    fetch('data/stats.json', { cache: 'no-store' })
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then(data => { STATS = data; render(); })
      .catch(err => {
        mount.innerHTML = `<div class="mu-empty">
          <div class="mu-empty-title">Estadísticas no disponibles</div>
          <div class="mu-empty-msg">El cron <code>refresh-stats.yml</code> aún no ha generado <code>data/stats.json</code>. Detalles: ${esc(err.message)}</div>
        </div>`;
      });
  }

  function render() {
    const mount = $('#mundial-container');
    const groups = STATS.groups || [];
    const scorers = STATS.scorers || [];

    /* Flatten standings para extraer top atacantes/defensores */
    const allTeams = [];
    groups.forEach(g => (g.table || []).forEach(row => {
      if (row.playedGames > 0) {
        allTeams.push({
          name: row.team.name,
          tla: row.team.tla || '',
          crest: row.team.crest || '',
          played: row.playedGames,
          gf: row.goalsFor,
          ga: row.goalsAgainst
        });
      }
    }));

    const topScoring  = [...allTeams].sort((a,b) => b.gf - a.gf || a.name.localeCompare(b.name,'es')).slice(0,5);
    const topDefense  = [...allTeams].sort((a,b) => a.ga - b.ga || a.name.localeCompare(b.name,'es')).slice(0,5);

    mount.innerHTML = `
      <div class="mu-bar">
        <span class="mu-tag">Datos: ${ago(STATS.generated_at)} · Fuente: ${esc(STATS.source || '—')}</span>
      </div>

      ${renderGroups(groups)}
      ${renderScorers(scorers)}
      ${renderTeamRankings(topScoring, topDefense, allTeams.length > 0)}
    `;
  }

  /* ===== 1. CLASIFICACIONES ===== */
  function renderGroups(groups) {
    if (!groups.length) {
      return `<section class="mu-section">
        <h3 class="mu-title">Clasificaciones</h3>
        <div class="mu-empty-block">Sin datos de clasificación. El proveedor (football-data.org) aún no ha publicado las tablas.</div>
      </section>`;
    }
    return `<section class="mu-section">
      <h3 class="mu-title">Clasificaciones</h3>
      <div class="mu-groups">${groups.map(g => groupTable(g)).join('')}</div>
    </section>`;
  }

  function groupTable(g) {
    const rows = (g.table || []).map(r => `
      <tr>
        <td class="mu-pos">${r.position}</td>
        <td class="mu-team">${r.team.crest ? `<img src="${esc(r.team.crest)}" alt="" class="mu-crest" loading="lazy">` : ''}${esc(r.team.name)}</td>
        <td>${r.playedGames}</td>
        <td>${r.won}</td>
        <td>${r.draw}</td>
        <td>${r.lost}</td>
        <td>${r.goalsFor}</td>
        <td>${r.goalsAgainst}</td>
        <td class="mu-pts">${r.points}</td>
      </tr>`).join('');
    return `<div class="mu-group">
      <div class="mu-group-head">Grupo ${esc(g.group)}</div>
      <table>
        <thead><tr><th></th><th>Equipo</th><th>PJ</th><th>G</th><th>E</th><th>P</th><th>GF</th><th>GC</th><th>Pts</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
  }

  /* ===== 2. GOLEADORES ===== */
  function renderScorers(scorers) {
    if (!scorers.length) {
      return `<section class="mu-section">
        <h3 class="mu-title">Máximos goleadores</h3>
        <div class="mu-empty-block">Sin datos de goleadores.</div>
      </section>`;
    }
    const rows = scorers.slice(0, 15).map((s, i) => `
      <tr>
        <td class="mu-pos">${i + 1}</td>
        <td class="mu-team">${s.teamCrest ? `<img src="${esc(s.teamCrest)}" alt="" class="mu-crest" loading="lazy">` : ''}<span class="mu-player-name">${esc(s.player)}</span></td>
        <td class="mu-team-name">${esc(s.team)}</td>
        <td>${s.playedMatches}</td>
        <td class="mu-pts">${s.goals}</td>
      </tr>`).join('');
    return `<section class="mu-section">
      <h3 class="mu-title">Máximos goleadores</h3>
      <table class="mu-table">
        <thead><tr><th></th><th>Jugador</th><th>Equipo</th><th>PJ</th><th>Goles</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </section>`;
  }

  /* ===== 3 + 4. SELECCIONES MÁS / MENOS GOLEADAS ===== */
  function renderTeamRankings(topScoring, topDefense, hasData) {
    if (!hasData) return '';
    return `<section class="mu-section mu-two-cols">
      <div>
        <h3 class="mu-title">Selecciones más goleadoras</h3>
        <table class="mu-table">
          <thead><tr><th></th><th>Equipo</th><th>PJ</th><th>GF</th></tr></thead>
          <tbody>${topScoring.map((t, i) => `
            <tr>
              <td class="mu-pos">${i + 1}</td>
              <td class="mu-team">${t.crest ? `<img src="${esc(t.crest)}" alt="" class="mu-crest" loading="lazy">` : ''}${esc(t.name)}</td>
              <td>${t.played}</td>
              <td class="mu-pts">${t.gf}</td>
            </tr>`).join('')}</tbody>
        </table>
      </div>
      <div>
        <h3 class="mu-title">Selecciones menos goleadas</h3>
        <table class="mu-table">
          <thead><tr><th></th><th>Equipo</th><th>PJ</th><th>GC</th></tr></thead>
          <tbody>${topDefense.map((t, i) => `
            <tr>
              <td class="mu-pos">${i + 1}</td>
              <td class="mu-team">${t.crest ? `<img src="${esc(t.crest)}" alt="" class="mu-crest" loading="lazy">` : ''}${esc(t.name)}</td>
              <td>${t.played}</td>
              <td class="mu-pts mu-pts-def">${t.ga}</td>
            </tr>`).join('')}</tbody>
        </table>
      </div>
    </section>`;
  }

  window.__initMundial = init;
})();
