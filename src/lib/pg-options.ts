import type { Options } from "postgres";

/**
 * Neon always needs TLS, but a local Postgres has none. Honour `sslmode` from
 * the connection string so the same code works in both places.
 */
export function sslFor(connectionString: string): Options<{}>["ssl"] {
  const mode = /[?&]sslmode=([^&]+)/.exec(connectionString)?.[1];
  if (mode === "disable" || mode === "allow") return false;
  if (mode === "verify-full" || mode === "verify-ca") return "verify-full";
  return "require";
}
