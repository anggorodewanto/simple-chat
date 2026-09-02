import { NextResponse } from "next/server";
import { sql, toMessage, type MessageRow } from "@/lib/db";
import { currentMember, MESSAGE_MAX, rateLimit } from "@/lib/auth";
import { notifyNewMessage } from "@/lib/push";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

/** Recent history, oldest-first. `before` pages backwards through older messages. */
export async function GET(request: Request) {
  const member = await currentMember();
  if (!member) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const url = new URL(request.url);
  const beforeParam = url.searchParams.get("before");
  const before = beforeParam ? Number(beforeParam) : null;

  if (beforeParam && !Number.isSafeInteger(before)) {
    return NextResponse.json({ error: "Invalid cursor." }, { status: 400 });
  }

  const rows = await sql<MessageRow[]>`
    select m.id, m.body, m.created_at, m.member_id,
           u.name as author, u.is_admin as author_is_admin
    from messages m
    join members u on u.id = m.member_id
    ${before !== null ? sql`where m.id < ${before}` : sql``}
    order by m.id desc
    limit ${PAGE_SIZE}
  `;

  const messages = rows.reverse().map(toMessage);

  return NextResponse.json({ messages, hasMore: rows.length === PAGE_SIZE });
}

export async function POST(request: Request) {
  const member = await currentMember();
  if (!member) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  if (!rateLimit(`send:${member.id}`, 30, 10 * 1000)) {
    return NextResponse.json({ error: "Slow down a moment." }, { status: 429 });
  }

  const payload = await request.json().catch(() => null);
  const body = typeof payload?.body === "string" ? payload.body.trim() : "";

  if (!body) return NextResponse.json({ error: "Message is empty." }, { status: 400 });
  if (body.length > MESSAGE_MAX) {
    return NextResponse.json({ error: `Messages are limited to ${MESSAGE_MAX} characters.` }, { status: 400 });
  }

  const [row] = await sql<MessageRow[]>`
    with inserted as (
      insert into messages (member_id, body) values (${member.id}, ${body})
      returning id, body, created_at, member_id
    )
    select i.id, i.body, i.created_at, i.member_id,
           u.name as author, u.is_admin as author_is_admin
    from inserted i join members u on u.id = i.member_id
  `;

  await sql`update members set last_seen_at = now() where id = ${member.id}`;

  // Awaited on purpose: the machine may suspend as soon as this request ends,
  // so a detached send could be cut off before it reaches the push services.
  await notifyNewMessage({ author: member.name, body, senderId: member.id });

  return NextResponse.json({ message: toMessage(row) }, { status: 201 });
}
