import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { currentMember } from "@/lib/auth";
import { pushPublicKey } from "@/lib/push";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** What the client needs to decide whether to offer the notification toggle. */
export async function GET() {
  const member = await currentMember();
  if (!member) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  return NextResponse.json({ publicKey: pushPublicKey() });
}

export async function POST(request: Request) {
  const member = await currentMember();
  if (!member) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  if (!pushPublicKey()) {
    return NextResponse.json({ error: "Push is not configured." }, { status: 503 });
  }

  const body = await request.json().catch(() => null);
  const endpoint = typeof body?.endpoint === "string" ? body.endpoint : "";
  const p256dh = typeof body?.keys?.p256dh === "string" ? body.keys.p256dh : "";
  const auth = typeof body?.keys?.auth === "string" ? body.keys.auth : "";

  if (!endpoint || !p256dh || !auth) {
    return NextResponse.json({ error: "Invalid subscription." }, { status: 400 });
  }

  // Re-subscribing on a device that already has a row, or one that belonged to
  // a previous member on the same phone, just reassigns it.
  await sql`
    insert into push_subscriptions (endpoint, member_id, p256dh, auth)
    values (${endpoint}, ${member.id}, ${p256dh}, ${auth})
    on conflict (endpoint) do update
      set member_id = excluded.member_id,
          p256dh = excluded.p256dh,
          auth = excluded.auth
  `;

  return NextResponse.json({ ok: true }, { status: 201 });
}

export async function DELETE(request: Request) {
  const member = await currentMember();
  if (!member) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const body = await request.json().catch(() => null);
  const endpoint = typeof body?.endpoint === "string" ? body.endpoint : "";

  if (!endpoint) return NextResponse.json({ error: "Invalid subscription." }, { status: 400 });

  await sql`
    delete from push_subscriptions
    where endpoint = ${endpoint} and member_id = ${member.id}
  `;

  return NextResponse.json({ ok: true });
}
