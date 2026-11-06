// Slowly turning, morphing 2D polygons behind a photo: three layers of brush-edged yellow
// shapes whose corners drift in and out. Used on the About page and in the post author block.
//
// Markup: <div><canvas data-shapes aria-hidden="true"></canvas><img ...></div>. The canvas's
// parent holds the photo; the shapes are centred on the head and fade out with the bottom of
// the photo. Any element with data-shapes-anchor can stand in for the photo (the Start here topics).
// Options, all optional, as data attributes on the canvas:
//   data-clip="selector"       keep the shapes inside this element's box (default: the canvas)
//   data-still-below="899"     at or below this viewport width, draw one fixed frame and never animate
//   data-r="0.525"             shape radius, as a fraction of the photo's width
//   data-cx="0.53" data-cy="0.42"   head centre, as fractions of the photo's width and height
//   data-fade="0.55,0.8"       where the shapes fade out down the photo (fractions of its height)

const RES = 0.5; // canvas resolution as a fraction of the screen's: soft shapes, a quarter of the pixels
const STILL_T = 30000; // the moment in the animation a still frame is taken from
const FRAME = 1000 / 30 - 2; // 30fps cap; the 2ms slack stops a 60Hz screen skipping every other frame

// depth, back to front: slower layers are further away, wander more and move less with the page
const PULSE = [11000, 8000, 5500]; // ms per breath, per layer: scale swings between 90% and 105%
const SPEEDS = [0.6, 0.8, 1];
const ORBIT = [0.1, 0.06, 0.02];
const DEPTH = [0.4, 0.7, 1];

// stable pseudo-random 0..1
const hash = (n: number) => {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};

// pointer, -1..1 across the window, shared by every instance
const pointer = { tx: 0, ty: 0 };
let pointerListening = false;

function listenToPointer() {
  if (pointerListening || !matchMedia("(pointer: fine)").matches) return;
  pointerListening = true;
  addEventListener(
    "pointermove",
    (e) => {
      pointer.tx = (e.clientX / innerWidth) * 2 - 1;
      pointer.ty = (e.clientY / innerHeight) * 2 - 1;
    },
    { passive: true },
  );
}

