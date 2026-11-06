// Start here topics: category badges floating over the drifting polygons. They start in a loose spiral (largest in
// the middle) that turns slowly clockwise, each token also circling its own spot a little, and a token leans toward
// the pointer when it gets close. With reduced motion they sit still in that arrangement (with no JS at all, in a
// wrapped row). Each token is a real link. Tokens also drift nearer and further away: the further back, the
// smaller and fainter it is, and it sits behind the nearer ones.
//
// Markup: .constellation > [data-shapes-anchor] > ul > li > a.token[data-size]; sizes come from the stylesheet.

const MAGNET = 0.6; // how far toward the pointer a token leans, as a fraction of the distance, when it's right on it
const SPIN = 0.00005; // rad/ms: the whole arrangement turns clockwise, a full turn in about two minutes
const WOBBLE = 7; // px: radius of each token's own small clockwise circle
const EASE = 0.14;
const DEPTH_MS = 6500; // ms for a token to go from near to far and back (each is offset from the others)
const FRAME = 1000 / 30 - 2;

type Token = { el: HTMLElement; r: number; hx: number; hy: number; x: number; y: number; ph: number; d: number; tx: number; ty: number; td: number };

function setup(root: HTMLElement) {
  const stage = root.querySelector<HTMLElement>("[data-shapes-anchor]");
  const els = [...root.querySelectorAll<HTMLElement>(".token")];
  if (!stage || !els.length) return;

  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  const tokens: Token[] = els.map((el, i) => ({ el, r: 0, hx: 0, hy: 0, x: 0, y: 0, ph: i * 2.4, d: 0, tx: 0, ty: 0, td: 0 }));

  // Home positions: a spiral from the middle out (biggest first), then a few rounds of pushing overlaps apart.
  function arrange() {
    const W = stage!.clientWidth;
    const H = stage!.clientHeight;
    if (!W) return false;
    tokens.forEach((t) => (t.r = t.el.offsetWidth / 2));
    const order = [...tokens].sort((a, b) => b.r - a.r);
    const R = Math.min(W, H) / 2;
    order.forEach((t, i) => {
      const d = R * 0.78 * Math.sqrt((i + 0.5) / order.length);
      const a = i * 2.39996;
      t.hx = Math.cos(a) * d;
      t.hy = Math.sin(a) * d;
    });
    for (let pass = 0; pass < 40; pass++) {
      for (const a of tokens) {
        for (const b of tokens) {
          if (a === b) continue;
          const dx = b.hx - a.hx;
          const dy = b.hy - a.hy;
          const d = Math.hypot(dx, dy) || 0.01;
          const min = a.r + b.r + 10;
          if (d < min) {
            const k = (min - d) / 2 / d;
            a.hx -= dx * k;
            a.hy -= dy * k;
            b.hx += dx * k;
            b.hy += dy * k;
          }
        }
        const lim = Math.min(W, H) / 2 - a.r - 4; // keep inside the stage
        const m = Math.hypot(a.hx, a.hy);
        if (m > lim) {
          a.hx *= lim / m;
          a.hy *= lim / m;
        }
      }
    }
    tokens.forEach((t) => {
      t.x = t.hx;
      t.y = t.hy;
    });
    return true;
  }

  // d: -1 (far back) to 1 (nearest)
  const place = (t: Token, x: number, y: number, d = 0) => {
    const near = (d + 1) / 2;
    const s = 0.78 + near * 0.4; // 78% when furthest, 118% when nearest
    t.el.style.transform = `translate(calc(-50% + ${x.toFixed(1)}px), calc(-50% + ${y.toFixed(1)}px)) scale(${s.toFixed(3)})`;
    t.el.style.opacity = (0.5 + near * 0.5).toFixed(2);
    t.el.style.zIndex = String(Math.round(near * 10) + 1);
  };
  const still = (t: Token) => Math.sin(t.ph * 1.9); // each token's fixed depth when nothing moves

  const ptr = { x: -9999, y: -9999 };
  let moving = false;
  const onMove = (e: PointerEvent) => {
    const b = stage.getBoundingClientRect();
    ptr.x = e.clientX - b.left - b.width / 2;
    ptr.y = e.clientY - b.top - b.height / 2;
  };

  let focused: Token | null = null; // the token with keyboard focus
  root.addEventListener("focusin", (e) => (focused = tokens.find((t) => t.el === (e.target as HTMLElement).closest(".token")) ?? null));
  root.addEventListener("focusout", () => (focused = null));
  addEventListener("pointerout", (e) => {
    if (!e.relatedTarget) ptr.x = ptr.y = -9999; // the pointer left the window
  });

  let running = false;
  let onscreen = true;
  let last = 0;
  let clock = 0;
  function tick(now: number) {
    if (!running) return;
    requestAnimationFrame(tick);
    if (last && now - last < FRAME) return;
    clock += last ? Math.min(now - last, 100) : 0;
    last = now;
    const rot = clock * SPIN;
    const cos = Math.cos(rot);
    const sin = Math.sin(rot);
    for (const t of tokens) {
      const w = clock / 9000 + t.ph; // y points down, so increasing angles go clockwise on screen
      t.td = Math.sin((clock / DEPTH_MS) * 2 * Math.PI + t.ph * 1.9);
      const persp = 1 + 0.06 * t.td; // nearer tokens sit a little further from the middle, as if seen in perspective
      let tx = (t.hx * cos - t.hy * sin) * persp + Math.cos(w) * WOBBLE;
      let ty = (t.hx * sin + t.hy * cos) * persp + Math.sin(w) * WOBBLE;
      // magnet: within half a token's size of its edge, the token leans toward the pointer
      const zone = t.r * 2;
      const dist = Math.hypot(ptr.x - tx, ptr.y - ty);
      if (dist < zone) {
        const k = 1 - dist / zone;
        const pull = MAGNET * k * k * (3 - 2 * k); // smoothstep
        tx += (ptr.x - tx) * pull;
        ty += (ptr.y - ty) * pull;
      }
      t.tx = tx;
      t.ty = ty;
    }
    // The token under the pointer (or focused from the keyboard) comes to the front and shoves its neighbours aside.
    let active: Token | null = null;
    let best = Infinity;
    for (const t of tokens) {
      const dd = Math.hypot(ptr.x - t.x, ptr.y - t.y);
      if (dd < t.r && dd < best) {
        best = dd;
        active = t;
      }
    }
    active ??= focused;
    if (active) {
      active.td = 1;
      for (const t of tokens) {
        if (t === active) continue;
        const dx = t.tx - active.x;
        const dy = t.ty - active.y;
        const dist = Math.hypot(dx, dy) || 1;
        const range = (active.r + t.r) * 1.6;
        if (dist < range) {
          const push = (range - dist) * 0.8;
          t.tx += (dx / dist) * push;
          t.ty += (dy / dist) * push;
        }
      }
    }
    for (const t of tokens) {
      t.x += (t.tx - t.x) * EASE;
      t.y += (t.ty - t.y) * EASE;
      t.d += (t.td - t.d) * 0.12;
      place(t, t.x, t.y, t.d);
    }
  }

  const live = () => !reduced.matches && onscreen && !document.hidden && stage!.clientWidth > 0;
  function update() {
    if (live() && !running) {
      running = true;
      last = 0;
      if (!moving) {
        addEventListener("pointermove", onMove, { passive: true });
        moving = true;
      }
      requestAnimationFrame(tick);
    } else if (!live()) {
      running = false;
      if (moving) {
        removeEventListener("pointermove", onMove);
        moving = false;
      }
      ptr.x = ptr.y = -9999;
      if (arrange()) tokens.forEach((t) => place(t, t.hx, t.hy, still(t))); // settle back to the still arrangement
    }
  }

  const start = () => {
    if (!arrange()) return;
    root.classList.add("is-live"); // switches the tokens from a wrapped row to absolute positions
    tokens.forEach((t) => {
      t.d = still(t);
      place(t, t.hx, t.hy, t.d);
    });
    update();
  };
  start();
  let width = stage.clientWidth;
  addEventListener("resize", () => {
    if (stage.clientWidth === width) return;
    width = stage.clientWidth;
    root.classList.toggle("is-live", width > 0);
    if (arrange()) tokens.forEach((t) => place(t, t.hx, t.hy, still(t)));
    update();
  });
  reduced.addEventListener("change", update);
  document.addEventListener("visibilitychange", update);
  if ("IntersectionObserver" in window) {
    new IntersectionObserver((entries) => {
      onscreen = entries[0].isIntersecting;
      update();
    }).observe(root);
  }
}

export function initConstellation() {
  document.querySelectorAll<HTMLElement>(".constellation").forEach(setup);
}
