import { expect, type Page } from "@playwright/test";

type LoadDemoOptions = {
  /** Default: load MP5-L demo and play. */
  mode?: "play" | "add" | "stems";
};

/** Load a synthetic demo fixture from the Demo tab (demos are no longer in Settings). */
export async function loadDemoFromSettings(
  page: Page,
  options: LoadDemoOptions = {},
): Promise<void> {
  const mode = options.mode ?? "play";
  await page.getByTestId("app-tab-demo").click();
  await expect(page.getByTestId("demo-fixture-actions")).toBeVisible();

  const testId =
    mode === "stems"
      ? "demo-load-stems-demo"
      : mode === "add"
        ? "demo-load-demo-add"
        : "demo-load-demo-play";

  await page.getByTestId(testId).click();
  await expect(page.getByTestId("app-tab-player")).toHaveAttribute("aria-current", "page");
  await expect(page.getByTestId("playlist-item").first()).toBeVisible({ timeout: 20_000 });
}
