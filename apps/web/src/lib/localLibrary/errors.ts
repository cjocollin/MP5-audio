export class LibraryStorageError extends Error {
  readonly code: "quota" | "unavailable" | "unknown";

  constructor(message: string, code: LibraryStorageError["code"] = "unknown") {
    super(message);
    this.name = "LibraryStorageError";
    this.code = code;
  }
}

export function isQuotaExceededError(err: unknown): boolean {
  if (err instanceof LibraryStorageError && err.code === "quota") return true;
  const name = err instanceof DOMException ? err.name : "";
  return name === "QuotaExceededError";
}
