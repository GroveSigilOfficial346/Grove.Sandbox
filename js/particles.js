(() => {
  const canvas = document.querySelector(".grove-particles");
  if (!canvas) return;

  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const reducedMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)"
  );

  const palette = [
    [5, 201, 244],
    [53, 59, 255],
    [133, 30, 255],
    [235, 54, 237],
    [247, 245, 255]
  ];

  let width = 0;
  let height = 0;
  let dpr = 1;
  let particles = [];
  let animationId = 0;
  let lastTime = 0;

  const rand = (min, max) =>
    min + Math.random() * (max - min);

  function createParticle(initial = false) {
    const edge = Math.floor(Math.random() * 4);
    let x = rand(0, width);
    let y = rand(0, height);

    if (!initial) {
      if (edge === 0) {
        x = -10;
        y = rand(0, height);
      } else if (edge === 1) {
        x = width + 10;
        y = rand(0, height);
      } else if (edge === 2) {
        x = rand(0, width);
        y = -10;
      } else {
        x = rand(0, width);
        y = height + 10;
      }
    }

    return {
      x,
      y,
      size: rand(0.5, 1.8),
      speed: rand(0.25, 0.9),
      angle: rand(0, Math.PI * 2),
      phase: rand(0, Math.PI * 2),
      color: palette[
        Math.floor(Math.random() * palette.length)
      ],
      opacity: rand(0.2, 0.8),
      length: rand(5, 22),
      orbit: rand(0.75, 1.25)
    };
  }

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    width = window.innerWidth;
    height = window.innerHeight;

    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const count = Math.min(
      320,
      Math.max(120, Math.round(width * height / 5000))
    );

    particles = Array.from(
      { length: count },
      () => createParticle(true)
    );

    if (reducedMotion.matches) drawStatic();
  }

  function drawStatic() {
    ctx.clearRect(0, 0, width, height);

    for (const p of particles) {
      const [r, g, b] = p.color;
      ctx.beginPath();
      ctx.fillStyle =
        `rgba(${r},${g},${b},${p.opacity * 0.55})`;
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function animate(time) {
    animationId = 0;

    if (reducedMotion.matches) {
      drawStatic();
      return;
    }

    const delta = lastTime
      ? Math.min((time - lastTime) / 16.67, 2)
      : 1;

    lastTime = time;
    ctx.clearRect(0, 0, width, height);

    const cx = width * 0.5;
    const cy = height * 0.5;
    const sceneScale = Math.min(width, height);
    const logoRadius = sceneScale * 0.19;

    for (const p of particles) {
      const dx = p.x - cx;
      const dy = p.y - cy;
      const distance = Math.hypot(dx, dy) || 1;
      const angle = Math.atan2(dy, dx);

      // Curving currents create flowing, cosmic particle streams.
      const current =
        Math.sin(angle * 2 + p.phase) * 0.42;

      let vx = 0.65 + Math.cos(angle + Math.PI / 2) * current;
      let vy = -0.2 + Math.sin(angle + Math.PI / 2) * current;

      // Particles gently follow an orbit around the logo.
      const ringDistance = Math.abs(distance - logoRadius);
      const nearLogo = Math.max(
        0,
        1 - ringDistance / (sceneScale * 0.17)
      );

      const tangentX = -dy / distance;
      const tangentY = dx / distance;

      vx += tangentX * nearLogo * 0.7;
      vy += tangentY * nearLogo * 0.7;

      p.x += vx * p.speed * p.orbit * delta;
      p.y += vy * p.speed * p.orbit * delta;

      // Small organic drift keeps the motion from feeling mechanical.
      p.x += Math.sin(time * 0.0005 + p.phase) * 0.12 * delta;
      p.y += Math.cos(time * 0.0006 + p.phase) * 0.12 * delta;

      if (
        p.x < -30 ||
        p.x > width + 30 ||
        p.y < -30 ||
        p.y > height + 30
      ) {
        Object.assign(p, createParticle(false));
      }

      const [r, g, b] = p.color;
      const shimmer =
        0.65 + 0.35 * Math.sin(time * 0.0015 + p.phase);
      const alpha = p.opacity * shimmer;
      const trailLength = p.length * (1 + nearLogo * 0.35);

      // Directional streaks follow each particle's movement.
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(
        p.x - vx * trailLength,
        p.y - vy * trailLength
      );
      ctx.strokeStyle =
        `rgba(${r},${g},${b},${alpha * 0.4})`;
      ctx.lineWidth = p.size;
      ctx.stroke();

      // The particle cores glow in the official Grove palette.
      ctx.beginPath();
      ctx.fillStyle = `rgba(${r},${g},${b},${alpha})`;
      ctx.shadowColor = `rgba(${r},${g},${b},0.95)`;
      ctx.shadowBlur = 4 + p.size * 4 + nearLogo * 3;
      ctx.arc(
        p.x,
        p.y,
        p.size * (1 + nearLogo * 0.5),
        0,
        Math.PI * 2
      );
      ctx.fill();
    }

    ctx.shadowBlur = 0;

    // A faint, breathing energy field surrounds the preserved logo.
    const pulse = 0.5 + 0.5 * Math.sin(time * 0.0007);
    const aura = ctx.createRadialGradient(
      cx, cy, sceneScale * 0.035,
      cx, cy, sceneScale * 0.34
    );

    aura.addColorStop(
      0,
      `rgba(133,30,255,${0.025 + pulse * 0.025})`
    );
    aura.addColorStop(
      0.48,
      `rgba(53,59,255,${0.015 + pulse * 0.015})`
    );
    aura.addColorStop(1, "rgba(5,201,244,0)");

    ctx.fillStyle = aura;
    ctx.fillRect(0, 0, width, height);

    animationId = requestAnimationFrame(animate);
  }

  function start() {
    if (animationId) cancelAnimationFrame(animationId);
    animationId = 0;
    lastTime = 0;
    resize();

    if (reducedMotion.matches) {
      drawStatic();
    } else {
      animationId = requestAnimationFrame(animate);
    }
  }

  window.addEventListener("resize", resize, { passive: true });

  if (reducedMotion.addEventListener) {
    reducedMotion.addEventListener("change", start);
  } else {
    reducedMotion.addListener(start);
  }

  start();
})();
