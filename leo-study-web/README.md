# LEO Study Web

LEO Study is a California POST-style study platform for academy recruits, cadets, and officers. It combines California code study, TMAS study guides, scenario practice, games, realtime 1v1 competition, profiles, leveling, leaderboards, chat, and optional Stripe support tiers.

The repository is set up so a new developer can clone it, create one Supabase database, run one baseline migration, sync the bundled study content, and deploy.

## Features

- California law library: Penal Code, HS Code, Vehicle Code, custom study items.
- Study tools: quick quiz, flashcards, LD study guide, scenario training, and TMAS practice tests.
- TMAS prep: TMAS 1/2/3 study-guide coverage, TMAS 2 practice bank, TMAS 3 practice bank, and focused LD 15/16/20 practice tests.
- Games: matching, code blaster, speed-style study modes, high scores, and weekly leaderboards.
- Realtime 1v1: invites, ready-up countdown, quiz/matching races, rematches, spectators, waiting-room chat, and result sync.
- User systems: Supabase Auth, profiles, avatars, avatar decorations, XP/levels, active/idle status, global chat, bug reports, owner moderation.
- Support tiers: optional Stripe tip tiers with profile/supporter perks.

## Tech Stack

- React 19 + TypeScript
- Vite 7
- Supabase Auth, Postgres, Realtime, Storage, and `pg_cron`
- Stripe Checkout + webhook
- Vercel API routes for production webhook/health checks
- PM2 optional for hardware/self-hosted webhook processes

## Repository Layout

```text
api/                         Vercel API functions
backend/                     Owner/content/Stripe utility scripts
public/                      Static icons, avatars, and code seed data
src/components/              Main UI modules
src/content/                 Study content, scenarios, study guides, practice tests
src/lib/                     Supabase and profile decoration helpers
supabase/migrations/         One fresh-project baseline migration
vercel.json                  Vercel SPA/API routing
vite.config.ts               Local/dev server config
```

## Requirements

- Node.js 22 or newer. Supabase has announced future Node 20 support removal, so use Node 22+ for new installs.
- npm 10+.
- A Supabase project.
- Optional: Supabase CLI if you prefer `supabase db push` over the SQL editor.
- Optional: Stripe account for support tiers.
- Optional: PM2 + Nginx/Caddy/Cloudflare Tunnel for hardware deployment.

## Quick Start

```bash
git clone <your-repo-url>
cd leo-study-web
npm ci
cp .env.example .env
npm run dev
```

The local dev server defaults to:

```text
http://localhost:5173
```

## Environment Variables

Frontend variables are exposed to the browser and must start with `VITE_`.

```bash
VITE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_OR_PUBLISHABLE_KEY
VITE_CONTENT_SOURCE=local
VITE_AUTH_REDIRECT_BASE_URL=http://localhost:5173
VITE_OWNER_EMAIL=owner@example.com
VITE_SUPABASE_AVATAR_BUCKET=avatars
VITE_STRIPE_LINK_TIER2=https://buy.stripe.com/YOUR_TIER2_LINK
VITE_STRIPE_LINK_TIER5=https://buy.stripe.com/YOUR_TIER5_LINK
VITE_STRIPE_LINK_TIER10=https://buy.stripe.com/YOUR_TIER10_LINK
```

Private server/script variables must never be exposed in client code:

```bash
SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
SUPABASE_SERVICE_ROLE_KEY=YOUR_SERVICE_ROLE_KEY
STRIPE_SECRET_KEY=sk_live_or_test_REPLACE_ME
STRIPE_WEBHOOK_SECRET=whsec_REPLACE_ME
STRIPE_WEBHOOK_PORT=8788
STRIPE_PRICE_ID_TIER2=price_REPLACE_TIER2
STRIPE_PRICE_ID_TIER5=price_REPLACE_TIER5
STRIPE_PRICE_ID_TIER10=price_REPLACE_TIER10
STRIPE_PAYMENT_LINK_ID_TIER2=plink_REPLACE_TIER2
STRIPE_PAYMENT_LINK_ID_TIER5=plink_REPLACE_TIER5
STRIPE_PAYMENT_LINK_ID_TIER10=plink_REPLACE_TIER10
```

`VITE_CONTENT_SOURCE` options:

