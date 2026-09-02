#!/usr/bin/env node
// Applies db/schema.sql and makes sure the singleton room row exists.
import { readFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import postgres from "postgres";

/** Mirrors src/lib/pg-options.ts: Neon needs TLS, a local Postgres has none. */
function sslFor(connectionString) {
  const mode = /[?&]sslmode=([^&]+)/.exec(connectionString)?.[1];
  if (mode === "disable" || mode === "allow") return false;
  if (mode === "verify-full" || mode === "verify-ca") return "verify-full";
  return "require";
}

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const url = process.env.DATABASE_URL;

if (!url) {
  console.error("DATABASE_URL is not set.");
  process.exit(1);
}

const sql = postgres(url, { ssl: sslFor(url), max: 1, onnotice: () => {} });

try {
  await sql.unsafe(readFileSync(join(root, "db/schema.sql"), "utf8"));

  const code = randomBytes(4).toString("hex").toUpperCase();
  const [room] = await sql`
    insert into room (id, invite_code) values (1, ${code})
    on conflict (id) do nothing
    returning invite_code
  `;

  console.log("Migration complete.");
  if (room) console.log(`Room created. Invite code: ${room.invite_code}`);
  else console.log("Room already existed; invite code left unchanged.");
} catch (err) {
  console.error("Migration failed:", err);
  process.exitCode = 1;
} finally {
  await sql.end();
}
