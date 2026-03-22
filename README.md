# LEO Study Web

California POST study platform focused on penal codes, vehicle codes, health and safety codes, TMAS prep, scenarios, games, and user progress tracking.

This app is built for academy recruits, cadets, and officers who want a single place to study California law and prepare for POST-style testing.

## What the app includes

- California code library for:
  - Penal Code
  - Health & Safety Code
  - Vehicle Code
- Study modes:
  - quick quiz
  - flashcards
  - study guide by LD
  - scenario training
  - practice tests
- Games:
  - matching
  - speed / quiz-style modes
  - 1v1 modes
- TMAS support:
  - TMAS 1 scenario section
  - TMAS 2 scenario section
  - TMAS 2 practice test
  - focused LD `15 / 16 / 20` practice test
- POST-based study guide:
  - LD-by-LD guide
  - workbook + TTS-driven study content
  - TMAS coverage tagging
- User systems:
  - sign-in with email / Google
  - profiles and avatars
  - study time tracking
  - activity / presence status
  - leaderboards and weekly leaderboards
  - high scores by game
  - support tiers via Stripe

## Current TMAS / study features

- `Study Guide`
  - built around POST workbook and TTS coverage
  - broken down by LD
  - designed to count study time only while the user is actively interacting
- `Practice Test`
  - TMAS 2 full practice bank
  - focused LD `15 / 16 / 20` bank
  - randomized scenarios, randomized question order, randomized answer order
  - multiple-choice plus harder true/false follow-up items
  - LD coaching at the end of a run (`Proficient`, `Needs More Reps`, `Lacking`)
- `Scenarios`
  - TMAS 1 and TMAS 2 separated in the UI
  - TMAS 2 supports grouped sub-questions per scenario

## Tech stack

- React 19
- TypeScript
- Vite
- Supabase
- Stripe
- Vercel Analytics / Speed Insights

## Project structure

```text
src/
  components/                 main UI sections
  content/                    local study content and practice banks
  App.tsx                     app shell, routing, top-level state
  App.css                     main styling

backend/
  stripe-webhook.mjs          Stripe tier webhook server
  sync-content-items.mjs      push local content into Supabase
  pull-content-items.mjs      pull content back from Supabase

supabase/
  schema.sql                  base schema
  migrations/                 incremental DB updates
```

## Local content files

### Code and scenario content synced to Supabase

- `src/content/pc.json`
- `src/content/hs.json`
- `src/content/vc.json`
- `src/content/scenarios.json`
- `src/content/scenarios-tmas2.json`
- `src/content/custom.json`

### Study guide / practice-test source files

These are frontend-source files and are deployed by Git push, not by `content:sync`.

- `src/content/studyGuide.ts`
- `src/content/studyGuideOfficialResearch.ts`
- `src/content/studyGuideExamBlueprint.ts`
- `src/content/study-guide-post-research.json`
- `src/content/practiceTests.ts`
- `src/content/practiceTestFocusScenarios.ts`
- `src/content/practiceTestChoiceTuning.ts`
- `src/content/practiceTestTrueFalse.ts`

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Create `.env`

```bash
cp .env.example .env
```

### 3. Fill environment variables

#### Frontend

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_CONTENT_SOURCE`
  - `local` for local JSON content only
  - `supabase` to load remote `content_items`
- `VITE_OWNER_EMAIL` optional
- `VITE_SUPABASE_AVATAR_BUCKET` optional, default `avatars`
- `VITE_STRIPE_LINK_TIER2`
- `VITE_STRIPE_LINK_TIER5`
- `VITE_STRIPE_LINK_TIER10`

#### Backend / scripts

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `STRIPE_WEBHOOK_PORT`
- `STRIPE_TEST_TOKEN`
- `STRIPE_PRICE_ID_TIER2`
- `STRIPE_PRICE_ID_TIER5`
- `STRIPE_PRICE_ID_TIER10`

### 4. Set up Supabase

Run:

- `supabase/schema.sql`
- every SQL file in `supabase/migrations/` in chronological order

Important migrations include:

- `20260215_owner_roles_and_content_items.sql`
- `20260221_1v1_invites.sql`
- `20260222_public_chat_retention_cleanup.sql`
- `20260224_owner_account_moderation.sql`
- `20260226_app_state_clobber_guard.sql`
- `20260305_weekly_leaderboard.sql`
- `20260318_content_items_tmas_metadata.sql`

### 5. Start local dev

```bash
npm run dev
```

Default local URLs:

- `http://localhost:5173`
- `http://127.0.0.1:5173`

## Dev domain

`vite.config.ts` is already configured to allow:

