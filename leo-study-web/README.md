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
- `VITE_SUPABASE_AVATAR_BUCKET` (default: `avatars`)
- `VITE_STRIPE_LINK_TIER2`
- `VITE_STRIPE_LINK_TIER5`
- `VITE_STRIPE_LINK_TIER10`

3. Run SQL bootstrap in Supabase SQL editor:

- `/Users/jank/Documents/New project/leo-study-web/supabase/schema.sql`
  - Includes `profiles.bio`, `profiles.agency`, and `app_state.profile_details` for profile details.
  - Includes `leaderboard.match_duration` and `leaderboard.match_filter` for categorized matching leaderboards.

4. Run app:

```bash
npm run dev
```

- Local: `http://localhost:5173`

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
