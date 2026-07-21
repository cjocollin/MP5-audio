#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { cp, mkdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium } from "@playwright/test";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sourceMark = join(repoRoot, "apps", "web", "public", "brand", "mp5-brand-icon.svg");
const frameSize = 256;
const crop = { x: 0, y: 0, size: 1254 };

const v2MotionFrames = [
  { short: 1, medium: 1, tall: 1, accent: 1 },
  { short: 1.214, medium: 0.98, tall: 1.048, accent: 0.834 },
  { short: 1.272, medium: 0.888, tall: 1.041, accent: 0.841 },
  { short: 1.16, medium: 0.75, tall: 0.98, accent: 1.02 },
  { short: 1.021, medium: 0.665, tall: 0.932, accent: 1.182 },
  { short: 1.006, medium: 0.72, tall: 0.962, accent: 1.146 },
  { short: 1.12, medium: 0.9, tall: 1.06, accent: 0.92 },
  { short: 1.218, medium: 1.093, tall: 1.15, accent: 0.705 },
  { short: 1.159, medium: 1.185, tall: 1.158, accent: 0.698 },
  { short: 0.96, medium: 1.15, tall: 1.08, accent: 0.9 },
  { short: 0.788, medium: 1.062, tall: 0.989, accent: 1.119 },
  { short: 0.802, medium: 1.007, tall: 0.96, accent: 1.155 },
];

function refineCyclicMotionFrames(frames) {
  const properties = ["short", "medium", "tall", "accent"];
  const refined = [];

  for (let index = 0; index < frames.length; index += 1) {
    const previous = frames[(index - 1 + frames.length) % frames.length];
    const current = frames[index];
    const next = frames[(index + 1) % frames.length];
    const afterNext = frames[(index + 2) % frames.length];
    const midpoint = Object.fromEntries(
      properties.map((property) => [
        property,
        (-previous[property] + 9 * current[property] + 9 * next[property] - afterNext[property]) / 16,
      ]),
    );

    refined.push(current, midpoint);
  }

  return refined;
}

function createDarkScaleFrames(frameCount) {
  return Array.from({ length: frameCount }, (_, index) => {
    const phase = (2 * Math.PI * index) / frameCount;
    return 1 + 0.07 * Math.sin(2 * phase);
  });
}

const variants = {
  v1: {
    outputFolder: "signal-sprites-v1",
    version: 1,
    fps: 10,
    animationName: "signalPulse",
    title: "MP5 signal pulse",
    frameDescription: "a looping signal pulse",
    scaleAnchor: "center",
    motionFrames: [
      { short: 1, medium: 1, tall: 1, accent: 1 },
      { short: 0.96, medium: 1, tall: 1, accent: 1 },
      { short: 1.18, medium: 0.98, tall: 1, accent: 1 },
      { short: 1.08, medium: 1.14, tall: 1, accent: 1 },
      { short: 0.99, medium: 1.06, tall: 0.99, accent: 1 },
      { short: 1, medium: 0.995, tall: 1.06, accent: 1 },
      { short: 1, medium: 1, tall: 1.03, accent: 0.96 },
      { short: 1, medium: 1, tall: 0.998, accent: 1.18 },
      { short: 1, medium: 1, tall: 1, accent: 1.08 },
      { short: 1, medium: 1, tall: 1, accent: 0.99 },
      { short: 1, medium: 1, tall: 1, accent: 0.995 },
      { short: 1, medium: 1, tall: 1, accent: 0.998 },
    ],
  },
  v2: {
    outputFolder: "signal-sprites-v2",
    version: 2,
    fps: 12,
    animationName: "musicPlaying",
    title: "MP5 music-playing equalizer",
    frameDescription: "an active music equalizer",
    scaleAnchor: "bottom",
    motionFrames: v2MotionFrames,
    frozen: true,
  },
  v3: {
    outputFolder: "signal-sprites-v3",
    version: 3,
    fps: 24,
    animationName: "smoothMusicPlaying",
    title: "MP5 smooth music equalizer",
    frameDescription: "an active music equalizer with smoothly flowing bar motion",
    scaleAnchor: "bottom",
    motionFrames: refineCyclicMotionFrames(v2MotionFrames),
    frozen: true,
  },
  v4: {
    outputFolder: "signal-sprites-v4",
    version: 4,
    fps: 24,
    animationName: "fullMusicPlaying",
    title: "MP5 full music equalizer",
    frameDescription: "an active music equalizer with smooth motion across every bar",
    scaleAnchor: "bottom",
    motionFrames: refineCyclicMotionFrames(v2MotionFrames),
    darkScaleAnchorY: 988,
    darkScales: createDarkScaleFrames(24),
  },
};

const variantName = process.argv.find((argument) => argument.startsWith("--variant="))?.split("=")[1] ?? "v4";
const variant = variants[variantName];

if (!variant) {
  throw new Error(`Unknown variant "${variantName}". Choose one of: ${Object.keys(variants).join(", ")}`);
}

