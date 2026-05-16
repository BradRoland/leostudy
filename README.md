# LEO Study

LEO Study is a California POST-style study platform for academy recruits, cadets, and officers. The repo currently contains:

- `leo-study-web/` — the production React/Supabase web app.
- `CodeReady/` — the earlier iOS SwiftUI prototype.

Most active development and deployment happens in `leo-study-web/`.

## Fast Web App Setup

```bash
cd leo-study-web
npm ci
cp .env.example .env
npm run dev
```

Local dev URL:

```text
http://localhost:5173
```

## Database Setup

The web app now uses one fresh-project Supabase baseline migration instead of the long historical migration chain:

```text
leo-study-web/supabase/migrations/00000000000000_leo_study_baseline.sql
```

Use that file on a brand-new Supabase project only. Do not run it on an existing production database with real user data.

### Supabase SQL Editor

1. Create/open a Supabase project.
2. Open `SQL Editor`.
3. Paste the full baseline migration.
4. Run it once.
5. Sync study content from the web app folder:

```bash
cd leo-study-web
npm run content:sync
```

### Supabase CLI

```bash
cd leo-study-web
supabase login
supabase link --project-ref YOUR_PROJECT_REF
supabase db push
npm run content:sync
```

## What the Database Includes

The baseline migration creates the full production schema:

- Auth-linked profiles, avatars, supporter tiers, profile decorations, XP/levels, and user progress.
- Remote-editable `content_items` for PC/HS/VC/scenario content.
- TMAS study/practice support tables where needed.
- Global chat, reactions, reports, and bug reports.
- Realtime 1v1 rooms, players, invites, ready-up, scoring, rematches, and results.
- All-time and weekly leaderboards.
- Owner roles, owner moderation RPCs, site banner/settings, and reset/cleanup RPCs.
- Supabase Storage `avatars` bucket.
- RLS policies, function grants, and Realtime publication setup.

## Deployment

The detailed deployment guide is in:

```text
leo-study-web/README.md
```

Core production flow:

```bash
cd leo-study-web
npm ci
npm run build
```

Deploy the `leo-study-web/dist` output to Vercel or your own hardware. `leo-study-web/vercel.json` already contains SPA rewrites plus API routes for:

```text
/api/health
/api/stripe/webhook
```

## Required Web Environment Variables

```bash
VITE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_OR_PUBLISHABLE_KEY
VITE_CONTENT_SOURCE=local
VITE_AUTH_REDIRECT_BASE_URL=http://localhost:5173
VITE_OWNER_EMAIL=owner@example.com
VITE_SUPABASE_AVATAR_BUCKET=avatars
```

Private script/webhook variables:

```bash
SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
SUPABASE_SERVICE_ROLE_KEY=YOUR_SERVICE_ROLE_KEY
STRIPE_SECRET_KEY=sk_live_or_test_REPLACE_ME
STRIPE_WEBHOOK_SECRET=whsec_REPLACE_ME
```

Never commit `.env`, service-role keys, Stripe secrets, or database passwords.

## Owner Bootstrap

After the first owner creates/signs into a Supabase Auth account:

```bash
cd leo-study-web
npm run owner:bootstrap -- owner@example.com
```

## Hardware Hosting

A simple self-hosted web deployment:

```bash
cd leo-study-web
npm ci
npm run build
npm run preview -- --host 0.0.0.0 --port 4173
```

Put Nginx, Caddy, or Cloudflare Tunnel in front of port `4173`, set `VITE_AUTH_REDIRECT_BASE_URL` to the public site origin, then add the public `/auth/callback` URL to Supabase Auth redirect URLs.

For the optional standalone Stripe webhook:

```bash
cd leo-study-web
npm run pm2:webhook:start
npm run pm2:webhook:logs
```

## Cleanup Notes

The web app setup has been simplified:

- Old incremental Supabase migrations were squashed into one baseline migration.
- Old local notes, temp reports, tracked Supabase CLI cache, and unused scaffold assets were removed from Git.
- New ignore rules keep local Playwright, Vercel, database cache, and generated research artifacts out of commits.

## Disclaimer

LEO Study is not an official POST product or official POST exam bank. It is designed to support study and practice; users should still rely on current official academy materials and California law.
