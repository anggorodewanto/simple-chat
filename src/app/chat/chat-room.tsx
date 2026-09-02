"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

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
  const pinnedToBottom = useRef(true);

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
      requestAnimationFrame(() => scrollToBottom());
    })();

    return () => {
      cancelled = true;
    };
  }, [router, scrollToBottom]);

  // Live feed. EventSource reconnects on its own and resumes from Last-Event-ID.
  useEffect(() => {
    const source = new EventSource("/api/stream");

    source.addEventListener("ready", () => setConnected(true));
    source.addEventListener("message", (event) => {
      const message = JSON.parse((event as MessageEvent).data) as Message;
      setMessages((current) => merge(current, [message]));
    });
    source.onerror = () => setConnected(false);
    source.onopen = () => setConnected(true);

    return () => source.close();
  }, []);

  // Follow the conversation only when the reader is already at the bottom.
  useEffect(() => {
    if (pinnedToBottom.current) scrollToBottom("smooth");
  }, [messages, scrollToBottom]);

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
      setMessages((current) => merge(current, [data.message]));
    } catch {
      setError("Offline — message not sent.");
      setDraft(body);
    }
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/");
    router.refresh();
  }

  return (
    <div className="flex h-[100dvh] flex-col">
      <header className="pad-top flex items-center gap-3 border-b border-line bg-panel px-4 pb-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent-soft">💬</div>
        <div className="min-w-0 flex-1">
          <h1 className="truncate font-semibold">Simple Chat</h1>
          <p className="truncate text-xs text-muted">
            <span className={connected ? "text-emerald-400" : "text-amber-400"}>●</span>{" "}
            {connected ? "Live" : "Reconnecting…"} · {me.name}
          </p>
        </div>
        {me.isAdmin && (
          <Link href="/admin" className="rounded-lg border border-line px-3 py-1.5 text-sm">
            Admin
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
