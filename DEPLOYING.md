# Deploying Simple Chat

A start-to-finish walkthrough: from nothing, to a chat app running on your
phone. Follow it top to bottom the first time.

Everything here runs on your own laptop. There is no server to manage — Fly
builds and runs the container, Neon runs the database.

Costs nothing at rest: the machine sleeps when nobody is using the app, and
Neon's free tier covers a group chat comfortably.

## What you'll need

| | |
| --- | --- |
| **Node 22+** | `node -v` to check. [nodejs.org](https://nodejs.org) |
| **flyctl** | `curl -L https://fly.io/install.sh \| sh`, then `fly auth signup` (or `fly auth login`) |
| **A Neon account** | Free tier. [neon.tech](https://neon.tech) |
| **A Fly.io account** | Card required for verification, but this app fits the low-cost tier |

## 1. Get the code

```bash
git clone https://github.com/anggorodewanto/simple-chat.git
cd simple-chat
git checkout claude/pwa-chat-app-4ztqou
npm install
```

If the work has been merged to `main` by the time you read this, skip the
`git checkout` line.

## 2. Create the database

In the [Neon console](https://console.neon.tech), create a project. Then copy
the **pooled** connection string — the hostname contains `-pooler`:

```
postgresql://user:pass@ep-something-pooler.region.aws.neon.tech/neondb?sslmode=require
```

That is all. The app creates its own tables on first deploy.

## 3. Generate your secrets

Three values, generated once. Keep them somewhere safe — you will paste them in
the next step.

```bash
npm run hash-password "the-password-you-want"   # -> ADMIN_PASSWORD_HASH
openssl rand -base64 48                         # -> SESSION_SECRET
npm run generate-vapid                          # -> the three VAPID values
```

`generate-vapid` is only needed if you want push notifications. Skipping it is
fine; the app runs the same and the notification bell simply doesn't appear.

## 4. Create the Fly app

```bash
fly apps create simple-chat-yourname
```

Then edit two lines at the top of `fly.toml`:

```toml
app = "simple-chat-yourname"    # must match the name you just created
primary_region = "sin"          # "sin" is Singapore
```

`fly platform regions` lists the region codes. Pick the one nearest the people
using the app.

> Use `fly apps create`, not `fly launch`. Launch regenerates `fly.toml` and
> can drop the release command and the scale-to-zero setting.

## 5. Set the secrets

**Before** you deploy — step 6 runs database migrations and will fail without
these.

```bash
fly secrets set \
  DATABASE_URL="postgresql://...-pooler....neon.tech/neondb?sslmode=require" \
  SESSION_SECRET="<the openssl output>" \
  ADMIN_PASSWORD_HASH='<the $2b$... hash>' \
  VAPID_PUBLIC_KEY="<...>" \
  VAPID_PRIVATE_KEY="<...>" \
  VAPID_SUBJECT="mailto:you@example.com"
```

Drop the three `VAPID_` lines if you skipped notifications.

> **Single-quote the bcrypt hash.** It contains `$`, and inside double quotes
> your shell would expand `$2b` into nothing, silently storing a broken hash.
> You would only find out when the admin password stopped working.

See the [environment variables table](README.md#environment-variables) for what
each one does.

## 6. Deploy

```bash
fly deploy
```

This builds the container, runs `node scripts/migrate.mjs` to create the
tables, then puts the new version live. The first build takes a few minutes;
later ones are faster.

The schema is idempotent, so every future deploy re-runs the migration
harmlessly.

## 7. Get in

```bash
fly open                        # opens the app in your browser
fly logs | grep "Invite code"   # the code generated on first migration
```

Or just tap **Log in as admin**, enter your password, and read the code off the
⚙️ screen.

Worth confirming now: send a message to yourself, and check the header shows a
green **Live** dot. That tells you the database, sessions, and the live stream
are all working.

## 8. Install on your phone

Open the app's URL on your phone, then:

- **iPhone / iPad** — Safari → Share → **Add to Home Screen**
- **Android** — Chrome → menu → **Install app** / **Add to Home Screen**

Open it from the new icon rather than the browser tab. It runs full screen,
and on iOS this is required for notifications to work at all.

## 9. Turn on notifications

Tap the 🔔 in the chat header and allow notifications when prompted.

Each person does this on their own device. On iPhone it only works from the
Home Screen app (step 8), never from a Safari tab.

## Inviting people

From the ⚙️ screen, tap **Share invite link**. It sends a link with the code
already filled in, so they only pick a name.

Rotating the code stops new joins with the old one; people already in the chat
stay in.

---

## Deploying updates later

```bash
git pull
fly deploy
```

Changing a secret does not need a code change:

```bash
fly secrets set ADMIN_PASSWORD_HASH='<new hash>'   # redeploys automatically
```

## Rolling back

The dependable way is to redeploy the previous commit:

```bash
git log --oneline -5      # find the commit you want
git checkout <commit>
fly deploy
```

`fly releases` lists what has been deployed. Recent flyctl versions also have
a rollback subcommand — `fly releases --help` will say whether yours does.

Rolling back reverts the code, not the database. That is safe here: every
migration only ever adds tables, so older code keeps working against a newer
schema.

## Troubleshooting

**Deploy fails at the release command.** The migration could not reach the
database. Check `fly logs` for `DATABASE_URL is not set.` or
`Migration failed:`, then `fly secrets list` to confirm what is actually set.
The failed version is rolled back automatically, so the app stays up.

**Every page returns 500, logs say `DATABASE_URL is not set`.** The secret is
missing or was set on a different app. `fly secrets list` and check the app
name at the top of `fly.toml`.

**Logs say `SESSION_SECRET must be set to at least 32 characters`.** The value
was empty or too short. Regenerate with `openssl rand -base64 48`.

**Admin password is rejected even though it is right.** Almost always the
shell ate the hash. Re-set it in **single** quotes:
`fly secrets set ADMIN_PASSWORD_HASH='$2b$12$...'`

**Logs say `Neither ADMIN_PASSWORD_HASH nor ADMIN_PASSWORD is set`.** Neither
secret made it to Fly. Set `ADMIN_PASSWORD_HASH`.

**No 🔔 in the header.** Either the VAPID secrets are not set — check with
`fly secrets list`, and `/api/push` returns `{"publicKey":null}` when they are
missing — or you are on iOS in a Safari tab instead of the installed app.

**Subscribing to notifications fails with 503.** The server returns
`Push is not configured.` when the VAPID keys are absent. Set all three and
redeploy.

**Notifications don't arrive on iPhone.** The app must be opened from the Home
Screen icon, not Safari. If you enabled notifications in a tab before
installing, re-enable them inside the installed app.

**First load after a quiet spell is slow.** Expected — the machine suspends
when idle and wakes on the next request. See
[Cost](README.md#cost) to trade that for an always-on machine.

**Migrations misbehave on Neon's pooled endpoint.** Rare, but if the release
command errors oddly, run it once against Neon's **direct** (non-pooled)
connection string from your laptop:
`DATABASE_URL='<direct url>' npm run db:migrate`, then deploy again. Keep the
pooled URL as the app's `DATABASE_URL`.

## Running it locally

See [Local development](README.md#local-development) in the README. Note that
the service worker only registers in production builds, so notifications and
offline support do not work under `npm run dev`.
