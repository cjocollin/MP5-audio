#!/usr/bin/env node
/**
 * HTTP smoke checks against production preview (vite preview).
 */
const base = process.env.MP5_PREVIEW_URL ?? "http://127.0.0.1:4173";

async function get(path) {
  const url = `${base}${path}`;
  const res = await fetch(url);
  return { url, res, ok: res.ok, status: res.status };
}

let failed = false;

function pass(msg) {
  console.log(`  ✓ ${msg}`);
}
function fail(msg) {
  console.error(`  ✗ ${msg}`);
  failed = true;
}

console.log(`\n=== Production preview smoke (${base}) ===\n`);

try {
  const index = await get("/");
  if (index.ok) pass(`GET / → ${index.status}`);
  else fail(`GET / → ${index.status}`);

  const manifest = await get("/manifest.webmanifest");
  if (manifest.ok) {
    pass(`GET /manifest.webmanifest → ${manifest.status}`);
    const json = await manifest.res.json();
    if (json.name === "MP5 Player") pass('manifest name "MP5 Player"');
    else fail(`unexpected manifest name: ${json.name}`);
  } else fail(`manifest → ${manifest.status}`);

  const sw = await get("/sw.js");
  if (!sw.ok) fail(`service worker → ${sw.status}`);
  else {
    pass(`GET /sw.js → ${sw.status}`);
    const precache = await sw.res.text();
    const wasmUrls = [
      ...precache.matchAll(/url:"([^"]+\.wasm)"/g),
    ].map((m) => m[1]);
    const mp5Wasm = wasmUrls.find((u) => u.includes("mp5_codec"));
    const ffmpegWasm = wasmUrls.find((u) => u.includes("ffmpeg-core"));
    if (mp5Wasm) pass(`precache lists MP5 WASM: /${mp5Wasm}`);
    else fail("service worker precache missing mp5_codec wasm");

    if (ffmpegWasm) pass(`precache lists FFmpeg WASM: /${ffmpegWasm}`);
    else fail("service worker precache missing ffmpeg-core wasm");

    for (const rel of [mp5Wasm, ffmpegWasm].filter(Boolean)) {
      const path = rel.startsWith("/") ? rel : `/${rel}`;
      const asset = await get(path);
      if (asset.ok) pass(`GET ${path} → ${asset.status}`);
      else fail(`${path} → ${asset.status}`);
    }
  }

  const icon = await get("/icons/mp5-192.png");
  if (icon.ok) pass(`GET /icons/mp5-192.png → ${icon.status}`);
  else fail(`icon → ${icon.status}`);

  const fixture = await get("/fixtures/demo_mp5l_v3_tone.mp5");
  if (fixture.ok) pass(`GET demo fixture → ${fixture.status}`);
  else
    console.log(
      `  ⚠ demo fixture → ${fixture.status} (optional if fixtures:generate was skipped before build)`,
    );

  const html = await index.res.text();
  const scriptMatch = html.match(/src="(\/assets\/index-[^"]+\.js)"/);
  if (scriptMatch) {
    const bundle = await get(scriptMatch[1]);
    if (bundle.ok) pass(`GET main bundle → ${bundle.status}`);
    else fail(`main bundle → ${bundle.status}`);
  } else fail("index.html has no main JS bundle");
} catch (e) {
  fail(e instanceof Error ? e.message : String(e));
  console.error("\nIs preview running? Start with: pnpm demo:prod\n");
}

if (failed) process.exit(1);
console.log("\nProduction preview smoke passed.\n");