const outputDir = join(repoRoot, "apps", "web", "public", "brand", variant.outputFolder);
const framesDir = join(outputDir, "frames");
const frameCount = variant.motionFrames.length;
const fps = variant.fps;
const frameDurationMs = Number((1000 / fps).toFixed(3));

if (!existsSync(sourceMark)) {
  throw new Error(`Missing source signal mark: ${sourceMark}`);
}

if (variantName === "v1") {
  const legacyDir = join(repoRoot, "apps", "web", "public", "brand", "signal-sprites");
  if (!existsSync(legacyDir)) {
    throw new Error(`Missing legacy signal-sprite pack: ${legacyDir}`);
  }

  await mkdir(outputDir, { recursive: true });
  await cp(legacyDir, outputDir, { recursive: true, force: true });
  console.log(`Saved the legacy signal animation byte-for-byte as v1 in ${outputDir}`);
  process.exit(0);
}

if (variant.frozen && existsSync(outputDir)) {
  console.log(`Kept the frozen ${variantName} sprite pack unchanged in ${outputDir}`);
  process.exit(0);
}

await mkdir(framesDir, { recursive: true });

const gradients = `
  <defs>
    <linearGradient id="brightPurple" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#9859d8"/>
      <stop offset="0.5" stop-color="#9f63df"/>
      <stop offset="1" stop-color="#9759d5"/>
    </linearGradient>
    <linearGradient id="deepPurple" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#6947b7"/>
      <stop offset="0.5" stop-color="#6d4bbc"/>
      <stop offset="1" stop-color="#6846b4"/>
    </linearGradient>
    <linearGradient id="cyan" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#42d0d7"/>
      <stop offset="0.5" stop-color="#45d4da"/>
      <stop offset="1" stop-color="#3fced5"/>
    </linearGradient>
  </defs>`;

function round(value) {
  return Number(value.toFixed(3));
}

const baseStepPath = "M676 231h67c12.15 0 22 9.85 22 22v222c0 12.15 9.85 22 22 22h67c12.15 0 22 9.85 22 22v447c0 12.15-9.85 22-22 22h-49c-12.15 0-22-9.85-22-22V657c0-23.75-19.25-43-43-43h-64c-12.15 0-22-9.85-22-22V253c0-12.15 9.85-22 22-22Z";

function scaledRect({ x, y, width, height, rx, fill, id }, scale, scaleAnchor, idSuffix = "") {
  const center = y + height / 2;
  const nextHeight = height * scale;
  const nextY = scaleAnchor === "bottom" ? y + height - nextHeight : center - nextHeight / 2;
  const nextRx = Math.min(rx, nextHeight / 2);
  return `<rect id="${id}${idSuffix}" x="${x}" y="${round(nextY)}" width="${width}" height="${round(nextHeight)}" rx="${round(nextRx)}" fill="url(#${fill})"/>`;
}

function darkStepTransform(index) {
  const scale = variant.darkScales?.[index] ?? 1;
  if (Math.abs(scale - 1) < 1e-9) {
    return "";
  }

  const anchorY = variant.darkScaleAnchorY;
  const serializedScale = Number(scale.toFixed(6));
  const translateY = Number((anchorY * (1 - serializedScale)).toFixed(6));
  return ` transform="matrix(1 0 0 ${serializedScale} 0 ${translateY})"`;
}

function frameShapes(index, idSuffix = "") {
  const motion = variant.motionFrames[index];
  const short = scaledRect(
    { id: "signal-short", x: 267, y: 520, width: 68, height: 214, rx: 34, fill: "brightPurple" },
    motion.short,
    variant.scaleAnchor,
    idSuffix,
  );
  const medium = scaledRect(
    { id: "signal-medium", x: 367, y: 431, width: 94, height: 391, rx: 22, fill: "brightPurple" },
    motion.medium,
    variant.scaleAnchor,
    idSuffix,
  );
  const tall = scaledRect(
    { id: "signal-tall", x: 503, y: 325, width: 103, height: 606, rx: 23, fill: "brightPurple" },
    motion.tall,
    variant.scaleAnchor,
    idSuffix,
  );
  const accent = scaledRect(
    { id: "signal-accent", x: 918, y: 533, width: 68, height: 193, rx: 34, fill: "cyan" },
    motion.accent,
    variant.scaleAnchor,
    idSuffix,
  );

  return `
    <g id="signal-mark-frame-${String(index + 1).padStart(2, "0")}${idSuffix}">
      ${short}
      ${medium}
      ${tall}
      <path id="signal-step${idSuffix}" fill="url(#deepPurple)" d="${baseStepPath}"${darkStepTransform(index)}/>
      ${accent}
    </g>`;
}

