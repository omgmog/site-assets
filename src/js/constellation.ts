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
const TILT = 0.35; // radians (20 degrees): how far each token rocks either way
const DEPTH_MS = 6500; // ms for a token to go from near to far and back (each is offset from the others)
const FRAME = 1000 / 30 - 2;

// stable pseudo-random 0..1
const hash = (n: number) => {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};

type Token = { el: HTMLElement; r: number; hx: number; hy: number; x: number; y: number; ph: number; d: number; tx: number; ty: number; td: number; tilt: number; rot: number; rt: number; per: number };

function setup(root: HTMLElement) {
  const stage = root.querySelector<HTMLElement>("[data-shapes-anchor]");
  const els = [...root.querySelectorAll<HTMLElement>(".token")];
  if (!stage || !els.length) return;

  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  const tokens: Token[] = els.map((el, i) => ({
    el,
    r: 0,
    hx: 0,
    hy: 0,
    x: 0,
    y: 0,
    ph: i * 2.4,
    d: 0,
    tx: 0,
    ty: 0,
    td: 0,
    tilt: (hash(i * 7 + 11) - 0.5) * 2 * TILT, // the still angle, used when nothing moves
    rot: 0,
    rt: 0,
    per: 6000 + hash(i * 13 + 5) * 5000, // ms for one rock each way and back
  }));

  // Home positions: start from a spiral arm out from the middle (big and small alternating), then knock every token
  // off it by a different amount, so the spiral is only a hint in a scatter; then rounds of pushing overlaps apart.
  function arrange() {
    const W = stage!.clientWidth;
    const H = stage!.clientHeight;
    if (!W) return false;
    tokens.forEach((t) => (t.r = t.el.offsetWidth / 2));
    const bySize = [...tokens].sort((a, b) => b.r - a.r);
    const order: Token[] = [];
    while (bySize.length) {
      order.push(bySize.shift()!); // biggest left...
      if (bySize.length) order.push(bySize.pop()!); // ...then smallest left, and so on
    }
    const R = Math.min(W, H) / 2;
    const pitch = (order[0].r * 2 + 12) / (2 * Math.PI); // radius gained per radian: arms a token-width apart
    let theta = 0;
    let px = 0;
    let py = 0;
    order.forEach((t, i) => {
      if (i === 0) {
        t.hx = t.hy = 0;
      } else {
        const prev = order[i - 1];
        const need = prev.r + t.r + 8;
        do theta += 0.02;
        while (Math.hypot(Math.cos(theta + 0.6) * pitch * theta - px, Math.sin(theta + 0.6) * pitch * theta - py) < need);
        t.hx = Math.cos(theta + 0.6) * pitch * theta;
        t.hy = Math.sin(theta + 0.6) * pitch * theta;
      }
      px = t.hx;
      py = t.hy;
      // Knock each one off the arm: swing it round the middle, and move it in or out, by a different amount each
      const ang = Math.atan2(t.hy, t.hx) + (hash(i * 3 + 1) - 0.5) * 1.3;
      const rad = Math.hypot(t.hx, t.hy) * (0.75 + hash(i * 3 + 2) * 0.55);
      t.hx = Math.cos(ang) * rad + (hash(i * 3 + 3) - 0.5) * 26;
      t.hy = Math.sin(ang) * rad + (hash(i * 5 + 4) - 0.5) * 26;
    });
    const reach = Math.max(...order.map((t) => Math.hypot(t.hx, t.hy) + t.r));
    const fit = (R - 6) / reach;
    if (fit < 1) order.forEach((t) => ((t.hx *= fit), (t.hy *= fit))); // squeeze in if the arm runs past the stage
    for (let pass = 0; pass < 30; pass++) {
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

  // d: -1 (far back) to 1 (nearest); rot: radians
  const place = (t: Token, x: number, y: number, d = 0, rot = 0) => {
    const near = (d + 1) / 2;
    const s = 0.78 + near * 0.4; // 78% when furthest, 118% when nearest
    t.el.style.transform = `translate(calc(-50% + ${x.toFixed(1)}px), calc(-50% + ${y.toFixed(1)}px)) scale(${s.toFixed(3)}) rotate(${rot.toFixed(3)}rad)`;
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
  let angle = 0; // how far the whole arrangement has turned
  let calm = 0; // 0 when moving freely, 1 when a token is being hovered: the turn and wobble hold still
  let hovering = false;
  function tick(now: number) {
    if (!running) return;
    requestAnimationFrame(tick);
    if (last && now - last < FRAME) return;
    const dt = last ? Math.min(now - last, 100) : 0;
    clock += dt;
    last = now;
    calm += ((hovering ? 1 : 0) - calm) * 0.12; // eases in and out, so nothing stops dead
    angle += dt * SPIN * (1 - calm); // while one is hovered nothing turns, so another can't slide under the pointer
    const rot = angle;
    const cos = Math.cos(rot);
    const sin = Math.sin(rot);
    for (const t of tokens) {
      const w = clock / 9000 + t.ph; // y points down, so increasing angles go clockwise on screen
      t.td = Math.sin((clock / DEPTH_MS) * 2 * Math.PI + t.ph * 1.9);
      t.rt = TILT * Math.sin((clock / t.per) * 2 * Math.PI + t.ph * 1.3); // each rocks between -20 and +20 degrees on its own beat
      const persp = 1 + 0.06 * t.td; // nearer tokens sit a little further from the middle, as if seen in perspective
      let tx = (t.hx * cos - t.hy * sin) * persp + Math.cos(w) * WOBBLE * (1 - calm);
      let ty = (t.hx * sin + t.hy * cos) * persp + Math.sin(w) * WOBBLE * (1 - calm);
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
    hovering = !!active;
    if (active) {
      active.td = 1;
      active.rt = 0; // squares up
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
    const reach = Math.min(stage!.clientWidth, stage!.clientHeight) / 2;
    for (const t of tokens) {
      const lim = reach - t.r * 1.6 - 4; // room for the biggest it gets: nearest depth, tilted, or grown on hover
      const m = Math.hypot(t.tx, t.ty);
      if (m > lim) {
        t.tx *= lim / m; // keep every token, however it's pushed or pulled, inside the stage
        t.ty *= lim / m;
      }
      t.x += (t.tx - t.x) * EASE;
      t.y += (t.ty - t.y) * EASE;
      t.d += (t.td - t.d) * 0.12;
      t.rot += (t.rt - t.rot) * 0.15;
      place(t, t.x, t.y, t.d, t.rot);
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
      if (arrange()) tokens.forEach((t) => place(t, t.hx, t.hy, still(t), t.tilt)); // settle back to the still arrangement
    }
  }

  const start = () => {
    if (!arrange()) return;
    root.classList.add("is-live"); // switches the tokens from a wrapped row to absolute positions
    tokens.forEach((t) => {
      t.d = still(t);
      t.rot = t.tilt;
      place(t, t.hx, t.hy, t.d, t.rot);
    });
    update();
  };
  start();
  let width = stage.clientWidth;
  addEventListener("resize", () => {
    if (stage.clientWidth === width) return;
    width = stage.clientWidth;
    root.classList.toggle("is-live", width > 0);
    if (arrange()) tokens.forEach((t) => place(t, t.hx, t.hy, still(t), t.tilt));
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
