const ONBOARDING_KEY = "mp5-onboarding-v1";

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
