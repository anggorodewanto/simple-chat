# Simple Chat

A small text-only group chat, built as an installable PWA for phones.

One room, one admin (you), and everyone else joins with an invite code and
picks a display name. Runs on Fly.io with Neon Postgres.

- **Admin** logs in with a password and can see and rotate the invite code.
- **Guests** open the app, enter the code, choose a name, and they're in.
- Messages arrive live over Server-Sent Events.
- Installable to the home screen, with an offline fallback page.

## Stack

Next.js 15 (App Router) · TypeScript · Tailwind v4 · Postgres (Neon) · SSE

## Local development

```bash
npm install
cp .env.example .env.local     # then fill it in
npm run hash-password "your password"   # paste into ADMIN_PASSWORD_HASH
npm run db:migrate             # creates tables and prints the first invite code
npm run dev
```

The migration prints the invite code on first run. After that, read or rotate
it from `/admin`.

For a local Postgres, add `?sslmode=disable` to `DATABASE_URL`; Neon needs
`?sslmode=require`.

## Environment variables

| Variable | Required | What it does |
| --- | --- | --- |
| `DATABASE_URL` | yes | Neon connection string. Use the **pooled** endpoint. |
| `SESSION_SECRET` | yes | Signs the session cookie. 32+ random characters. |
| `ADMIN_PASSWORD_HASH` | yes* | Bcrypt hash of your admin password. |
| `ADMIN_PASSWORD` | no | Plain-text alternative for local dev only. |
| `ADMIN_NAME` | no | Name shown on your messages. Defaults to `Admin`. |

\* Either `ADMIN_PASSWORD_HASH` or `ADMIN_PASSWORD` must be set.

## Deploying

### 1. Neon

Create a project at [neon.tech](https://neon.tech) and copy the **pooled**
connection string (the host contains `-pooler`).

### 2. Fly.io

```bash
fly launch --no-deploy          # pick a name and region, keep the fly.toml
fly secrets set \
  DATABASE_URL="postgresql://...-pooler...neon.tech/neondb?sslmode=require" \
  SESSION_SECRET="$(openssl rand -base64 48)" \
  ADMIN_PASSWORD_HASH='<output of npm run hash-password>'
fly deploy
```

`fly.toml` runs `node scripts/migrate.mjs` as the release command, so the
schema is applied on every deploy before the new version takes traffic. The
schema is idempotent, so repeat deploys are safe.

To read the first invite code:

```bash
fly logs | grep "Invite code"
```

Or just log in at `/admin`.

### Cost

`fly.toml` sets `min_machines_running = 0`, so the machine suspends when nobody
is using the app and wakes on the next request. Suspend keeps that wake-up fast
(much faster than a full stop).

This only saves money because the client closes its live stream when the tab is
hidden. An open SSE connection counts as an active connection, so a
backgrounded phone holding one would keep the machine awake around the clock.
See **Realtime** below.

The first request after a suspend takes an extra moment. If that ever feels too
slow, `min_machines_running = 1` keeps a machine hot at the cost of running it
24/7.

### 3. Install on your phone

Open the site in Safari or Chrome and use **Add to Home Screen**. It then runs
full-screen with its own icon.

## Inviting people

From `/admin`, tap **Share invite link**. It shares a link like
`https://your-app.fly.dev/?code=ABCD1234`, which opens the app with the code
already filled in.

Rotating the code stops future joins with the old one. People already in the
chat keep their access.

## How things work

**Sessions.** A signed JWT in an httpOnly cookie, valid for 90 days, holding
only a member id. Every request looks the member up in the database, so
deleting a member row revokes their access immediately.

**Realtime.** `GET /api/stream` holds an SSE connection and polls for messages
newer than the client's cursor. The cursor comes from the `Last-Event-ID`
header, which the browser sends automatically on reconnect, so a phone waking
from sleep resumes without gaps or duplicates. A comment heartbeat every 25
seconds keeps proxies from dropping idle connections.

The client closes the stream when the page is hidden and reopens it on return,
passing `?after=<last message id>` so nothing is missed while it was away. That
is what lets the Fly machine suspend while the app sits in the background.

**Rate limits.** In-memory and per-instance: 8 admin login attempts and 20
joins per IP per 10 minutes, and 30 messages per member per 10 seconds. They
reset on deploy and are not shared between machines, which is fine at one
always-on machine. Running several machines would need a shared store.

**Scale.** The polling stream issues one small indexed query per connected
client every 1.5 seconds. That is comfortable for a group of friends. For
hundreds of concurrent clients, move to Postgres `LISTEN`/`NOTIFY` or a
process-local fan-out.

## Project layout

```
db/schema.sql          idempotent schema
scripts/migrate.mjs    applies the schema, seeds the room
scripts/hash-password.mjs
scripts/generate-icons.mjs   regenerates the PWA icons
src/lib/               db access, sessions, auth helpers
src/app/api/           auth, messages, SSE stream, room admin
src/app/               welcome, chat, admin screens
public/                manifest, service worker, icons, offline page
```
