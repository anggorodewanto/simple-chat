"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Mode = "choose" | "join" | "admin";

const field =
  "w-full rounded-xl border border-line bg-panel-soft px-4 py-3 outline-none placeholder:text-muted/70 focus:border-accent";
const primary =
  "w-full rounded-xl bg-accent px-4 py-3 font-semibold text-ink transition active:scale-[0.99] disabled:opacity-50";
const secondary =
  "w-full rounded-xl border border-line bg-panel-soft px-4 py-3 font-semibold transition active:scale-[0.99] disabled:opacity-50";

export function Welcome({ initialCode }: { initialCode: string }) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>(initialCode ? "join" : "choose");
  const [code, setCode] = useState(initialCode);
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(url: string, payload: Record<string, string>) {
    setBusy(true);
    setError("");

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => null);
        setError(data?.error ?? "Something went wrong. Try again.");
        return;
      }

      router.replace("/chat");
      router.refresh();
    } catch {
      setError("Network error. Check your connection.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="pad-top pad-bottom mx-auto flex min-h-[100dvh] w-full max-w-sm flex-col justify-center gap-8 px-5">
      <header className="text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-accent text-3xl">
          💬
        </div>
        <h1 className="text-2xl font-bold">Simple Chat</h1>
        <p className="mt-1 text-sm text-muted">One room. Invite only.</p>
      </header>

      {mode === "choose" && (
        <div className="flex flex-col gap-3">
          <button className={primary} onClick={() => setMode("join")}>
            Join with a code
          </button>
          <button className={secondary} onClick={() => setMode("admin")}>
            Log in as admin
          </button>
        </div>
      )}

      {mode === "join" && (
        <form
          className="flex flex-col gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            void submit("/api/auth/join", { code, name });
          }}
        >
          <label className="text-sm text-muted" htmlFor="code">
            Invite code
          </label>
          <input
            id="code"
            className={`${field} tracking-[0.3em] uppercase`}
            value={code}
            onChange={(event) => setCode(event.target.value.toUpperCase())}
            placeholder="ABCD1234"
            autoCapitalize="characters"
            autoComplete="off"
            autoCorrect="off"
            required
          />

          <label className="mt-2 text-sm text-muted" htmlFor="name">
            Your name
          </label>
          <input
            id="name"
            className={field}
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="e.g. Sam"
            maxLength={24}
            autoComplete="nickname"
            required
          />

          {error && <p className="text-sm text-red-400">{error}</p>}

          <button className={`${primary} mt-2`} disabled={busy}>
            {busy ? "Joining…" : "Join chat"}
          </button>
          <button type="button" className="py-2 text-sm text-muted" onClick={() => setMode("choose")}>
            Back
          </button>
        </form>
      )}

      {mode === "admin" && (
        <form
          className="flex flex-col gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            void submit("/api/auth/admin", { password });
          }}
        >
          <label className="text-sm text-muted" htmlFor="password">
            Admin password
          </label>
          <input
            id="password"
            className={field}
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="current-password"
            required
          />

          {error && <p className="text-sm text-red-400">{error}</p>}

          <button className={`${primary} mt-2`} disabled={busy}>
            {busy ? "Logging in…" : "Log in"}
          </button>
          <button type="button" className="py-2 text-sm text-muted" onClick={() => setMode("choose")}>
            Back
          </button>
        </form>
      )}
    </main>
  );
}
