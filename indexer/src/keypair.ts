import { readFileSync } from "node:fs";

/**
 * Resolve a Solana secret key for the optional keeper functions.
 *
 * Order: a JSON-array or base64 env var, then a file-path env var, then a
 * default file path (local dev). Returns null when none is available, so a
 * deployed API server (which ships no keys) simply skips the keeper instead
 * of crashing.
 */
export function resolveSecretKey(opts: {
  keyEnv?: string;
  pathEnv?: string;
  defaultPath?: string;
}): Uint8Array | null {
  const { keyEnv, pathEnv, defaultPath } = opts;
  try {
    const inline = keyEnv ? process.env[keyEnv]?.trim() : undefined;
    if (inline) {
      return inline.startsWith("[")
        ? Uint8Array.from(JSON.parse(inline))
        : Uint8Array.from(Buffer.from(inline, "base64"));
    }
    const path = (pathEnv && process.env[pathEnv]) || defaultPath;
    if (path) return Uint8Array.from(JSON.parse(readFileSync(path, "utf8")));
  } catch {}
  return null;
}
