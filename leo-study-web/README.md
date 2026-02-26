# LEO Study Web

React + Supabase app for California code study.

## Included

- Email sign-in/sign-up
- Google OAuth sign-in (via Supabase Auth)
- First-run profile setup (username + avatar upload)
- Persisted user progress (`app_state`)
- Persisted leaderboard (`leaderboard`)
- Existing study, flashcard, and matching game features

## Setup

1. Install dependencies:

```bash
npm install
```

2. Copy env and fill values from your Supabase project:

```bash
cp .env.example .env
```

Required vars:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_CONTENT_SOURCE` (`local` or `supabase`, default: `local`)
- `VITE_OWNER_EMAIL` (optional bootstrap convenience)
- `VITE_SUPABASE_AVATAR_BUCKET` (default: `avatars`)
- `VITE_STRIPE_LINK_TIER2`
- `VITE_STRIPE_LINK_TIER5`
- `VITE_STRIPE_LINK_TIER10`

3. Run SQL bootstrap in Supabase SQL editor:

- `/Users/jank/Documents/New project/leo-study-web/supabase/schema.sql`
  - Includes `profiles.bio`, `profiles.agency`, and `app_state.profile_details` for profile details.
  - Includes `leaderboard.match_duration` and `leaderboard.match_filter` for categorized matching leaderboards.
- `/Users/jank/Documents/New project/leo-study-web/supabase/migrations/20260215_owner_roles_and_content_items.sql`
  - Adds `user_roles` + `content_items` + owner-only RLS for content editing.
- `/Users/jank/Documents/New project/leo-study-web/supabase/migrations/20260222_public_chat_retention_cleanup.sql`
  - Adds hourly server-side cleanup for `public_messages` rows older than 48 hours.
- `/Users/jank/Documents/New project/leo-study-web/supabase/migrations/20260224_owner_account_moderation.sql`
  - Adds owner ban/delete account tools, removes banned users from leaderboards, and blocks banned users from writing progress/scores.
- `/Users/jank/Documents/New project/leo-study-web/supabase/migrations/20260224_owner_account_moderation_rpc_hotfix.sql`
  - Adds a stable owner moderation RPC (`owner_moderate_account_json`) and refreshes PostgREST schema cache.
- `/Users/jank/Documents/New project/leo-study-web/supabase/migrations/20260226_leaderboard_only_reset.sql`
  - Adds owner-only `reset_global_leaderboard_only()` so global leaderboard resets do not wipe user progress stats.
- `/Users/jank/Documents/New project/leo-study-web/supabase/migrations/20260226_leaderboard_only_reset_sql_editor_fix.sql`
  - Allows the same reset function to run from Supabase SQL editor (`postgres`) while keeping owner checks for normal app users.
- `/Users/jank/Documents/New project/leo-study-web/supabase/migrations/20260226_leaderboard_only_reset_include_high_scores.sql`
  - Extends the reset function to clear `leaderboard` + `app_state.high_scores` while preserving study progress and profile stats.
- `/Users/jank/Documents/New project/leo-study-web/supabase/migrations/20260226_app_state_clobber_guard.sql`
  - Adds a DB trigger that prevents accidental overwrite of non-empty `app_state` progress with empty/default values.

4. Run app:

```bash
npm run dev
```

- Local: `http://localhost:5173`

## Safe leaderboard reset (no user stat wipe)

Run this in Supabase SQL editor when you only want to clear leaderboard rankings:

```sql
select public.reset_global_leaderboard_only();
```

This preserves:
- `app_state` (study progress + mastery stats)
- `duel_player_stats` (1v1 W/L + streak stats)
- `game_attempt_history`

And it clears:
- `leaderboard` rows
- `app_state.high_scores` for all users

## How to add/edit questions locally

Local content lives in:

- `/Users/jank/Documents/New project/leo-study-web/src/content/pc.json`
- `/Users/jank/Documents/New project/leo-study-web/src/content/hs.json`
- `/Users/jank/Documents/New project/leo-study-web/src/content/vc.json`
- `/Users/jank/Documents/New project/leo-study-web/src/content/scenarios.json`
- `/Users/jank/Documents/New project/leo-study-web/src/content/custom.json` (for future categories)

Set `.env`:

```bash
VITE_CONTENT_SOURCE=local
```

Code-item shape (`pc/hs/vc/custom`):

```json
{
  "id": "stable-id",
  "category": "pc",
  "title": "Short label",
  "question": "Prompt text",
  "answer": "PC 148(a)(1)",
  "tags": ["optional", "tags"],
  "difficulty": "optional",
  "codeSection": "PC 148(a)(1)",
  "explanation": "optional",
  "sourceUrl": "optional"
}
```

Scenario shape (`scenarios.json`):

```json
{
  "id": "scenario-id",
  "category": "scenario",
  "title": "Scenario label",
  "scenario": "Story text",
  "questions": ["Follow-up question 1", "Follow-up question 2"],
  "expectedAnswer": "optional expected answer",
  "keyPoints": ["optional key point 1", "optional key point 2"]
}
```

Validation behavior:
- Missing required fields are logged as warnings in browser console.
- Invalid items are skipped and will not crash the app.

## Owner bootstrap + Content Editor (remote editable)

1. Set env and run migrations.
2. Assign initial owner (one-time):

```bash
npm run owner:bootstrap -- owner@email.com
```