function frameSvg(index) {
  const number = String(index + 1).padStart(2, "0");
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${frameSize}" height="${frameSize}" viewBox="${crop.x} ${crop.y} ${crop.size} ${crop.size}" role="img" aria-labelledby="title desc">
  <title id="title">${variant.title} animation frame ${number}</title>
  <desc id="desc">Frame ${number} of ${variant.frameDescription} on a transparent background.</desc>
  ${gradients}
  ${frameShapes(index)}
</svg>
`;
}

function stripSvg() {
  const frames = Array.from({ length: frameCount }, (_, index) => {
    const x = index * frameSize;
    const idSuffix = `-strip-${String(index + 1).padStart(2, "0")}`;
    return `
  <svg x="${x}" y="0" width="${frameSize}" height="${frameSize}" viewBox="${crop.x} ${crop.y} ${crop.size} ${crop.size}" aria-label="Frame ${index + 1}">
    ${frameShapes(index, idSuffix)}
  </svg>`;
  }).join("");

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${frameSize * frameCount}" height="${frameSize}" viewBox="0 0 ${frameSize * frameCount} ${frameSize}" role="img" aria-labelledby="title desc">
  <title id="title">${variant.title} sprite sheet</title>
  <desc id="desc">${frameCount} transparent animation frames in one horizontal row.</desc>
  ${gradients}
  ${frames}
</svg>
`;
}

const frameNames = [];
for (let index = 0; index < frameCount; index += 1) {
  const number = String(index + 1).padStart(2, "0");
  const filename = `signal-mark-${number}.svg`;
  frameNames.push(filename);
  await writeFile(join(framesDir, filename), frameSvg(index), "utf8");
}

await writeFile(join(outputDir, "signal-mark-spritesheet.svg"), stripSvg(), "utf8");

const metadata = {
  meta: {
    app: "MP5 Audio",
    version: variant.version,
    variant: variantName,
    image: "signal-mark-spritesheet.png",
    vectorImage: "signal-mark-spritesheet.svg",
    format: "RGBA8888",
    size: { width: frameSize * frameCount, height: frameSize },
    frameSize: { width: frameSize, height: frameSize },
    frameCount,
    fps,
    durationMs: Number(((frameCount * 1000) / fps).toFixed(3)),
    loop: true,
    anchor: { x: 0.5, y: 0.5 },
    ...(variant.darkScales ? {
      darkMotion: {
        type: "scaleY",
        anchorY: variant.darkScaleAnchorY,
        minimumScale: round(Math.min(...variant.darkScales)),
        maximumScale: round(Math.max(...variant.darkScales)),
      },
    } : {}),
  },
  frames: Object.fromEntries(
    Array.from({ length: frameCount }, (_, index) => {
      const number = String(index + 1).padStart(2, "0");
      return [
        `signal-mark-${number}.png`,
        {
          frame: { x: index * frameSize, y: 0, width: frameSize, height: frameSize },
          rotated: false,
          trimmed: false,
          sourceSize: { width: frameSize, height: frameSize },
          durationMs: frameDurationMs,
          anchor: { x: 0.5, y: 0.5 },
        },
      ];
    }),
  ),
  animations: {
    [variant.animationName]: Array.from({ length: frameCount }, (_, index) => `signal-mark-${String(index + 1).padStart(2, "0")}.png`),
  },
};

await writeFile(join(outputDir, "signal-mark-sprites.json"), `${JSON.stringify(metadata, null, 2)}\n`, "utf8");

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: frameSize, height: frameSize } });

try {
  for (const filename of frameNames) {
    const svgPath = join(framesDir, filename);
    const pngPath = svgPath.replace(/\.svg$/u, ".png");
    await page.goto(pathToFileURL(svgPath).href, { waitUntil: "load" });
    await page.screenshot({ path: pngPath, omitBackground: true });
  }
} finally {
  await page.close();
  await browser.close();
}

function runFfmpeg(args) {
  const result = spawnSync("ffmpeg", args, { stdio: "inherit" });
  if (result.status !== 0) {
    throw new Error(`ffmpeg failed with exit code ${result.status ?? "unknown"}`);
  }
}

const pngPattern = join(framesDir, "signal-mark-%02d.png");
runFfmpeg([
  "-hide_banner",
  "-loglevel",
  "error",
  "-y",
  "-framerate",
  String(fps),
  "-start_number",
  "1",
  "-i",
  pngPattern,
  "-vf",
  `tile=${frameCount}x1`,
  "-frames:v",
  "1",
  "-pix_fmt",
  "rgba",
  join(outputDir, "signal-mark-spritesheet.png"),
]);

runFfmpeg([
  "-hide_banner",
  "-loglevel",
  "error",
  "-y",
  "-framerate",
  String(fps),
  "-start_number",
  "1",
  "-i",
  pngPattern,
  "-c:v",
  "libwebp_anim",
  "-lossless",
  "1",
  "-loop",
  "0",
  "-an",
  join(outputDir, "signal-mark-preview.webp"),
]);

console.log(`Generated ${variantName} (${frameCount} frames at ${fps} fps) in ${outputDir}`);
