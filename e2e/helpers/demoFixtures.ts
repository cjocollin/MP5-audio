import { expect, type Page } from "@playwright/test";

type LoadDemoOptions = {
  /** Default: load MP5-L demo and play. */
  mode?: "play" | "add" | "stems";
};

/** Load a synthetic demo fixture from Settings (demos are no longer auto-seeded). */
export async function loadDemoFromSettings(
  page: Page,
  options: LoadDemoOptions = {},
): Promise<void> {
  const mode = options.mode ?? "play";
  await page.getByTestId("app-tab-settings").click();
  await expect(page.getByTestId("demo-fixture-actions")).toBeVisible();

  const testId =
    mode === "stems"
      ? "settings-load-stems-demo"
      : mode === "add"
        ? "settings-load-demo-add"
        : "settings-load-demo-play";

  await page.getByTestId(testId).click();
  await expect(page.getByTestId("app-tab-player")).toHaveAttribute("aria-current", "page");
  await expect(page.getByTestId("playlist-item").first()).toBeVisible({ timeout: 20_000 });
}
