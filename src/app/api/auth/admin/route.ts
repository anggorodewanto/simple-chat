import { NextResponse } from "next/server";
import { sql, type Member } from "@/lib/db";
import { createSession } from "@/lib/session";
import { clientIp, rateLimit, verifyAdminPassword } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Find-or-create the single admin member row. */
async function adminMember(): Promise<Member> {
  const name = process.env.ADMIN_NAME?.trim() || "Admin";

  const existing = await sql<Member[]>`
    select id, name, is_admin from members where is_admin limit 1
  `;
  if (existing[0]) return existing[0];

  const created = await sql<Member[]>`
    insert into members (name, is_admin) values (${name}, true)
    on conflict do nothing
    returning id, name, is_admin
  `;
  if (created[0]) return created[0];

  // Lost the race against a concurrent login; the row exists now.
  const [row] = await sql<Member[]>`
    select id, name, is_admin from members where is_admin limit 1
  `;
  return row;
}

export async function POST(request: Request) {
  const ip = clientIp(request);
  if (!rateLimit(`admin:${ip}`, 8, 10 * 60 * 1000)) {
    return NextResponse.json({ error: "Too many attempts. Try again later." }, { status: 429 });
  }

  const body = await request.json().catch(() => null);
  const password = typeof body?.password === "string" ? body.password : "";

  if (!password) {
    return NextResponse.json({ error: "Password is required." }, { status: 400 });
  }

  if (!(await verifyAdminPassword(password))) {
    return NextResponse.json({ error: "Wrong password." }, { status: 401 });
  }

  const member = await adminMember();
  await createSession({ memberId: member.id, isAdmin: true });

  return NextResponse.json({ ok: true });
}
