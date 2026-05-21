/**
 * Demo tone URL. Dev/preview: Vite fixtures middleware.
 * Production dist: copied into `dist/fixtures/` at build time when `test-fixtures/` exists.
 * Missing fixture is OK — UI fails calmly; users can drop their own `.mp5`.
 */
export const DEMO_MP5L_FIXTURE_URL = "/fixtures/demo_mp5l_v3_tone.mp5";
export const DEMO_MP5L_FIXTURE_NAME = "demo_mp5l_v3_tone.mp5";
export const DEMO_STEMS_FIXTURE_URL = "/fixtures/demo_mp5l_v3_stems.mp5";
export const DEMO_STEMS_FIXTURE_NAME = "demo_mp5l_v3_stems.mp5";

async function fetchFixture(url: string, name: string): Promise<File | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const buf = await res.arrayBuffer();
    return new File([buf], name, { type: "application/octet-stream" });
  } catch {
    return null;
  }
}

export async function fetchDemoMp5lFixture(): Promise<File | null> {
  return fetchFixture(DEMO_MP5L_FIXTURE_URL, DEMO_MP5L_FIXTURE_NAME);
}

export async function fetchDemoStemsFixture(): Promise<File | null> {
  return fetchFixture(DEMO_STEMS_FIXTURE_URL, DEMO_STEMS_FIXTURE_NAME);
}
