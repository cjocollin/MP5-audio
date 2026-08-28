const ONBOARDING_KEY = "mp5-onboarding-v1";
const BETA_NOTICE_KEY = "mp5-beta-notice-v1";

const memory: Record<string, string> = {};

function storage(): Pick<Storage, "getItem" | "setItem" | "removeItem"> {
  if (typeof localStorage !== "undefined") return localStorage;
  return {
    getItem: (k) => memory[k] ?? null,
    setItem: (k, v) => {
      memory[k] = v;
    },
    removeItem: (k) => {
      delete memory[k];
    },
  };
}

export function shouldShowOnboarding(): boolean {
  return storage().getItem(ONBOARDING_KEY) !== "dismissed";
}

export function dismissOnboarding(): void {
  storage().setItem(ONBOARDING_KEY, "dismissed");
}

export function resetOnboardingForTests(): void {
  storage().removeItem(ONBOARDING_KEY);
}

export function shouldShowBetaNotice(): boolean {
  return storage().getItem(BETA_NOTICE_KEY) !== "dismissed";
}

export function dismissBetaNotice(): void {
  storage().setItem(BETA_NOTICE_KEY, "dismissed");
}

export function resetBetaNoticeForTests(): void {
  storage().removeItem(BETA_NOTICE_KEY);
}
