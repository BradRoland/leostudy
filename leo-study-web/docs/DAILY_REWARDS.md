# Daily rewards

The server awards one reward per **UTC calendar day** to a signed-in user with an active class membership. The seven-claim cycle awards **25, 30, 35, 40, 50, 60, then 100 XP**. Missing a day preserves all earned XP and the next position in the cycle. A completed seventh reward remains visible for that day; the next eligible day starts a new cycle.

The database migration is `20260906195749_daily_login_rewards.sql`. Apply it only to the retained development clone for this release. Normal application deployment must not run migrations against production.

## Client contract

`src/lib/dailyRewards.ts` exports `dailyRewardSchedule`, `DailyRewardStatus`, `DailyRewardClaim`, `loadDailyRewardStatus()` and `claimDailyReward()`. Both calls use the current signed-in Supabase client; callers do not provide a user ID, date, amount, or cycle position.

Status fields:

| Field | Meaning |
| --- | --- |
| `serverDate`, `resetsAt` | Server UTC day and its following UTC midnight; use these for display/reload timing |
| `eligible`, `claimedToday`, `canClaim` | Active membership eligibility, whether today's award exists, and whether a new claim is available |
| `totalClaims`, `totalBonusXp` | Authoritative lifetime claim count and earned reward XP |
| `cycleDay` | Displayed reward position, 1 through 7; today's claimed position remains displayed after claiming |
| `completedInCycle` | Completed positions in the displayed cycle, 0 through 7 |
| `rewardXp`, `nextRewardXp` | Displayed position's reward and the reward for the next successful claim |

The claim response includes the same status plus `claimed` and `awardedXp`. A replay or second concurrent request returns `claimed: false`, `awardedXp: 0`, and the already-updated total. The UI must replace its reward state with that response; it must not increment a cached XP amount optimistically. The decoder rejects malformed or inconsistent responses, and errors shown to users exclude upstream database details.

## XP and privacy

`daily_reward_private.progress` holds the authoritative totals. `daily_reward_private.claims` records each award, with unique constraints on `(user_id, claim_date)` and `(user_id, claim_number)`. A row lock serializes a user's claims, and the server reads the UTC date after acquiring that lock. A claim and its total update are one transaction.

Browser roles have no direct ledger table privileges. Both tables have RLS as an additional boundary. Public RPCs `get_daily_reward_status()` and `claim_daily_reward()` are invoker wrappers around narrowly granted, private definer entry points. The entry points take no arguments and validate `auth.uid()` against an existing account. Internal functions accepting a user/date are not executable by browser roles. Definer functions use an empty search path and qualified relations.

Do **not** add daily rewards to `achievementXp` or persist a duplicate reward total in `app_state`. Current-user level calculation adds `totalBonusXp` from the status RPC once. Peer level calculation adds `profile_details.dailyRewardXp` from `public_study_profiles` once. That scalar is joined from the server ledger, overwriting any forged client JSON field, while the projection retains the same class visibility and private-state restrictions. Existing study XP, achievement XP and stored progress remain unchanged.

## Verification

`src/lib/dailyRewards.test.ts` passed all five checks for cycle rollover, missed days, UTC response validation, malformed data, replay semantics, no client-controlled claim parameters and safe error messages. Actual clone-only PostgreSQL acceptance passed the seven-reward cycle and rollover, replay, unauthenticated/unclassed/banned/cross-user denial, private ledger/helper privileges, unchanged achievement XP and server-only projection. Eight simultaneous PostgreSQL sessions produced one 25 XP award and seven zero-XP replay responses; all responses showed the same one-claim/25-XP total. Synthetic fixtures were removed.

An independent read-only catalog review confirmed RLS on both ledger tables, no browser table privileges, no anonymous function execution, private user/date helpers denied to browser roles, empty search paths, public invoker RPCs and the unchanged class-scoped invoker/barrier projection. The original database has no new reward schema/RPC, and the production container audit remained unchanged. Reproduction scripts and full evidence are in [Daily reward database tests](DAILY_REWARDS_DATABASE_TESTS.md).

Implementation guidance was checked against the [Supabase changelog](https://supabase.com/changelog), [database function security](https://supabase.com/docs/guides/database/functions) and [Data API grants and RLS guidance](https://supabase.com/docs/guides/api/securing-your-api). The applicable grant changes are handled by explicit function privileges; the ledger stays in an unexposed schema.