- `local`: load bundled JSON/TypeScript content from the repo. Best for first local startup.
- `supabase`: load code/scenario content from the `content_items` table. Best for production with owner editing.

## Database Setup

The old migration history has been squashed into one fresh-project migration:

```text
supabase/migrations/00000000000000_leo_study_baseline.sql
```

Use this on a brand-new Supabase project. Do not run it against an existing production database with real user data.

### Option A: Supabase SQL Editor

1. Open your Supabase project.
2. Go to `SQL Editor`.
3. Open `supabase/migrations/00000000000000_leo_study_baseline.sql` locally.
4. Paste the full file into the SQL editor and run it once.
5. Confirm the `avatars` storage bucket exists.
6. Continue with `Sync Study Content`.

### Option B: Supabase CLI

```bash
supabase login
supabase link --project-ref YOUR_PROJECT_REF
supabase db push
```

Because the repository now contains a single migration file, `supabase db push` applies the whole schema in one pass on a fresh project.

### What the Baseline Migration Creates

Core profile/progress tables:

- `profiles`: usernames, avatars, supporter tier, agency, bio, activity.
- `app_state`: progress, high scores, profile decorations, XP snapshots, study stats.
- `user_roles`: owner role assignment for content editing and moderation.
- `banned_users`: owner-managed account restrictions.

Study/content tables:

- `content_items`: remote-editable PC/HS/VC/scenario content.
- `leaderboard`: all-time game scores.
- `weekly_leaderboard`: weekly rankings.
- `game_attempt_history`: recent game/study attempt history.

Realtime/community tables:

- `public_messages`: global chat messages.
- `public_message_reactions`: chat reactions.
- `public_message_reports`: chat reports for owner review.
- `bug_reports`: in-app bug reports.
- `app_settings`: site banner and agency settings.

1v1 tables:

- `rooms`: active/completed duel rooms.
- `room_players`: player state, score, readiness, current round.
- `room_results`: final duel placements.
- `duel_invites`: realtime 1v1 invitations.
- `duel_room_messages`: waiting-room chat.
- `duel_player_stats`: win/loss/streak stats used by leaderboards and XP.

Storage and database behavior:

- Creates the public `avatars` bucket.
- Enables RLS on app tables and adds policies for public reads, self writes, owner actions, and 1v1 room access.
- Adds Realtime publication entries for chat, 1v1 rooms, invites, and player/result sync.
- Adds RPC functions for room creation, invites, ready-up, submissions, forfeit, rematch, leaderboard updates, owner moderation, public-room listing, online user count, and cleanup.
- Adds `pg_cron` cleanup for short-lived public chat history.

## Sync Study Content

The baseline migration creates the database structure. Local study content lives in `src/content` and can be pushed into Supabase with:

```bash
npm run content:sync
```

Run this after the database migration if production uses:

```bash
VITE_CONTENT_SOURCE=supabase
```

The sync script upserts:

- `src/content/pc.json`
- `src/content/hs.json`
- `src/content/vc.json`
- `src/content/custom.json`
- `src/content/scenarios.json`
- `src/content/scenarios-tmas2.json`

Practice-test and study-guide TypeScript files are bundled into the frontend build and deploy through Git, not through `content:sync`.

## Create the First Owner

