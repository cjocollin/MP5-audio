import type { Page } from "@playwright/test";

export const ONBOARDING_DISMISSED = "dismissed";

/** Dismiss welcome onboarding before navigation (must run before page.goto). */
export async function dismissWelcomeOnboarding(page: Page): Promise<void> {
  await page.addInitScript((value) => {
    localStorage.setItem("mp5-onboarding-v1", value);
  }, ONBOARDING_DISMISSED);
}
