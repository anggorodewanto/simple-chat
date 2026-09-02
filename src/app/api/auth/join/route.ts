import { NextResponse } from "next/server";
import { getInviteCode, sql, type Member } from "@/lib/db";
import { createSession } from "@/lib/session";
import { NAME_MAX, clientIp, normalizeInviteCode, normalizeName, rateLimit } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const ip = clientIp(request);
  if (!rateLimit(`join:${ip}`, 20, 10 * 60 * 1000)) {
    return NextResponse.json({ error: "Too many attempts. Try again later." }, { status: 429 });
  }

  const body = await request.json().catch(() => null);
  const code = normalizeInviteCode(typeof body?.code === "string" ? body.code : "");
  const name = normalizeName(typeof body?.name === "string" ? body.name : "");

  if (!code) return NextResponse.json({ error: "Invite code is required." }, { status: 400 });
  if (!name) return NextResponse.json({ error: "Pick a name." }, { status: 400 });
  if (name.length > NAME_MAX) {
    return NextResponse.json({ error: `Name must be ${NAME_MAX} characters or fewer.` }, { status: 400 });
  }

  const inviteCode = await getInviteCode();
  if (!inviteCode || normalizeInviteCode(inviteCode) !== code) {
    return NextResponse.json({ error: "That invite code is not valid." }, { status: 401 });
  }

  const [member] = await sql<Member[]>`
    insert into members (name, is_admin) values (${name}, false)
    returning id, name, is_admin
  `;

  await createSession({ memberId: member.id, isAdmin: false });

  return NextResponse.json({ ok: true });
}