- `dev.180.academy`
- `180.academy`
- `test.180.academy`
- `testt.180.academy`

If you are using the `dev.180.academy` Cloudflare tunnel workflow, the tunnel must point to the machine running Vite on port `5173`.

The app already supports HMR on `dev.180.academy` through the Vite server config.

## Common scripts

### App

```bash
npm run dev
npm run build
npm run preview
npm run lint
```

### Content sync

Push local code/scenario content into Supabase:

```bash
npm run content:sync
```

Pull `content_items` from Supabase back into local files:

```bash
npm run content:pull
```

### Owner bootstrap

```bash
npm run owner:bootstrap -- owner@email.com
```

### Stripe webhook

```bash
npm run stripe:webhook
```

### PM2 webhook management

```bash
npm run pm2:webhook:start
npm run pm2:webhook:restart
npm run pm2:webhook:logs
```

## Content workflow

### If you changed local JSON code/scenario content

Examples:

- Penal Code
- HS Code
- Vehicle Code
- scenario banks

Do both:

```bash
npm run build
npm run content:sync
```

Then commit and push.

### If you changed practice tests or study-guide logic in code

Examples:

- `practiceTests.ts`
- `practiceTestFocusScenarios.ts`
- `practiceTestChoiceTuning.ts`
- `practiceTestTrueFalse.ts`
- `StudyPracticeTestPage.tsx`
- study guide components / generators

These changes go live through Git deployment. They are not primarily driven by `content_items`, so the critical step is:

```bash
npm run build
git push origin main
```

`content:sync` is still safe to run, but it does not publish those source-driven practice-test logic changes by itself.

## Content shapes

### Code item

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

### Scenario item

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

## Owner / editor workflow

If `VITE_CONTENT_SOURCE=supabase`:

- owners can create and edit content in the app
- non-owners can read published content but cannot mutate content

Typical owner workflow:

1. apply schema + migrations
2. bootstrap owner
3. sign in as owner
4. use the in-app content editor

## Stripe support tiers

The app currently uses tip-style support tiers:

- `$2`
- `$5`
- `$10`

Users can unlock perks without making the app hard-paywalled.

### Payment links

Create three Stripe Payment Links and put them into:

- `VITE_STRIPE_LINK_TIER2`
- `VITE_STRIPE_LINK_TIER5`
- `VITE_STRIPE_LINK_TIER10`

### Auto-upgrade webhook

The webhook server upgrades `profiles.supporter_tier` after Stripe checkout success.

Start it with:

```bash
npm run stripe:webhook
```

Stripe webhook endpoint:

```text
https://<your-public-domain>/stripe/webhook
```

Subscribe to:

- `checkout.session.completed`

Notes:

- the app sends `client_reference_id=<supabase_user_id>` when opening Stripe checkout
- the webhook uses `client_reference_id` first and email fallback second
- tier detection supports metadata, price IDs, payment link IDs, and amount fallback

## Weekly leaderboard reset

If you need to clear rankings without wiping user progress:

```sql
select public.reset_global_leaderboard_only();
```

This preserves:

- `app_state`
- `duel_player_stats`
- `game_attempt_history`

And clears:

- `leaderboard`
- `app_state.high_scores`

## Troubleshooting

### Owner moderation RPC missing

Run, in order if needed:

- `supabase/migrations/20260224_owner_moderation_public_rpc_repair.sql`
- `supabase/migrations/20260224_owner_moderation_minimal_last_resort.sql`
- `supabase/migrations/20260224_owner_moderation_rpc_v2.sql`
- `supabase/migrations/20260224_owner_account_moderation_rpc_hotfix.sql`

If that still fails:

- `supabase/migrations/20260224_owner_moderation_emergency_single_rpc.sql`

Then hard refresh the app.

### Public chat retention

`20260222_public_chat_retention_cleanup.sql` creates:

- `public.cleanup_public_messages_48h()`
- hourly cron cleanup for `public_messages`

Verify:

```sql
select jobid, jobname, schedule, command
from cron.job
where jobname = 'public_chat_cleanup_48h_hourly';
```

Run manually:

```sql
select public.cleanup_public_messages_48h();
```

## Deployment checklist

Before pushing to `main`:

1. run `npm run build`
2. if JSON/scenario content changed, run `npm run content:sync`
3. commit only intended files
4. push `main`
5. verify:
   - app loads
   - practice test loads
   - study guide loads
   - scenarios load
   - Stripe webhook is online if tier changes are part of the release

## Notes

- This project is built to feel like POST-style practice, but it is not an official POST exam.
- The practice test banks are intentionally scenario-based and application-heavy.
- The README is meant to document the current working app state, not just the original scaffold.
