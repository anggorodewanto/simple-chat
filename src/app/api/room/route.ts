import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { getInviteCode, sql } from "@/lib/db";
import { currentMember } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function newCode(): string {
  return randomBytes(4).toString("hex").toUpperCase();
}

export async function GET() {
  const member = await currentMember();
  if (!member?.is_admin) return NextResponse.json({ error: "Admins only." }, { status: 403 });

  const [stats] = await sql<{ members: string; messages: string }[]>`
    select
      (select count(*) from members where not is_admin)::text as members,
      (select count(*) from messages)::text as messages
  `;

  return NextResponse.json({
    inviteCode: await getInviteCode(),
    memberCount: Number(stats.members),
    messageCount: Number(stats.messages),
  });
}

/** Rotates the invite code. Existing members keep their session. */
export async function POST() {
  const member = await currentMember();
  if (!member?.is_admin) return NextResponse.json({ error: "Admins only." }, { status: 403 });

  const [row] = await sql<{ invite_code: string }[]>`
    update room set invite_code = ${newCode()} where id = 1 returning invite_code
  `;

  if (!row) return NextResponse.json({ error: "Room is not set up yet." }, { status: 500 });

  return NextResponse.json({ inviteCode: row.invite_code });
}
