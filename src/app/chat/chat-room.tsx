"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { NotifyButton } from "@/app/chat/notify-button";

type Message = {
  id: number;
  body: string;
  createdAt: string;
  memberId: string;
  author: string;
  authorIsAdmin: boolean;
};

type Me = { id: string; name: string; isAdmin: boolean };

const timeFormat = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" });

function dayLabel(iso: string): string {
  const date = new Date(iso);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);

  const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  if (sameDay(date, today)) return "Today";
  if (sameDay(date, yesterday)) return "Yesterday";

  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/** Merges incoming messages into the list, keeping it sorted and duplicate-free. */
function merge(current: Message[], incoming: Message[]): Message[] {
  const byId = new Map(current.map((message) => [message.id, message]));
  for (const message of incoming) byId.set(message.id, message);
  return [...byId.values()].sort((a, b) => a.id - b.id);
}

export function ChatRoom({ me }: { me: Me }) {
  const router = useRouter();
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [hasMore, setHasMore] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState("");

  const scroller = useRef<HTMLDivElement>(null);
  const composer = useRef<HTMLTextAreaElement>(null);
  const pinnedToBottom = useRef(true);
  // Newest message id held locally; the resume cursor for a reopened stream.
  const lastSeenId = useRef(0);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = "auto") => {
    const element = scroller.current;
    if (element) element.scrollTo({ top: element.scrollHeight, behavior });
  }, []);

  // Initial history.
  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const response = await fetch("/api/messages");
      if (response.status === 401) {
        router.replace("/");
        return;
      }
      if (!response.ok || cancelled) return;

      const data = await response.json();
      setMessages(data.messages);
      setHasMore(data.hasMore);
      const newest = data.messages.at(-1) as Message | undefined;
      if (newest) lastSeenId.current = Math.max(lastSeenId.current, newest.id);
      requestAnimationFrame(() => scrollToBottom());
    })();

    return () => {
      cancelled = true;
    };
  }, [router, scrollToBottom]);

  // Live feed, dropped while the app is in the background.
  //
  // An open SSE connection counts as an active connection on Fly, so a
  // backgrounded tab holding one would keep the machine awake around the
  // clock. Closing it on hide lets the machine suspend; on return we reopen
  // from the last message we hold, so nothing is missed in between.
  useEffect(() => {
    let source: EventSource | null = null;

    const open = () => {
      if (source || document.visibilityState === "hidden") return;

      const cursor = lastSeenId.current;
      source = new EventSource(cursor ? `/api/stream?after=${cursor}` : "/api/stream");

      source.addEventListener("ready", () => setConnected(true));
      source.addEventListener("message", (event) => {
        const message = JSON.parse((event as MessageEvent).data) as Message;
        lastSeenId.current = Math.max(lastSeenId.current, message.id);
        setMessages((current) => merge(current, [message]));
      });
      source.onopen = () => setConnected(true);
      source.onerror = () => setConnected(false);
    };

    const close = () => {
      source?.close();
      source = null;
      setConnected(false);
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") open();
      else close();
    };

    open();
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      close();
    };
  }, []);

  // Follow the conversation only when the reader is already at the bottom.
  useEffect(() => {
    if (pinnedToBottom.current) scrollToBottom("smooth");
  }, [messages, scrollToBottom]);

  // Chrome 123+ and Safari 17.4+ grow the composer themselves via
  // `field-sizing: content`. Older phones would be stuck at one row, so give
  // them the same behaviour by hand.
  useEffect(() => {
    const element = composer.current;
    if (!element) return;
    if (CSS.supports("field-sizing", "content")) return;

    // Collapse first, or scrollHeight only ever reports the current height.
    element.style.height = "auto";
    element.style.height = `${element.scrollHeight}px`;
  }, [draft]);

  async function loadOlder() {
    const oldest = messages[0];
    if (!oldest || loadingOlder) return;

    setLoadingOlder(true);
    const element = scroller.current;
    const previousHeight = element?.scrollHeight ?? 0;

    try {
      const response = await fetch(`/api/messages?before=${oldest.id}`);
      if (!response.ok) return;

      const data = await response.json();
      setMessages((current) => merge(current, data.messages));
      setHasMore(data.hasMore);

      // Keep the reader's place instead of jumping to the top.
      requestAnimationFrame(() => {
        if (element) element.scrollTop = element.scrollHeight - previousHeight;
      });
    } finally {
      setLoadingOlder(false);
    }
  }

  async function send(event: React.FormEvent) {
    event.preventDefault();
    const body = draft.trim();
    if (!body) return;

    setDraft("");
    setError("");
    pinnedToBottom.current = true;

    try {
      const response = await fetch("/api/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body }),
      });

      if (response.status === 401) {
        router.replace("/");
        return;
      }

      if (!response.ok) {
        const data = await response.json().catch(() => null);
        setError(data?.error ?? "Could not send that message.");
        setDraft(body);
        return;
      }

      const data = await response.json();
      lastSeenId.current = Math.max(lastSeenId.current, data.message.id);
      setMessages((current) => merge(current, [data.message]));
    } catch {
      setError("Offline — message not sent.");
      setDraft(body);
    }
  }

  async function logout() {
    // Drop this device's push subscription too, or the phone keeps getting
    // notifications for a room it is no longer in.
    try {
      const registration = await navigator.serviceWorker?.ready;
      const subscription = await registration?.pushManager.getSubscription();

      if (subscription) {
        await fetch("/api/push", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: subscription.endpoint }),
        });
        await subscription.unsubscribe();
      }
    } catch {
      // Never block leaving the room on push cleanup.
    }

    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/");
    router.refresh();
  }

  return (
    <div className="flex h-viewport flex-col">
      <header className="pad-top flex items-center gap-3 border-b border-line bg-panel px-4 pb-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent-soft">💬</div>
        <div className="min-w-0 flex-1">
          <h1 className="truncate font-semibold">Simple Chat</h1>
          <p className="truncate text-xs text-muted">
            <span className={connected ? "text-emerald-400" : "text-amber-400"}>●</span>{" "}
            {connected ? "Live" : "Reconnecting…"} · {me.name}
          </p>
        </div>
        <NotifyButton />
        {me.isAdmin && (
          <Link
            href="/admin"
            aria-label="Admin"
            title="Admin"
            className="rounded-lg border border-line px-2.5 py-1.5 text-sm"
          >
            ⚙️
          </Link>
        )}
        <button onClick={logout} className="rounded-lg border border-line px-3 py-1.5 text-sm">
          Leave
        </button>
      </header>

      <div
        ref={scroller}
        onScroll={(event) => {
          const element = event.currentTarget;
          const distance = element.scrollHeight - element.scrollTop - element.clientHeight;
          pinnedToBottom.current = distance < 80;
        }}
        className="scroll-thin flex-1 overflow-y-auto px-3 py-4"
      >
        {hasMore && (
          <button
            onClick={loadOlder}
            disabled={loadingOlder}
            className="mx-auto mb-4 block rounded-lg border border-line px-3 py-1.5 text-sm text-muted"
          >
            {loadingOlder ? "Loading…" : "Load earlier messages"}
          </button>
        )}

        {messages.length === 0 && (
          <p className="mt-10 text-center text-sm text-muted">No messages yet. Say hello 👋</p>
        )}

        <ul className="flex flex-col gap-1">
          {messages.map((message, index) => {
            const previous = messages[index - 1];
            const mine = message.memberId === me.id;
            const newDay = !previous || dayLabel(previous.createdAt) !== dayLabel(message.createdAt);
            const startsGroup = newDay || !previous || previous.memberId !== message.memberId;

            return (
              <li key={message.id}>
                {newDay && (
                  <div className="my-4 text-center text-xs text-muted">{dayLabel(message.createdAt)}</div>
                )}
                <div className={`flex flex-col ${mine ? "items-end" : "items-start"}`}>
                  {startsGroup && !mine && (
                    <span className="mb-0.5 ml-1 text-xs text-muted">
                      {message.author}
                      {message.authorIsAdmin && " · admin"}
                    </span>
                  )}
                  <div
                    className={`max-w-[80%] rounded-2xl px-3.5 py-2 ${
                      mine ? "bg-accent text-ink" : "bg-panel-soft"
                    } ${startsGroup ? "" : "mt-0.5"}`}
                  >
                    <p className="break-words whitespace-pre-wrap">
                      {message.body}
                      {/* Trails the text so short messages stay compact. */}
                      <time
                        dateTime={message.createdAt}
                        className={`ml-2 align-baseline text-[10px] whitespace-nowrap ${
                          mine ? "text-ink/60" : "text-muted"
                        }`}
                      >
                        {timeFormat.format(new Date(message.createdAt))}
                      </time>
                    </p>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </div>

      <form onSubmit={send} className="pad-bottom border-t border-line bg-panel px-3 pt-3">
        {error && <p className="mb-2 text-sm text-red-400">{error}</p>}
        <div className="flex items-end gap-2">
          <textarea
            ref={composer}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              // Enter sends on a physical keyboard; phones get a normal newline key.
              if (event.key === "Enter" && !event.shiftKey && !("ontouchstart" in window)) {
                event.preventDefault();
                void send(event);
              }
            }}
            rows={1}
            maxLength={2000}
            placeholder="Message"
            className="max-h-32 min-h-11 flex-1 resize-none rounded-2xl border border-line bg-panel-soft px-4 py-2.5 outline-none placeholder:text-muted/70 focus:border-accent"
          />
          <button
            type="submit"
            disabled={!draft.trim()}
            aria-label="Send message"
            className="h-11 w-11 shrink-0 rounded-full bg-accent text-ink transition active:scale-95 disabled:opacity-40"
          >
            ↑
          </button>
        </div>
      </form>
    </div>
  );
}
