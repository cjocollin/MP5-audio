import type { Page } from "@playwright/test";

export const ONBOARDING_DISMISSED = "dismissed";

/**
 * Pre-dismiss WelcomeOnboarding before page.goto so e2e flows start on the
 * player workspace (Welcome mounts on first visit when this key is unset).
 */
export async function dismissWelcomeOnboarding(page: Page): Promise<void> {
  await page.addInitScript((value) => {
    localStorage.setItem("mp5-onboarding-v1", value);
  }, ONBOARDING_DISMISSED);
}
