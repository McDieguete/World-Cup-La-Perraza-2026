/* ===========================================================
   fireworks.js — Fuegos artificiales de celebración (colores de
   España: rojo y amarillo). Se lanzan durante ~5 s cada vez que
   se abre la web y luego el lienzo se desvanece y se elimina.

   · Vanilla JS, sin dependencias. Lienzo <canvas> a pantalla
     completa, superpuesto, sin capturar eventos.
   · Respeta prefers-reduced-motion (no anima si el usuario lo pide).
   =========================================================== */

(function () {
  'use strict';

  // No molestar a quien pide menos movimiento.
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const TOTAL_MS  = 5000;   // duración visible aproximada
  const SPAWN_MS  = 3900;   // hasta cuándo se lanzan cohetes nuevos
  const FADE_MS   = 4400;   // cuándo empieza el desvanecido

  // Paleta rojo + amarillo/oro de la bandera de España.
  const COLORS = ['#C60B1E', '#E0271B', '#FF3B30', '#FFC400', '#FFD400', '#F7B500', '#FFE45E'];
  const pick = arr => arr[(Math.random() * arr.length) | 0];

  function start() {
    if (!document.body) return;

    const canvas = document.createElement('canvas');
    canvas.className = 'fw-canvas';
    canvas.setAttribute('aria-hidden', 'true');
    document.body.appendChild(canvas);

    const ctx = canvas.getContext('2d');
    let dpr = Math.min(window.devicePixelRatio || 1, 2);
    let W = 0, H = 0;

    function resize() {
      W = window.innerWidth;
      H = window.innerHeight;
      canvas.width  = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    resize();
    window.addEventListener('resize', resize);

    const rockets = [];
    const sparks  = [];
    const GRAVITY = 0.05;

    function launch() {
      rockets.push({
        x: W * (0.15 + Math.random() * 0.70),
        y: H,
        vy: -(Math.random() * 3 + 8.5),          // velocidad de subida
        targetY: H * (0.16 + Math.random() * 0.34),
        color: pick(COLORS)
      });
    }

    function explode(x, y, color) {
      const n = 46 + ((Math.random() * 34) | 0);
      for (let i = 0; i < n; i++) {
        const ang = (Math.PI * 2 * i) / n + Math.random() * 0.3;
        const spd = Math.random() * 4.2 + 1.4;
        sparks.push({
          x, y,
          vx: Math.cos(ang) * spd,
          vy: Math.sin(ang) * spd,
          life: 1,
          decay: Math.random() * 0.012 + 0.010,
          // Mezcla la mayoría del color del cohete con destellos de la otra gama.
          color: Math.random() < 0.75 ? color : pick(COLORS),
          size: Math.random() * 1.6 + 1.2
        });
      }
    }

    const t0 = performance.now();
    let lastLaunch = 0;
    let raf = 0;

    function frame(now) {
      const elapsed = now - t0;
      ctx.clearRect(0, 0, W, H);
      ctx.globalCompositeOperation = 'lighter';   // brillo aditivo

      // Lanzar cohetes a intervalos mientras dure la fase de spawn.
      if (elapsed < SPAWN_MS && now - lastLaunch > (170 + Math.random() * 160)) {
        launch();
        if (Math.random() < 0.35) launch();        // ráfagas dobles ocasionales
        lastLaunch = now;
      }

      // Cohetes en ascenso.
      for (let i = rockets.length - 1; i >= 0; i--) {
        const r = rockets[i];
        r.x += 0; r.y += r.vy; r.vy += GRAVITY * 0.6;
        ctx.globalAlpha = 1;
        ctx.fillStyle = r.color;
        ctx.beginPath();
        ctx.arc(r.x, r.y, 2.2, 0, Math.PI * 2);
        ctx.fill();
        // estela corta
        ctx.globalAlpha = 0.35;
        ctx.beginPath();
        ctx.arc(r.x, r.y + 6, 1.4, 0, Math.PI * 2);
        ctx.fill();
        if (r.y <= r.targetY || r.vy >= 0) {
          explode(r.x, r.y, r.color);
          rockets.splice(i, 1);
        }
      }

      // Partículas de explosión.
      for (let i = sparks.length - 1; i >= 0; i--) {
        const s = sparks[i];
        s.vx *= 0.985; s.vy *= 0.985; s.vy += GRAVITY;
        s.x += s.vx; s.y += s.vy;
        s.life -= s.decay;
        if (s.life <= 0) { sparks.splice(i, 1); continue; }
        ctx.globalAlpha = Math.max(0, s.life);
        ctx.fillStyle = s.color;
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.size, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';

      if (elapsed >= FADE_MS && !canvas.classList.contains('fw-out')) {
        canvas.classList.add('fw-out');            // dispara el fundido (CSS)
      }

      // A los ~5 s el lienzo ya está a opacidad 0 (fundido iniciado en FADE_MS),
      // así que paramos y lo retiramos del DOM aunque queden partículas: son
      // invisibles. Teardown determinista, sin dejar el <canvas> colgando.
      if (elapsed < TOTAL_MS) {
        raf = requestAnimationFrame(frame);
      } else {
        cleanup();
      }
    }

    function cleanup() {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
    }

    // Empuje inicial y arranque del bucle.
    launch(); launch();
    raf = requestAnimationFrame(frame);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
})();
