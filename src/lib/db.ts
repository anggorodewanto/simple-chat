import postgres from "postgres";
import { sslFor } from "@/lib/pg-options";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is not set");
}

// Reuse the pool across hot reloads in dev, otherwise every edit leaks
// connections against Neon's fairly small limit.
const globalForDb = globalThis as unknown as { sql?: ReturnType<typeof postgres> };

export const sql =
  globalForDb.sql ??
  postgres(connectionString, {
    ssl: sslFor(connectionString),
    max: 10,
    idle_timeout: 20,
    connect_timeout: 10,
    onnotice: () => {},
  });

if (process.env.NODE_ENV !== "production") globalForDb.sql = sql;

export type Member = {
  id: string;
  name: string;
  is_admin: boolean;
};

export type MessageRow = {
  id: string;
  body: string;
  created_at: Date;
  member_id: string;
  author: string;
  author_is_admin: boolean;
};

export type Message = {
  id: number;
  body: string;
  createdAt: string;
  memberId: string;
  author: string;
  authorIsAdmin: boolean;
};

export function toMessage(row: MessageRow): Message {
  return {
    id: Number(row.id),
    body: row.body,
    createdAt: row.created_at.toISOString(),
    memberId: row.member_id,
    author: row.author,
    authorIsAdmin: row.author_is_admin,
  };
}

export async function getMember(id: string): Promise<Member | null> {
  const rows = await sql<Member[]>`
    select id, name, is_admin from members where id = ${id}
  `;
  return rows[0] ?? null;
}

export async function getInviteCode(): Promise<string | null> {
  const rows = await sql<{ invite_code: string }[]>`
    select invite_code from room where id = 1
  `;
  return rows[0]?.invite_code ?? null;
}
