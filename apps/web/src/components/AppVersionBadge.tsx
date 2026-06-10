import { APP_VERSION } from "../generated/appVersion";

/** Subtle build label — version synced from root package.json via Vite plugin. */
export function AppVersionBadge() {
  return (
    <p className="text-[10px] text-gray-600 font-mono" data-testid="app-version">
      MP5 Public Beta · v{APP_VERSION}
    </p>
  );
}