- If an owner already exists, use `--force` only when you intentionally want to reassign.
- This command uses `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`.

3. Switch content source:

```bash
VITE_CONTENT_SOURCE=supabase
```

4. Sign in as owner and open `Profile` (Settings). You will see `Content Editor`:
- Create/edit/delete content items.
- Categories are flexible (`pc`, `hs`, `vc`, `scenario`, or any new category string).
- Non-owner accounts can read published content but cannot mutate content (enforced by RLS).

To keep Supabase and local files in sync:

- Push local files to Supabase:
```bash
npm run content:sync
```
- Pull Supabase content back into local files:
```bash
npm run content:pull
```

## Supabase Google auth

In Supabase dashboard:

- Auth → Providers → Google → Enable
- Add Google OAuth Client ID/Secret
- Add redirect URL: `http://localhost:5173`

## Tier payments (easy setup)

1. In Stripe, create three Payment Links (`$2`, `$5`, `$10`).
2. Paste each link into the matching env var:
   - `VITE_STRIPE_LINK_TIER2`
   - `VITE_STRIPE_LINK_TIER5`
   - `VITE_STRIPE_LINK_TIER10`
3. In the app, open Profile → Support Tier and tap `Upgrade with Stripe`.

## Tier auto-upgrade (Stripe webhook)

This project includes a webhook server that upgrades `profiles.supporter_tier` automatically when Stripe checkout succeeds.

1. Add backend webhook env vars:
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `STRIPE_SECRET_KEY`
   - `STRIPE_WEBHOOK_SECRET`
   - `STRIPE_PRICE_ID_TIER2`
   - `STRIPE_PRICE_ID_TIER5`
   - `STRIPE_PRICE_ID_TIER10`
   - Optional fallback: `STRIPE_PAYMENT_LINK_ID_TIER2`, `STRIPE_PAYMENT_LINK_ID_TIER5`, `STRIPE_PAYMENT_LINK_ID_TIER10`
2. Start webhook server:

```bash
npm run stripe:webhook
```

3. In Stripe Dashboard → Developers → Webhooks:
   - Add endpoint: `https://<your-public-domain>/stripe/webhook`
   - Subscribe to event: `checkout.session.completed`
4. Use the signing secret from Stripe as `STRIPE_WEBHOOK_SECRET`.

Notes:
- The app adds `client_reference_id=<supabase_user_id>` and `prefilled_email` to Stripe checkout links automatically.
- The webhook uses `client_reference_id` first, then falls back to matching Stripe customer email to Supabase auth email.
- Tier detection supports metadata, price IDs, payment link IDs, and amount-based fallback.
- If you cannot expose `localhost:8788` directly, tunnel it (Cloudflare Tunnel, ngrok, etc.).

## Webhook test (manual verification)

Use this to verify auto-tier update without making a live charge.

1. Set one extra env var:
   - `STRIPE_TEST_TOKEN=<any-random-secret>`
2. Restart webhook server:

```bash
npm run stripe:webhook
```

3. Trigger test upgrade (replace values):

```bash
curl -X POST http://localhost:8788/stripe/test/apply \
  -H "content-type: application/json" \
  -H "x-test-token: YOUR_TEST_TOKEN" \
  -d '{"tier":"tier5","email":"YOUR_LOGIN_EMAIL"}'
```

Expected response: `{"ok":true,"userId":"...","tier":"tier5"}`

## Keep webhook running (PM2)

1. Install PM2 globally:

```bash
npm install -g pm2
```

2. Start webhook process:

```bash
npm run pm2:webhook:start
```

3. Save process list and enable restart on reboot:

```bash
pm2 save
pm2 startup
```

Useful commands:
- `npm run pm2:webhook:restart`
- `npm run pm2:webhook:logs`

## Owner moderation RPC troubleshooting

If the owner sees `Owner moderation RPC is missing in Supabase`, run:

- `/Users/jank/Documents/New project/leo-study-web/supabase/migrations/20260224_owner_moderation_public_rpc_repair.sql`
- `/Users/jank/Documents/New project/leo-study-web/supabase/migrations/20260224_owner_moderation_minimal_last_resort.sql`
- `/Users/jank/Documents/New project/leo-study-web/supabase/migrations/20260224_owner_moderation_rpc_v2.sql`
- `/Users/jank/Documents/New project/leo-study-web/supabase/migrations/20260224_owner_account_moderation_rpc_hotfix.sql`
- If that still fails, run:
  - `/Users/jank/Documents/New project/leo-study-web/supabase/migrations/20260224_owner_moderation_emergency_single_rpc.sql`

Then hard refresh the app.

## Public chat 48-hour retention

Run this migration in Supabase SQL editor:

- `/Users/jank/Documents/New project/leo-study-web/supabase/migrations/20260222_public_chat_retention_cleanup.sql`

What it does:

- Creates `public.cleanup_public_messages_48h()` as a `security definer` function.
- Schedules hourly cron job `public_chat_cleanup_48h_hourly` with `pg_cron`.
- Deletes rows from `public.public_messages` where `created_at < now() - interval '48 hours'`.
- Keeps cleanup server-side (no client cleanup code required).

Verify job + behavior:

```sql
select jobid, jobname, schedule, command
from cron.job
where jobname = 'public_chat_cleanup_48h_hourly';
```

```sql
select public.cleanup_public_messages_48h();
```