1. Create or sign up the owner user in Supabase Auth.
2. Set `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and `VITE_OWNER_EMAIL`.
3. Run:

```bash
npm run owner:bootstrap -- owner@example.com
```

Use `--force` only if you intentionally want to replace the existing owner assignment.

Owners can edit content, manage banners/settings, review bug reports, and moderate accounts.

## Local Development

```bash
npm run dev
npm run build
npm run preview
npm run lint
```

Useful local URLs:

```text
http://localhost:5173
http://127.0.0.1:5173
```

`vite.config.ts` also allows the existing dev domains used by this project, including `dev.180.academy`.

## Deploy to Vercel

1. Create a Vercel project from this repository.
2. Add all required `VITE_` variables.
3. Add private server variables for Stripe/content scripts only where needed.
4. Set build command:

```bash
npm run build
```

5. Set output directory:

```text
dist
```

6. Deploy.

`vercel.json` already provides SPA routing plus these API rewrites:

```text
/health -> /api/health
/stripe/webhook -> /api/stripe/webhook
```

Production health check:

```text
https://YOUR_DOMAIN/api/health
```

## Deploy on Your Own Hardware

A simple hardware deployment uses Vite build output behind a reverse proxy.

```bash
npm ci
npm run build
npm run preview -- --host 0.0.0.0 --port 4173
```

Recommended production shape:

1. Put Nginx, Caddy, or Cloudflare Tunnel in front of port `4173`.
2. Terminate HTTPS at the proxy/tunnel.
3. Set your public URL in Supabase Auth redirect URLs.
4. Run the Stripe webhook process separately if using Stripe:

```bash
npm run pm2:webhook:start
npm run pm2:webhook:logs
```

The included `ecosystem.config.cjs` runs the standalone webhook with PM2.

## Stripe Support Tiers

The app uses optional tip-style tiers:

- `$2`
- `$5`
- `$10`

Users are not hard-paywalled. Tiers can unlock perks such as profile flair, cosmetics, and support recognition.

### Stripe Setup

1. Create Stripe Payment Links for each tier.
2. Add public links to the `VITE_STRIPE_LINK_*` variables.
3. Add private Stripe keys and price/payment-link IDs to Vercel or your hardware environment.
4. Configure a webhook endpoint:

```text
https://YOUR_DOMAIN/api/stripe/webhook
```

5. Subscribe to:

```text
checkout.session.completed
```

The webhook upgrades `profiles.supporter_tier` using `client_reference_id` first and customer email fallback second.

For local webhook testing:

```bash
npm run stripe:webhook
```

Local endpoint:

```text
http://localhost:8788/stripe/webhook
```

## Content Editing Workflow

If you change local JSON code/scenario files:

```bash
npm run build
npm run content:sync
```

If you change practice tests, TMAS scenarios, study-guide logic, UI, games, or app behavior:

```bash
npm run build
git add .
git commit -m "Describe the update"
git push origin main
```

`content:sync` does not publish TypeScript practice-test logic. Those files deploy through the frontend build.

## Database Maintenance

Reset global game rankings without wiping user study progress:

```sql
select public.reset_global_leaderboard_only();
```

Public chat retention cleanup is installed by the baseline migration. Verify the cron job with:

```sql
select jobid, jobname, schedule, command
from cron.job
where jobname = 'public_chat_cleanup_48h_hourly';
```

Run cleanup manually:

```sql
select public.cleanup_public_messages_48h();
```

## Troubleshooting

### Content editor says the source is unavailable

- Confirm the baseline migration ran successfully.
- Confirm `content_items` exists.
- Confirm `VITE_CONTENT_SOURCE=supabase` only after running `npm run content:sync`.
- Confirm the user has an owner role if editing content.

### Users cannot sign in or get logged out after refresh

- Confirm `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` match the same Supabase project.
- Add your deployed domain, local URL, and `/auth/callback` URL to Supabase Auth redirect URLs.
- Set `VITE_AUTH_REDIRECT_BASE_URL` to the public site origin in production, for example `https://example.com`.
- Avoid mixing `.env` values from different projects.

### 1v1 invites or rooms do not update live

- Confirm Realtime is enabled for the project.
- Confirm the baseline migration completed its Realtime publication statements.
- Check browser console/network logs for Supabase Realtime connection errors.

### Stripe tier does not update

- Confirm the webhook endpoint is reachable.
- Confirm `STRIPE_WEBHOOK_SECRET` matches the endpoint.
- Confirm `SUPABASE_SERVICE_ROLE_KEY` is set only on the server/webhook environment.

## Security Notes

- Never commit `.env`, service-role keys, Stripe secrets, or Supabase database passwords.
- Use the service-role key only in trusted backend scripts or API routes.
- RLS policies in the baseline are required; do not remove them to “fix” client errors.
- Run the baseline only on fresh projects. For an existing production database, create a backup and write a targeted migration instead.

## Deployment Checklist

Before a production push:

1. `npm run build`
2. `npm run lint` when practical
3. `npm run content:sync` if JSON/scenario content changed and production uses Supabase content
4. Test sign-in, study guide, practice test, 1v1, chat, leaderboards, and Stripe health if touched
5. Commit only intended files
6. Push `main`

## Disclaimer

LEO Study is not an official POST product or official POST exam bank. The study guides and tests are designed to feel POST-style and help users prepare, but users should still rely on official academy materials and current California law.
