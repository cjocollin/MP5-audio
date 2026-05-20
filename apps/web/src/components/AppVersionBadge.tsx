/** Subtle build label for deployed demos (injected at build time). */
export function AppVersionBadge() {
  return (
    <p className="text-[10px] text-gray-600 font-mono" data-testid="app-version">
      MP5 {__MP5_BUILD_LABEL__} · v{__MP5_APP_VERSION__}
    </p>
  );
}
