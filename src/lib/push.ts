import webpush from "web-push";
import { sql } from "@/lib/db";

export type PushSubscriptionRow = {
  endpoint: string;
  p256dh: string;
  auth: string;
};

const publicKey = process.env.VAPID_PUBLIC_KEY;
const privateKey = process.env.VAPID_PRIVATE_KEY;
const subject = process.env.VAPID_SUBJECT ?? "mailto:admin@example.com";

let configured = false;

/** Push is optional: without VAPID keys the app runs exactly as before. */
export function pushConfigured(): boolean {
  if (!publicKey || !privateKey) return false;

  if (!configured) {
    webpush.setVapidDetails(subject, publicKey, privateKey);
    configured = true;
  }

  return true;
}

export function pushPublicKey(): string | null {
  return pushConfigured() ? publicKey! : null;
}

const BODY_MAX = 120;

/**
 * Notifies every subscribed device except the sender's own.
 *
 * Callers must await this before responding. The Fly machine is allowed to
 * suspend once it has no open connections, so "fire and forget after the
 * response" risks being cut off mid-send.
 */
export async function notifyNewMessage(options: {
  author: string;
  body: string;
  senderId: string;
}): Promise<void> {
  if (!pushConfigured()) return;

  const subscriptions = await sql<PushSubscriptionRow[]>`
    select endpoint, p256dh, auth
    from push_subscriptions
    where member_id <> ${options.senderId}
  `;

  if (subscriptions.length === 0) return;

  const payload = JSON.stringify({
    title: options.author,
    body:
      options.body.length > BODY_MAX ? `${options.body.slice(0, BODY_MAX - 1)}…` : options.body,
  });

  const results = await Promise.allSettled(
    subscriptions.map((subscription) =>
      webpush.sendNotification(
        {
          endpoint: subscription.endpoint,
          keys: { p256dh: subscription.p256dh, auth: subscription.auth },
        },
        payload,
        // `urgency` defaults to "normal", which Android's Doze batches into
        // maintenance windows — that is the minutes-late delivery. "high" is
        // allowed to wake the device. `topic` lets the push service replace an
        // undelivered message instead of queuing a backlog, matching the
        // `tag` the service worker collapses banners with.
        { TTL: 60 * 60 * 24, urgency: "high", topic: "simple-chat" },
      ),
    ),
  );

  // 404/410 mean the browser threw the subscription away; stop trying it.
  const dead = results.flatMap((result, index) => {
    if (result.status !== "rejected") return [];
    const status = (result.reason as { statusCode?: number })?.statusCode;
    if (status === 404 || status === 410) return [subscriptions[index].endpoint];
    console.error("push send failed", status ?? result.reason);
    return [];
  });

  if (dead.length > 0) {
    await sql`delete from push_subscriptions where endpoint = any(${dead})`;
  }
}
