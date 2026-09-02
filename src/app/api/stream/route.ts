import { sql, toMessage, type MessageRow } from "@/lib/db";
import { currentMember } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const POLL_MS = 1500;
const HEARTBEAT_MS = 25_000;

/**
 * Server-Sent Events feed of new messages.
 *
 * The cursor comes from `Last-Event-ID` (set automatically by EventSource on
 * reconnect) and falls back to the `after` query param, so a phone waking from
 * sleep resumes without gaps or duplicates.
 */
export async function GET(request: Request) {
  const member = await currentMember();
  if (!member) return new Response("Not signed in.", { status: 401 });

  const url = new URL(request.url);
  const lastEventId = request.headers.get("last-event-id") ?? url.searchParams.get("after");
  const parsed = Number(lastEventId);
  let cursor = Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : 0;

  if (!lastEventId) {
    const [row] = await sql<{ max: string | null }[]>`select max(id)::text as max from messages`;
    cursor = Number(row?.max ?? 0);
  }

  const encoder = new TextEncoder();
  let timer: ReturnType<typeof setInterval> | undefined;
  let heartbeat: ReturnType<typeof setInterval> | undefined;

  const stream = new ReadableStream({
    start(controller) {
      let closed = false;
      let polling = false;

      const send = (chunk: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          close();
        }
      };

      const close = () => {
        if (closed) return;
        closed = true;
        clearInterval(timer);
        clearInterval(heartbeat);
        try {
          controller.close();
        } catch {
          // Already closed by the runtime.
        }
      };

      send(`retry: 3000\n\n`);
      send(`event: ready\ndata: ${JSON.stringify({ cursor })}\n\n`);

      const poll = async () => {
        if (closed || polling) return;
        polling = true;
        try {
          const rows = await sql<MessageRow[]>`
            select m.id, m.body, m.created_at, m.member_id,
                   u.name as author, u.is_admin as author_is_admin
            from messages m
            join members u on u.id = m.member_id
            where m.id > ${cursor}
            order by m.id asc
            limit 200
          `;

          for (const row of rows) {
            const message = toMessage(row);
            cursor = message.id;
            send(`id: ${message.id}\nevent: message\ndata: ${JSON.stringify(message)}\n\n`);
          }
        } catch (err) {
          console.error("stream poll failed", err);
        } finally {
          polling = false;
        }
      };

      void poll();
      timer = setInterval(poll, POLL_MS);
      // Keeps proxies and mobile radios from dropping an idle connection.
      heartbeat = setInterval(() => send(`: ping\n\n`), HEARTBEAT_MS);

      request.signal.addEventListener("abort", close);
    },
    cancel() {
      clearInterval(timer);
      clearInterval(heartbeat);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
