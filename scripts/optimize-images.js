#!/usr/bin/env node
// Optimizes images in place. Re-runs safely: only overwrites when the
// re-encoded file is actually smaller.
import { glob } from "glob";
import sharp from "sharp";
import { optimize } from "svgo";
import fs from "node:fs/promises";
import path from "node:path";

const IMAGES_DIR = "images";

async function optimizeRaster(file) {
  const ext = path.extname(file).slice(1).toLowerCase();
  const before = await fs.readFile(file);
  const image = sharp(before);

  let after;
  if (ext === "png") after = await image.png({ quality: 80, compressionLevel: 9 }).toBuffer();
  else if (ext === "jpg" || ext === "jpeg") after = await image.jpeg({ quality: 80, mozjpeg: true }).toBuffer();
  else if (ext === "webp") after = await image.webp({ quality: 80 }).toBuffer();
  else return;

  if (after.length < before.length) {
    await fs.writeFile(file, after);
    console.log(`optimized ${file}: ${before.length} -> ${after.length} bytes`);
  }
}

async function optimizeSvg(file) {
  const before = await fs.readFile(file, "utf8");
  const { data: after } = optimize(before, { path: file });

  if (after.length < before.length) {
    await fs.writeFile(file, after);
    console.log(`optimized ${file}: ${before.length} -> ${after.length} bytes`);
  }
}

const files = await glob(`${IMAGES_DIR}/**/*.{png,jpg,jpeg,webp,svg}`);
for (const file of files) {
  if (file.endsWith(".svg")) await optimizeSvg(file);
  else await optimizeRaster(file);
}
