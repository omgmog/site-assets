#!/usr/bin/env node
// Builds images/icons.svg from lucide-static source SVGs, plus any custom
// (non-Lucide) icons dropped in CUSTOM_DIR. Re-run whenever the ICONS table
// or the custom icons change; it always regenerates the whole file.
import fs from "node:fs/promises";
import path from "node:path";
import { glob } from "glob";

const LUCIDE_DIR = "node_modules/lucide-static/icons";
const CUSTOM_DIR = "src/icons";
const OUT_FILE = "images/icons.svg";

// symbol id -> lucide icon name (see table in the sprite request for the
// "used for" mapping; several ids intentionally share the same icon).
const ICONS = [
  ["icon-compass", "compass"],
  ["icon-archive", "archive"],
  ["icon-clock", "clock"],
  ["icon-rss", "rss"],
  ["icon-layers", "layers"],
  ["icon-link", "link"],
  ["icon-search", "search"],
  ["icon-smartphone", "smartphone"],
  ["icon-watch", "watch"],
  ["icon-laptop", "laptop"],
  ["icon-printer", "printer"],
  ["icon-headphones", "headphones"],
  ["icon-pen-line", "pen-line"],
  ["icon-rocket", "rocket"],
  ["icon-play", "play"],
  ["icon-message-square", "message-square"],
  ["icon-arrow-left", "arrow-left"],
  ["icon-arrow-right", "arrow-right"],
  ["icon-arrow-up-right", "arrow-up-right"],
  ["icon-cat-blog", "notebook-pen"],
  ["icon-cat-design", "pen-tool"],
  ["icon-cat-tinkering", "wrench"],
  ["icon-cat-web", "code-xml"],
  ["icon-cat-data", "flask-conical"],
  ["icon-cat-reviews", "package-open"],
  ["icon-cat-games", "gamepad-2"],
  ["icon-cat-tools", "terminal"],
  ["icon-cat-life", "coffee"],
  ["icon-cat-lwal", "link"],
  ["icon-pen-tool", "pen-tool"],
  ["icon-code-xml", "code-xml"],
  ["icon-accessibility", "accessibility"],
  ["icon-users", "users"],
  ["icon-user", "user"],
  ["icon-bell", "bell"],
  ["icon-settings", "settings"],
  ["icon-sliders-horizontal", "sliders-horizontal"],
  ["icon-log-out", "log-out"],
  ["icon-trash-2", "trash-2"],
  ["icon-mail", "mail"],
  ["icon-briefcase", "briefcase"],
  ["icon-reply", "reply"],
  ["icon-heart", "heart"],
  ["icon-repeat-2", "repeat-2"],
  ["icon-bookmark", "bookmark"],
  ["icon-megaphone", "megaphone"],
  ["icon-message-circle", "message-circle"],
  ["icon-rotate-cw", "rotate-cw"],
  ["icon-file-text", "file-text"],
  ["icon-archive-restore", "archive-restore"],
  ["icon-history", "history"],
  ["icon-map-pin", "map-pin"],
  ["icon-share", "share"],
  ["icon-share-2", "share-2"],
  ["icon-glasses", "glasses"],
  ["icon-presentation", "presentation"],
  ["icon-music", "music"],
  ["icon-disc-3", "disc-3"],
  ["icon-rectangle-goggles", "rectangle-goggles"],
  ["icon-sun", "sun"],
  ["icon-moon", "moon"],
  ["icon-sun-moon", "sun-moon"],
];

// Same paths as "play", filled instead of stroked (video embed play button).
const FILLED = [["icon-play-filled", "play"]];

function splitTag(raw, tagStart = "<svg") {
  const open = raw.indexOf(">", raw.indexOf(tagStart));
  const close = raw.lastIndexOf("</svg>");
  const openTag = raw.slice(raw.indexOf(tagStart), open + 1);
  const inner = raw
    .slice(open + 1, close)
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .join("\n    ");
  return { openTag, inner };
}

async function extractInner(iconName) {
  const raw = await fs.readFile(path.join(LUCIDE_DIR, `${iconName}.svg`), "utf8");
  return splitTag(raw).inner;
}

function symbol(id, inner, { filled = false, viewBox = "0 0 24 24" } = {}) {
  const fillAttr = filled ? 'fill="currentColor"' : 'fill="none"';
  return `  <symbol id="${id}" viewBox="${viewBox}" ${fillAttr} stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    ${inner}
  </symbol>`;
}

// Custom icons keep whatever fill/colours they're authored with (e.g. brand
// logos) instead of being forced onto the Lucide stroke/currentColor style.
function customSymbol(id, openTag, inner) {
  const viewBoxMatch = openTag.match(/viewBox="([^"]+)"/);
  const viewBox = viewBoxMatch ? viewBoxMatch[1] : "0 0 24 24";
  return `  <symbol id="${id}" viewBox="${viewBox}">
    ${inner}
  </symbol>`;
}

async function main() {
  const symbols = [];

  for (const [id, iconName] of ICONS) {
    symbols.push(symbol(id, await extractInner(iconName)));
  }
  for (const [id, iconName] of FILLED) {
    symbols.push(symbol(id, await extractInner(iconName), { filled: true }));
  }

  const customFiles = await glob(`${CUSTOM_DIR}/*.svg`);
  for (const file of customFiles.sort()) {
    const id = `icon-${path.basename(file, ".svg")}`;
    const raw = await fs.readFile(file, "utf8");
    const { openTag, inner } = splitTag(raw);
    symbols.push(customSymbol(id, openTag, inner));
  }

  const sprite = `<svg xmlns="http://www.w3.org/2000/svg">
${symbols.join("\n")}
</svg>
`;

  await fs.writeFile(OUT_FILE, sprite);
  console.log(`Wrote ${OUT_FILE} (${symbols.length} symbols)`);
}

main();
