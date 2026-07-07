/* ===========================================================
   metaporra-candidates.js — calcula los "contendientes reales"
   de la porra: porristas que TODAVÍA pueden alcanzar al líder.
   --------------------------------------------------------------
   Un porrista es contendiente si:
       puntos_actuales + techo_de_puntos_que_aún_puede_sumar >= puntos_del_líder
   El techo por jugador se estima de forma GENEROSA (favorable al
   jugador) para no eliminar a nadie que matemáticamente siga vivo:
     · Puntos de PARTIDO KO restantes: 113 (máximo del torneo, uniforme).
     · Clasificación de equipos (qf/sf/final/3º) SÓLO por picks aún vivos.
     · Premios (campeón/subcampeón/3º) sólo si el equipo sigue vivo;
       Balón/Bota se asumen aún alcanzables (oro).
   Uso:  node scripts/metaporra-candidates.js            (informa)
         node scripts/metaporra-candidates.js --write    (escribe DATA.metaporra.candidates)
   =========================================================== */
'use strict';

const { readDataJs, writeDataJs } = require('./data-io');

const REMAINING_MATCH_MAX = 113;              // 7+44+26+18+18 (octavos→final)
const QP = { qf: 20, sf: 30, thirdPlace: 40, final: 50 };
const AW = { champion: 60, runnerup: 50, third: 40, balon: 20, bota: 20 };

function totals(D) {
  const o = {};
  D.players.forEach(p => { const s = D.clasif.series[p.name]; o[p.name] = s && s.length ? s[s.length - 1] : 0; });
  return o;
}

/** Equipos aún vivos = cuartofinalistas confirmados + los 2 del octavos pendiente. */
function aliveTeams(D) {
  const set = new Set(D.actual_qualifiers.qf || []);
  (D.ko_bracket || []).forEach(e => {
    if (e.round !== 'r16') return;
    const played = e.result && /^-?\d+--?\d+$/.test(e.result);
    if (played) return;
    if (e.home_team) set.add(e.home_team);
    if (e.away_team) set.add(e.away_team);
  });
  return set;
}

function ceilingFor(p, alive, pendingOctavosTeams) {
  let c = REMAINING_MATCH_MAX;
  const inAlive = t => alive.has(t);
  // qf: queda 1 plaza (ganador del octavos pendiente) → 20 si tiene a alguno de esos 2
  const qf = p.bets.qf || [];
  if (qf.some(t => pendingOctavosTeams.has(t))) c += QP.qf;
  // sf: 30 por cada semifinalista firmado aún vivo (máx 4)
  const sfAlive = (p.bets.sf || []).filter(inAlive).length;
  c += Math.min(sfAlive, 4) * QP.sf;
  // 3º/4º: 40 por semifinalista firmado aún vivo (máx 2)
  c += Math.min(sfAlive, 2) * QP.thirdPlace;
  // final: 50 por finalista firmado aún vivo (máx 2)
  const finAlive = (p.bets.final || []).filter(inAlive).length;
  c += Math.min(finAlive, 2) * QP.final;
  // premios de equipo (sólo si el equipo sigue vivo)
  if (p.champion && inAlive(p.champion)) c += AW.champion;
  if (p.runnerup && inAlive(p.runnerup)) c += AW.runnerup;
  if (p.third && inAlive(p.third))       c += AW.third;
  // Balón/Bota: carrera abierta → se asumen alcanzables (oro)
  c += AW.balon + AW.bota;
  return c;
}

function main() {
  const D = readDataJs();
  const tot = totals(D);
  const ranking = Object.entries(tot).sort((a, b) => b[1] - a[1]);
  const leader = ranking[0][1];

  const alive = aliveTeams(D);
  const pendingOctavosTeams = new Set();
  (D.ko_bracket || []).forEach(e => {
    if (e.round !== 'r16') return;
    const played = e.result && /^-?\d+--?\d+$/.test(e.result);
    if (played) return;
    if (e.home_team) pendingOctavosTeams.add(e.home_team);
    if (e.away_team) pendingOctavosTeams.add(e.away_team);
  });

  console.log('Líder:', ranking[0][0], leader, 'pts');
  console.log('Equipos vivos (' + alive.size + '):', [...alive].join(', '));
  console.log('Octavos pendiente:', [...pendingOctavosTeams].join(' vs '));
  console.log('');

  const rows = ranking.map(([name, pts], i) => {
    const p = D.players.find(x => x.name === name);
    const ceil = ceilingFor(p, alive, pendingOctavosTeams);
    const maxFinal = pts + ceil;
    return { pos: i + 1, name, pts, ceil, maxFinal, alive: maxFinal >= leader };
  });

  // "Contendientes reales" = top N por puntos actuales, excluyendo a quien ya
  // esté matemáticamente eliminado. La eliminación estricta apenas discrimina a
  // mitad de torneo (casi todos siguen vivos), así que el corte práctico es el
  // top N; sube/baja TOP_N o pásalo por CLI: `... --top=15`.
  const topArg = (process.argv.find(a => a.startsWith('--top=')) || '').split('=')[1];
  const TOP_N = Number(topArg) || 20;
  const contenders = rows.filter(r => r.alive).slice(0, TOP_N).map(r => r.name);

  console.log('=== Puede alcanzar al líder (contendiente) ? ===');
  console.log('Pos  Jugador                 Actual  +Techo  =MáxFinal  ¿Vivo?');
  rows.forEach(r => {
    console.log(
      String(r.pos).padStart(3) + '  ' +
      r.name.padEnd(22) + '  ' +
      String(r.pts).padStart(5) + '   ' +
      String(r.ceil).padStart(4) + '    ' +
      String(r.maxFinal).padStart(6) + '     ' +
      (r.alive ? 'SÍ' : '—')
    );
  });
  console.log('\nMatemáticamente vivos:', rows.filter(r => r.alive).length, '/', rows.length,
    '· Contendientes (top ' + TOP_N + '):', contenders.length);
  console.log('Lista:', contenders.join(', '));

  if (process.argv.includes('--write')) {
    if (!D.metaporra) D.metaporra = {};
    D.metaporra.candidates = contenders;
    D.metaporra.candidates_updated = new Date().toISOString();
    const changed = writeDataJs(D);
    console.log('\nDATA.metaporra.candidates escrito (' + contenders.length + '):', changed);
  } else {
    console.log('\n(usa --write para guardar en DATA.metaporra.candidates)');
  }
}

main();
