"use client";

import { useEffect, useState } from "react";

type State = "loading" | "unavailable" | "off" | "on" | "denied" | "install-first";

/** Push keys arrive as base64url; subscribe() wants the raw bytes. */
function decodeKey(base64url: string): ArrayBuffer {
  const padded = base64url.padEnd(base64url.length + ((4 - (base64url.length % 4)) % 4), "=");
  const binary = atob(padded.replace(/-/g, "+").replace(/_/g, "/"));
  const buffer = new ArrayBuffer(binary.length);
  const bytes = new Uint8Array(buffer);

  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);

  return buffer;
}

function isIos(): boolean {
  return /iPad|iPhone|iPod/.test(navigator.userAgent);
}

/** iOS only exposes push to a PWA that was added to the Home Screen. */
function isStandalone(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as { standalone?: boolean }).standalone === true
  );
}

export function NotifyButton() {
  const [state, setState] = useState<State>("loading");
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [hint, setHint] = useState("");

  useEffect(() => {
    void (async () => {
      const supported =
        "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

      if (!supported) {
        setState(isIos() && !isStandalone() ? "install-first" : "unavailable");
        return;
      }

      // The server only hands out a key when VAPID is configured.
      const response = await fetch("/api/push");
      const key = response.ok ? ((await response.json()).publicKey as string | null) : null;
      if (!key) {
        setState("unavailable");
        return;
      }
      setPublicKey(key);

      if (Notification.permission === "denied") {
        setState("denied");
        return;
      }

      const registration = await navigator.serviceWorker.ready;
      const existing = await registration.pushManager.getSubscription();
      setState(existing ? "on" : "off");
    })().catch(() => setState("unavailable"));
  }, []);

  async function enable() {
    if (!publicKey) return;
    setBusy(true);
    setHint("");

    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState(permission === "denied" ? "denied" : "off");
        return;
      }

      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: decodeKey(publicKey),
      });

      const response = await fetch("/api/push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(subscription.toJSON()),
      });

      if (!response.ok) {
        await subscription.unsubscribe();
        setHint("Could not turn notifications on.");
        setState("off");
        return;
      }

      setState("on");
    } catch {
      setHint("Could not turn notifications on.");
      setState("off");
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    setHint("");

    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();

      if (subscription) {
        // Drop the server row first; a stale row would send to a dead endpoint.
        await fetch("/api/push", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: subscription.endpoint }),
        });
        await subscription.unsubscribe();
      }

      setState("off");
    } finally {
      setBusy(false);
    }
  }

  if (state === "loading" || state === "unavailable") return null;

  if (state === "install-first") {
    return (
      <button
        onClick={() => setHint("Add this app to your Home Screen to get notifications.")}
        aria-label="Why notifications are unavailable"
        className="rounded-lg border border-line px-2.5 py-1.5 text-sm opacity-60"
        title={hint || "Add to Home Screen for notifications"}
      >
        🔕
      </button>
    );
  }

  if (state === "denied") {
    return (
      <button
        onClick={() => setHint("Notifications are blocked in your browser settings.")}
        aria-label="Notifications are blocked"
        className="rounded-lg border border-line px-2.5 py-1.5 text-sm opacity-60"
        title={hint || "Blocked in browser settings"}
      >
        🔕
      </button>
    );
  }

  const on = state === "on";

  return (
    <button
      onClick={() => void (on ? disable() : enable())}
      disabled={busy}
      aria-pressed={on}
      aria-label={on ? "Turn notifications off" : "Turn notifications on"}
      title={hint || (on ? "Notifications on" : "Notifications off")}
      className={`rounded-lg border px-2.5 py-1.5 text-sm transition disabled:opacity-50 ${
        on ? "border-accent bg-accent-soft" : "border-line"
      }`}
    >
      {on ? "🔔" : "🔕"}
    </button>
  );
}
