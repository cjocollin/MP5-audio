const STORAGE_KEY = "mp5-landing-about-expanded";

export function loadLandingAboutExpanded(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

export function saveLandingAboutExpanded(expanded: boolean): void {
  try {
    localStorage.setItem(STORAGE_KEY, expanded ? "1" : "0");
  } catch {
    /* private mode / blocked storage */
  }
}
