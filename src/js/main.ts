import { initConstellation } from "./constellation";
import { initShapes } from "./shapes";

// Browsers block <use href="other-origin/icons.svg#id">, so the sprite is fetched and inlined, turning every
// reference into a same-document <use href="#icon-x">. Its URL is resolved from this script's own, so it works
// from the shared assets host or the local /assets mount.
const scriptSrc = (document.currentScript as HTMLScriptElement | null)?.src;

const SPRITE_KEY = "icon-sprite";

async function injectIconSprite() {
  if (!scriptSrc) return;

  const spriteUrl = new URL("../images/icons.svg", scriptSrc).href;

  try {
    const res = await fetch(spriteUrl);
    if (!res.ok) return;
    const markup = await res.text();

    // The layouts inject the cached sprite before first paint; here it is only added the first time or refreshed if changed.
    let holder = document.getElementById("icon-sprite");
    if (!holder) {
      holder = document.createElement("div");
      holder.id = "icon-sprite";
      holder.hidden = true;
      holder.innerHTML = markup;
      document.body.prepend(holder);
    }
    let cached: string | null = null;
    try {
      cached = localStorage.getItem(SPRITE_KEY);
    } catch {
      // storage blocked: the icons still appear, a moment later
    }
    if (cached !== markup) {
      holder.innerHTML = markup;
      try {
        localStorage.setItem(SPRITE_KEY, markup);
      } catch {}
    }
  } catch {
    // no icons; nothing else depends on this
  }
}

injectIconSprite();

// Theme toggle: auto -> light -> dark. Each layout's inline <head> script applies the saved choice before first
// paint; this handles the button. "auto" removes data-theme so prefers-color-scheme decides.
// The choice lives in a cookie on .omgmog.net, since localStorage is per origin and the subdomains would each
// remember their own (on localhost a domainless cookie is shared across ports).
const THEMES = ["auto", "light", "dark"];

const cookieAttrs = () => {
  const shared = /(^|\.)omgmog\.net$/.test(location.hostname) ? "; domain=.omgmog.net" : "";
  const secure = location.protocol === "https:" ? "; Secure" : "";
  return `; path=/; SameSite=Lax${shared}${secure}`;
};

function readTheme(): string | null {
  const match = document.cookie.match(/(?:^|; )theme=(light|dark|auto)/);
  if (match) return match[1];
  try {
    return localStorage.getItem("theme"); // from before the cookie existed
  } catch {
    return null;
  }
}

function saveTheme(theme: string) {
  // "auto" is stored too, so a stale localStorage value on another subdomain can't override it
  document.cookie = `theme=${theme}; max-age=31536000${cookieAttrs()}`;
  try {
    localStorage.setItem("theme", theme);
  } catch {
    // storage blocked: the cookie still carries the choice
  }
}

function initThemeToggle() {
  const button = document.querySelector<HTMLButtonElement>(".theme-toggle");
  if (!button) return;

  const saved = readTheme();
  let current = saved && THEMES.includes(saved) ? saved : "auto";

  const apply = (theme: string) => {
    current = theme;
    if (theme === "auto") document.documentElement.removeAttribute("data-theme");
    else document.documentElement.setAttribute("data-theme", theme);
    button.setAttribute("aria-label", `Theme: ${theme}`);
    saveTheme(theme);
  };

  button.setAttribute("aria-label", `Theme: ${current}`);
  button.addEventListener("click", () => {
    apply(THEMES[(THEMES.indexOf(current) + 1) % THEMES.length]);
  });
}

initThemeToggle();

// Sticky header and sub-nav (the CSS is at the end of _layout.css): measures the header into --head-h, and header
// plus sub-nav into --stick-h for scroll-padding. The CSS has fallbacks for before this runs.
function initStickyChrome() {
  const root = document.documentElement;
  const bar = document.querySelector<HTMLElement>(".site-bar");
  if (!bar) return;
  const subnav = document.querySelector<HTMLElement>(".subnav");
  const small = matchMedia("(max-width: 899px)");

  const measure = () => {
    if (!small.matches) {
      root.style.removeProperty("--head-h");
      root.style.removeProperty("--stick-h");
      return;
    }
    const head = (parseFloat(getComputedStyle(bar).top) || 0) + bar.offsetHeight;
    root.style.setProperty("--head-h", `${head}px`);
    root.style.setProperty("--stick-h", `${head + (subnav ? subnav.offsetHeight : 0)}px`);
  };

  new ResizeObserver(measure).observe(bar);
  if (subnav) new ResizeObserver(measure).observe(subnav);
  small.addEventListener("change", measure);
  measure();

  // Once the page has scrolled, the header is stuck: the CSS gives the panel's top edge a shadow over the content.
  // On small screens that's any scroll; on desktop only the sub-nav sticks, once its top reaches the window's.
  const onScroll = () => {
    const stuck = small.matches ? scrollY > 0 : !!subnav && subnav.getBoundingClientRect().top <= 0.5;
    root.toggleAttribute("data-scrolled", stuck);
  };
  addEventListener("scroll", onScroll, { passive: true });
  onScroll();
}

initStickyChrome();

initShapes();
initConstellation();

// Click-to-play embeds: figure.iframe > .placeholder[data-src] (posts/figure.html) swaps in the real iframe when clicked.
function initLazyIframes() {
  const play = (el: HTMLElement) => {
    const iframe = document.createElement("iframe");
    iframe.className = el.className.replace("placeholder", "").trim();
    iframe.width = String(el.clientWidth || parseInt(el.getAttribute("width") ?? "", 10) || 600);
    iframe.height = String(el.clientHeight || parseInt(el.getAttribute("height") ?? "", 10) || 350);
    iframe.allowFullscreen = true;
    iframe.allow =
      "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture";
    // The click is the go-ahead, so ask the player to start (YouTube and Vimeo read autoplay=1).
    const src = new URL(el.dataset.src ?? "", location.href);
    src.searchParams.set("autoplay", "1");
    iframe.src = src.href;
    iframe.title = el.getAttribute("aria-label")?.replace(/^Play: /, "") ?? "Embedded video";
    el.replaceWith(iframe);
    iframe.focus();
  };

  // YouTube answers a missing thumbnail with a grey 120x90 placeholder: drop it and show the dark background instead.
  const dropGrey = (img: HTMLImageElement) => {
    if (img.naturalWidth === 120 && img.naturalHeight === 90) img.remove();
  };

  document.querySelectorAll<HTMLElement>(".iframe [data-src]").forEach((el) => {
    el.querySelectorAll("img").forEach((img) => {
      if (img.complete) dropGrey(img);
      else img.addEventListener("load", () => dropGrey(img));
    });
    el.tabIndex = 0;
    el.setAttribute("role", "button");
    el.setAttribute("aria-label", "Play video");
    el.addEventListener("click", () => play(el));
    el.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        play(el);
      }
    });
  });
}

initLazyIframes();