function setup(cv: HTMLCanvasElement) {
  const ctx = cv.getContext("2d");
  const photo = cv.parentElement?.querySelector<HTMLElement>("img, [data-shapes-anchor]");
  if (!ctx || !photo) return;

  const num = (name: string, fallback: number) => {
    const v = parseFloat(cv.dataset[name] ?? "");
    return Number.isFinite(v) ? v : fallback;
  };
  const stillBelow = num("stillBelow", 899);
  const radius = num("r", 0.525);
  const headX = num("cx", 0.53);
  const headY = num("cy", 0.42);
  const [fade0, fade1] = (cv.dataset.fade ?? "0.55,0.8").split(",").map(Number);
  const clipTo = cv.dataset.clip ? document.querySelector(cv.dataset.clip) : null;

  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  const small = matchMedia(`(max-width: ${stillBelow}px)`);
  const frozen = () => reduced.matches || (stillBelow > 0 && small.matches);

  // Animated: each layer is a different random polygon (6-9 sides, no repeats) with a random phase,
  // new on every load. Frozen: one fixed arrangement, drawn once.
  let sides: number[] = [];
  let phases: number[] = [];
  let tilts: number[] = [];
  const arrange = () => {
    if (frozen()) {
      sides = [7, 9, 6];
      phases = [1.3, 3.9, 5.2];
      tilts = [0.7, 2.8, 4.9];
      return;
    }
    sides = [6, 7, 8, 9].sort(() => Math.random() - 0.5).slice(0, 3);
    phases = sides.map(() => Math.random() * 6.28);
    const tilt0 = Math.random() * 6.28; // spread a third of a turn apart so layers never line up
    tilts = sides.map((_, i) => tilt0 + i * 2.09);
  };
  arrange();

  const ptr = { x: 0, y: 0 }; // this instance's eased copy of the pointer

  function draw(t: number) {
    const dpr = (window.devicePixelRatio || 1) * RES;
    const w = cv.clientWidth;
    const h = cv.clientHeight;
    const pw = Math.round(w * dpr);
    const ph = Math.round(h * dpr);
    if (cv.width !== pw || cv.height !== ph) {
      cv.width = pw;
      cv.height = ph;
    }
    ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx!.clearRect(0, 0, w, h);
    const c2 = ctx!;
    const yellow = getComputedStyle(cv).getPropertyValue("--yellow").trim() || "#ffe600";
    const c = cv.getBoundingClientRect();
    const im = photo!.getBoundingClientRect();
    const R = im.width * radius;
    const cx = im.left - c.left + im.width * headX;
    const cy = im.top - c.top + im.height * headY;
    ptr.x += (pointer.tx - ptr.x) * 0.08;
    ptr.y += (pointer.ty - ptr.y) * 0.08;
    const off = frozen() ? 0 : Math.max(-300, Math.min(300, c.top + c.height / 2 - innerHeight / 2)) * 0.25; // scroll parallax

    function poly(layer: number, scale: number, dir: number, alpha: number) {
      const N = sides[layer];
      const phase = phases[layer];
      const tilt = tilts[layer];
      const d = DEPTH[layer];
      const lt = t * SPEEDS[layer]; // each layer runs on its own clock
      const spin = ((dir * lt) / 120000) * 2 * Math.PI + tilt;
      const ox = cx + Math.cos(lt / 9000 + phase) * R * ORBIT[layer] - ptr.x * 14 * d; // wander + pointer
      const oy = cy + Math.sin(lt / 7000 + phase * 1.3) * R * ORBIT[layer] - ptr.y * 14 * d - (1 - d) * off;
      // opacity follows size: 100% of its base at 90% scale, fading to 80% of base at 105%
      const breath = 0.975 + 0.075 * Math.sin((t / PULSE[layer]) * 2 * Math.PI + phase); // 0.90 to 1.05
      const Rr = R * scale * breath;
      const corners: [number, number][] = [];
      for (let i = 0; i < N; i++) {
        const ang = spin + (i / N) * 2 * Math.PI;
        const r = Rr * (0.78 + 0.16 * Math.sin(lt / 4400 + i * 2.3 + phase) + 0.08 * Math.sin(lt / 1800 + i * 4.1 + phase));
        corners.push([ox + Math.cos(ang) * r, oy + Math.sin(ang) * r]);
      }
      // brushy edges: each side is cut into short segments nudged sideways by a fixed random amount
      // that breathes slowly
      c2.beginPath();
      const K = 9;
      const amp = Rr * 0.035;
      let first = true;
      for (let i = 0; i < N; i++) {
        const p0 = corners[i];
        const p1 = corners[(i + 1) % N];
        const dx = p1[0] - p0[0];
        const dy = p1[1] - p0[1];
        const len = Math.hypot(dx, dy) || 1;
        for (let k = 0; k < K; k++) {
          const sg = i * K + k;
          const j = (hash(sg + phase * 10) - 0.5) * 2 * amp * (0.75 + 0.25 * Math.sin(lt / 2600 + sg));
          const f = k / K;
          const px = p0[0] + dx * f - (dy / len) * j;
          const py = p0[1] + dy * f + (dx / len) * j;
          if (first) c2.moveTo(px, py);
          else c2.lineTo(px, py);
          first = false;
        }
      }
      c2.closePath();
      c2.globalAlpha = alpha * (1 - (0.2 * (breath - 0.9)) / 0.15);
      c2.fillStyle = yellow;
      c2.fill();
      c2.globalAlpha = 1;
    }

    c2.save();
    c2.beginPath();
    if (clipTo) {
      const m = clipTo.getBoundingClientRect(); // keep the shapes inside this box
      c2.rect(m.left - c.left, m.top - c.top, m.width, m.height);
    } else {
      c2.rect(0, 0, w, h);
    }
    c2.clip();
    poly(0, 1.12, -1, 0.25); // back layer: larger, 25% opacity, spinning the other way
    poly(1, 1.06, 1, 0.5); // middle layer: 50% opacity, spinning with the front one, out of phase
    poly(2, 0.85, 1, 0.75); // front layer: 75% opacity, a bit smaller than the others
    // the photo fades out at the bottom, so fade the shapes with it instead of letting them show through
    const fy0 = im.top - c.top + im.height * fade0;
    const fy1 = im.top - c.top + im.height * fade1;
    const g = c2.createLinearGradient(0, fy0, 0, fy1);
    g.addColorStop(0, "rgba(0,0,0,0)");
    g.addColorStop(1, "rgba(0,0,0,1)");
    c2.globalCompositeOperation = "destination-out";
    c2.fillStyle = g;
    c2.fillRect(0, fy0, w, h - fy0);
    c2.globalCompositeOperation = "source-over";
    c2.restore();
  }

  // Runs only while the photo is on screen and the tab is visible. The clock advances by frame
  // deltas, so it carries on from where it stopped instead of jumping.
  let running = false;
  let onscreen = true;
  let last = 0;
  let clock = 0;
  function tick(now: number) {
    if (!running) return;
    requestAnimationFrame(tick);
    if (last && now - last < FRAME) return; // too soon: wait for the next frame
    clock += last ? Math.min(now - last, 100) : 0;
    last = now;
    draw(clock);
  }
  function update() {
    const go = !frozen() && onscreen && !document.hidden;
    if (go && !running) {
      running = true;
      last = 0;
      requestAnimationFrame(tick);
    } else if (!go) {
      running = false;
    }
  }
  const onChange = () => {
    arrange();
    if (frozen()) {
      running = false;
      draw(STILL_T);
    } else {
      update();
    }
  };

  draw(frozen() ? STILL_T : 0);
  reduced.addEventListener("change", onChange);
  small.addEventListener("change", onChange);
  addEventListener("resize", () => {
    if (frozen()) draw(STILL_T); // the still frame has to follow the photo
  });
  // the image may load after the first draw, which moves the head
  if (photo instanceof HTMLImageElement && !photo.complete) photo.addEventListener("load", () => (frozen() ? draw(STILL_T) : undefined));
  document.addEventListener("visibilitychange", update);
  listenToPointer();
  if ("IntersectionObserver" in window && cv.parentElement) {
    new IntersectionObserver((entries) => {
      onscreen = entries[0].isIntersecting;
      update();
    }).observe(cv.parentElement);
  }
  update();
}

export function initShapes() {
  document.querySelectorAll<HTMLCanvasElement>("canvas[data-shapes]").forEach(setup);
}
