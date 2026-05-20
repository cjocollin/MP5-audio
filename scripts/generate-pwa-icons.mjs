#!/usr/bin/env node
/**
 * Generate simple MP5 placeholder PWA icons (PNG).
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { encodePng } from "./lib/minimal-png.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "apps/web/public/icons");

const BG = [10, 10, 15];
const ACCENT = [34, 211, 238];
const TEXT = [230, 240, 255];

function drawIcon(size) {
  const pad = Math.round(size * 0.12);
  const inner = size - pad * 2;
  return encodePng(size, size, (x, y) => {
    const inBorder =
      x >= pad && x < pad + inner && y >= pad && y < pad + inner;
    const borderW = Math.max(2, Math.round(size * 0.02));
    const onBorder =
      inBorder &&
      (x < pad + borderW ||
        x >= pad + inner - borderW ||
        y < pad + borderW ||
        y >= pad + inner - borderW);

    const cx = size / 2;
    const cy = size / 2;
    const labelW = size * 0.52;
    const labelH = size * 0.22;
    const inLabel =
      Math.abs(x - cx) < labelW / 2 && Math.abs(y - cy) < labelH / 2;
    const bar = (ox, oy, w, h) =>
      x >= ox && x < ox + w && y >= oy && y < oy + h;

    const s = size / 192;
    const ox = cx - 26 * s;
    const oy = cy - 10 * s;
    const mp5 =
      bar(ox, oy, 14 * s, 20 * s) ||
      bar(ox + 18 * s, oy, 14 * s, 20 * s) ||
      bar(ox + 36 * s, oy, 14 * s, 20 * s) ||
      bar(ox + 54 * s, oy + 8 * s, 14 * s, 12 * s) ||
      bar(ox + 54 * s, oy, 14 * s, 6 * s);

    if (onBorder) return [...ACCENT, 255];
    if (mp5) return [...TEXT, 255];
    if (inLabel && !mp5) return [...BG, 255];
    return [...BG, 255];
  });
}

mkdirSync(outDir, { recursive: true });

const sizes = [192, 512];
for (const size of sizes) {
  const path = join(outDir, `mp5-${size}.png`);
  writeFileSync(path, drawIcon(size));
  console.log(`Wrote ${path}`);
}

const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" role="img" aria-label="MP5">
  <rect width="512" height="512" fill="#0a0a0f"/>
  <rect x="48" y="48" width="416" height="416" fill="none" stroke="#22d3ee" stroke-width="16" rx="32"/>
  <text x="256" y="290" text-anchor="middle" font-family="system-ui,sans-serif" font-size="120" font-weight="700" fill="#e6f0ff">MP5</text>
</svg>
`;
writeFileSync(join(outDir, "mp5-icon.svg"), svg.trim() + "\n");
console.log(`Wrote ${join(outDir, "mp5-icon.svg")}`);
