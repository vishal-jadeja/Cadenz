# Cadenz â€” Step 10: Deploy

## Overview

Step 10 takes the fully-built app (Steps 1â€“9) to production. No new
features are added. The goal is a clean, reproducible deployment that
any developer can follow from a fresh checkout.

```
Phase 10.1  â†’  Production config (next.config.ts, vercel.json)   âœ…
Phase 10.2  â†’  Environment variable reference (.env.example)      âœ…
Phase 10.3  â†’  Vercel deployment                                   â¬œ
Phase 10.4  â†’  Supabase production schema                          â¬œ
Phase 10.5  â†’  Upstash Redis verification                          â¬œ
Phase 10.6  â†’  Trigger.dev cloud deployment                        â¬œ
Phase 10.7  â†’  OAuth app production credentials                    â¬œ
Phase 10.8  â†’  Brevo domain verification                           â¬œ
Phase 10.9  â†’  Smoke test checklist                                â¬œ
```

---

## Phase 10.1 â€” Production config

### `next.config.ts`

Adds security headers and image remote patterns. No functional changes.

Security headers applied to every response:

- `Strict-Transport-Security` â€” force HTTPS, preload-eligible
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: SAMEORIGIN`
- `X-XSS-Protection: 1; mode=block`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy` â€” camera, microphone, geolocation all blocked

Image remote patterns (Next.js Image component):

- `avatars.githubusercontent.com` â€” GitHub avatars
- `lh3.googleusercontent.com` â€” Google/Gmail profile photos
- `media.licdn.com` â€” LinkedIn profile photos

### `vercel.json`

Minimal config:

- Framework: nextjs (tells Vercel build system)
- API function max duration: 30s (default is 10s, too short for
  batch invite jobs and OAuth token exchanges)
- Trigger.dev tasks run on their own cloud â€” no Vercel functions needed

---

## Phase 10.2 â€” Environment variable reference

`.env.example` documents every env var required to run Cadenz.
Copy it to `.env.local` for local dev, populate all values.

---

## Phase 10.3 â€” Vercel deployment

### Steps

1. Push the repo to GitHub (if not already done).

2. Import the project at vercel.com/new:
   - Select the GitHub repo
   - Framework: Next.js (auto-detected)
   - Root directory: `.` (default)
   - Build command: `next build`
   - Output directory: `.next`

3. Set all environment variables from `.env.example`.
   Do NOT set `NEXT_PUBLIC_APP_URL` to localhost â€” set it to the
   Vercel domain (`https://your-project.vercel.app`) or custom domain.

4. Deploy.

5. After first deploy, add the production domain in Vercel â†’ Settings â†’
   Domains. Update `NEXT_PUBLIC_APP_URL` to match.

### Environment variable notes

- `AUTH_SECRET`: generate with `openssl rand -hex 32`
- `ENCRYPTION_KEY`: generate with `openssl rand -hex 32`
- `NEXT_PUBLIC_APP_URL`: must be the exact production URL including
  protocol, no trailing slash

---

## Phase 10.4 â€” Supabase production schema

If using a separate Supabase project for production (recommended):

1. Create a new project at app.supabase.com.
2. In the SQL editor, run `supabase/schema.sql` top-to-bottom.
3. Then run `supabase/phase8_schema.sql`.
4. Enable RLS on all tables â€” the schema includes the RLS policies
   but verify them in Table Editor â†’ each table â†’ RLS enabled.
5. Copy `NEXT_PUBLIC_SUPABASE_URL` and keys from Supabase â†’ Settings
   â†’ API. Use the new naming convention this project requires:
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` = anon/public key
   - `SUPABASE_SECRET_KEY` = service_role key

### Verify functions exist

Run this in the SQL editor to confirm all Postgres functions are present:

```sql
SELECT routine_name
FROM information_schema.routines
WHERE routine_type = 'FUNCTION'
  AND routine_schema = 'public'
ORDER BY routine_name;
```

Expected: `accept_invite_account`, `generate_referral_code`,
`get_admin_waitlist`, `get_waitlist_position`.

### Create system_config defaults

```sql
INSERT INTO system_config (key, value)
VALUES ('invite_cap', '100')
ON CONFLICT (key) DO NOTHING;
```

---

## Phase 10.5 â€” Upstash Redis

1. Create a database at console.upstash.com (free tier is sufficient).
2. Select the REST API tab.
3. Copy `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` into
   Vercel environment variables.
4. No other setup needed â€” rate limiters and cache helpers initialize
   lazily on first request.

Verify: hit any admin route in production and check Upstash console
for incoming commands. The `admin:stats` key should appear after the
first admin dashboard load.

---

## Phase 10.6 â€” Trigger.dev cloud deployment

Trigger.dev v3 tasks must be deployed to the Trigger.dev cloud
separately from Vercel. They run on Trigger.dev's own infrastructure.

### Steps

1. Sign in at cloud.trigger.dev, create a project.
2. Copy the project ID (`proj_...`) â†’ `TRIGGER_PROJECT_ID` env var.
3. Copy the secret key (`tr_prod_...`) â†’ `TRIGGER_SECRET_KEY` env var.
4. Update `trigger.config.ts` if the project ID was hard-coded.
5. Deploy tasks:
   ```bash
   npx trigger.dev@latest deploy
   ```
   This bundles and uploads all tasks in `src/trigger/`.
6. In the Trigger.dev dashboard, verify all 5 tasks appear:
   - `github-backfill`
   - `send-batch-invites`
   - `cleanup-expired-tokens`
   - `daily-intelligence`
   - `topic-extraction`
7. `cleanup-expired-tokens` is a scheduled task (cron `0 2 * * *`).
   Verify the schedule is registered in Trigger.dev â†’ Schedules tab.

### Trigger.dev access to Supabase

Trigger.dev tasks need the same Supabase and email env vars.
Set them in Trigger.dev â†’ Project â†’ Environment Variables:

```
SUPABASE_SECRET_KEY
NEXT_PUBLIC_SUPABASE_URL
BREVO_API_KEY
EMAIL_FROM
NEXT_PUBLIC_APP_URL
UPSTASH_REDIS_REST_URL
UPSTASH_REDIS_REST_TOKEN
```

---

## Phase 10.7 â€” OAuth app production credentials

Each OAuth provider needs its own production app with the production
callback URL. Local OAuth credentials will not work in production
(redirect URIs must match exactly).

### Callback URL pattern

`https://YOUR_PRODUCTION_DOMAIN/api/connections/[platform]/callback`

