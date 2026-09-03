"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { QRCodeSVG } from "qrcode.react";

type RoomInfo = { inviteCode: string; memberCount: number; messageCount: number };

export function AdminPanel() {
  const [room, setRoom] = useState<RoomInfo | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    void fetch("/api/room")
      .then((response) => (response.ok ? response.json() : null))
      .then(setRoom);
  }, []);

  const inviteLink = room ? `${globalThis.location?.origin ?? ""}/?code=${room.inviteCode}` : "";

  async function regenerate() {
    setBusy(true);
    try {
      const response = await fetch("/api/room", { method: "POST" });
      if (response.ok) {
        const data = await response.json();
        setRoom((current) => (current ? { ...current, inviteCode: data.inviteCode } : current));
      }
    } finally {
      setBusy(false);
      setConfirming(false);
    }
  }

  async function share() {
    if (navigator.share) {
      await navigator.share({ title: "Join my chat", text: "Join the chat:", url: inviteLink }).catch(() => {});
      return;
    }

    await navigator.clipboard.writeText(inviteLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <main className="pad-top pad-bottom mx-auto flex min-h-[100dvh] w-full max-w-sm flex-col gap-6 px-5">
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Admin</h1>
        <Link href="/chat" className="rounded-lg border border-line px-3 py-1.5 text-sm">
          Back to chat
        </Link>
      </header>

      {!room ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : (
        <>
          <section className="rounded-2xl border border-line bg-panel p-5">
            <h2 className="text-sm text-muted">Invite code</h2>
            <p className="mt-2 font-mono text-3xl tracking-[0.2em]">{room.inviteCode}</p>

            {/* White background and a quiet zone: scanners need the light margin. */}
            {inviteLink && (
              <div className="mt-4 flex flex-col items-center gap-2">
                <div className="rounded-xl bg-white p-3">
                  <QRCodeSVG value={inviteLink} size={180} level="M" marginSize={0} />
                </div>
                <p className="text-xs text-muted">Scan to join — the code fills itself in.</p>
              </div>
            )}

            <button
              onClick={share}
              className="mt-4 w-full rounded-xl bg-accent px-4 py-3 font-semibold text-ink active:scale-[0.99]"
            >
              {copied ? "Link copied" : "Share invite link"}
            </button>

            {confirming ? (
              <div className="mt-3 rounded-xl border border-line p-3">
                <p className="text-sm text-muted">
                  A new code stops future joins with the old one. People already in the chat stay in.
                </p>
                <div className="mt-3 flex gap-2">
                  <button
                    onClick={regenerate}
                    disabled={busy}
                    className="flex-1 rounded-lg bg-red-500/90 px-3 py-2 text-sm font-semibold disabled:opacity-50"
                  >
                    {busy ? "Working…" : "Yes, rotate it"}
                  </button>
                  <button
                    onClick={() => setConfirming(false)}
                    className="flex-1 rounded-lg border border-line px-3 py-2 text-sm"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button onClick={() => setConfirming(true)} className="mt-3 w-full py-2 text-sm text-muted">
                Generate a new code
              </button>
            )}
          </section>

          <section className="grid grid-cols-2 gap-3">
            <div className="rounded-2xl border border-line bg-panel p-4">
              <p className="text-2xl font-bold">{room.memberCount}</p>
              <p className="text-xs text-muted">members joined</p>
            </div>
            <div className="rounded-2xl border border-line bg-panel p-4">
              <p className="text-2xl font-bold">{room.messageCount}</p>
              <p className="text-xs text-muted">messages sent</p>
            </div>
          </section>
        </>
      )}
    </main>
  );
}