### GitHub

1. github.com â†’ Settings â†’ Developer settings â†’ OAuth Apps â†’ New
2. Homepage URL: `https://YOUR_DOMAIN`
3. Authorization callback URL:
   `https://YOUR_DOMAIN/api/connections/github/callback`
4. Copy client ID â†’ `GITHUB_CLIENT_ID`
5. Generate a new client secret â†’ `GITHUB_CLIENT_SECRET`

### Google (Gmail)

1. console.cloud.google.com â†’ APIs & Services â†’ Credentials
2. Create OAuth 2.0 Client ID (Web application)
3. Authorized redirect URIs:
   `https://YOUR_DOMAIN/api/connections/gmail/callback`
4. Enable the Gmail API in the project
5. Copy â†’ `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`

### LinkedIn

1. developer.linkedin.com â†’ My apps â†’ Create app
2. Products: Sign In with LinkedIn using OpenID Connect + Share on LinkedIn
3. Authorized redirect URL:
   `https://YOUR_DOMAIN/api/connections/linkedin/callback`
4. Copy â†’ `LINKEDIN_CLIENT_ID`, `LINKEDIN_CLIENT_SECRET`

### X (Twitter)

1. developer.twitter.com â†’ Projects & Apps â†’ New app
2. App permissions: Read and Write
3. Callback URL:
   `https://YOUR_DOMAIN/api/connections/x/callback`
4. Copy client ID and secret â†’ `X_CLIENT_ID`, `X_CLIENT_SECRET`

### Medium

1. medium.com/me/settings â†’ Security and apps â†’ Developers â†’ New app
2. Callback URL:
   `https://YOUR_DOMAIN/api/connections/medium/callback`
3. Copy â†’ `MEDIUM_CLIENT_ID`, `MEDIUM_CLIENT_SECRET`

---

## Phase 10.8 â€” Brevo domain verification

Cadenz sends transactional email from `EMAIL_FROM` via Brevo.
Sending from an unverified domain will result in high bounce rates.

### Steps

1. app.brevo.com â†’ Senders, Domains & IPs â†’ Domains â†’ Add a domain
2. Enter your sending domain (the domain part of `EMAIL_FROM`)
3. Add the DNS records Brevo provides:
   - SPF record (TXT): `v=spf1 include:spf.brevo.com ~all`
   - DKIM record (TXT): provided by Brevo
   - DMARC record (TXT): `v=DMARC1; p=none` (tighten later)
4. Click Verify â€” DNS propagation can take up to 24h
5. Once verified, test with Brevo's email test tool

Note: `EMAIL_FROM` must match the verified domain exactly.

---

## Phase 10.9 â€” Smoke test checklist

Run through this after deploying to production. Mark each item.

### Public routes

- [ ] `GET /` â€” landing page loads, waitlist form visible
- [ ] `POST /api/waitlist/join` â€” submission succeeds, email received
- [ ] `GET /api/waitlist/count` â€” returns a number
- [ ] `GET /ref/[code]` â€” redirects correctly, increments referral

### Auth routes

- [ ] `/login` â€” login page loads
- [ ] Invite email â†’ `/invite/[token]` â€” form loads, account created
- [ ] Login with created account â€” redirects to `/onboarding`

### Onboarding

- [ ] Onboarding wizard loads, 4 steps work
- [ ] Connect GitHub â†’ OAuth flow completes â†’ redirect back â†’ GitHub shown as connected
- [ ] Completing onboarding â†’ redirects to `/dashboard`

### Dashboard

- [ ] `/dashboard` loads with real data (or empty state if no activity)
- [ ] Heatmap renders
- [ ] Streak counter is correct

### Admin

- [ ] `/admin` loads for admin account
- [ ] Admin can send invite â†’ email received â†’ invite token valid

### Background jobs

- [ ] Trigger.dev dashboard shows tasks as deployed
- [ ] `cleanup-expired-tokens` schedule shows next run at 2am UTC
- [ ] Manual trigger of `send-batch-invites` â†’ invite sent

### Security

- [ ] Response headers include HSTS, X-Content-Type-Options, etc.
- [ ] `/admin` returns redirect for non-admin user, not 404
- [ ] `/dashboard` redirects to `/login` for unauthenticated user

---

## Files created/modified in this step

| File                        | Action                                     |
| --------------------------- | ------------------------------------------ |
| `Cadenz-step10-deploy.md` | New spec (this file)                       |
| `vercel.json`               | New                                        |
| `.env.example`              | New                                        |
| `next.config.ts`            | Modified â€” security headers + image config |
| `CLAUDE.md`                 | Updated â€” Step 10 status                   |
| `README.md`                 | Updated â€” current status + env var section |
