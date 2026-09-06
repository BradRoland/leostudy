# Daily reward database verification

Verified on September 6, 2026 against the isolated database `codex_class180_ui_test_20260906`. The migration was applied explicitly to this clone; the development build pipeline does not apply SQL migrations.

Migration: `supabase/migrations/20260906195749_daily_login_rewards.sql`.

## Functional and permission acceptance

`backend/daily-rewards-acceptance.sql` passed against real PostgreSQL. It guards the database name, creates synthetic fixtures inside one transaction, and rolls everything back.

- A fresh active member can collect 25 XP. The immediate response shows `claimedToday=true`, `totalClaims=1`, and `totalBonusXp=25`.
- Repeating the claim on the same UTC date returns `claimed=false` and `awardedXp=0` without changing totals.
- All seven awards are correct: 25, 30, 35, 40, 50, 60, 100. The eighth claim starts another cycle at 25; eight ledger rows total 365 XP.
- Simulated gaps in only the synthetic ledger's dates preserve the next reward. The system clock and copied account data are untouched.
- Anonymous, unclassed, banned, and nonexistent users cannot claim. The server supplies the UTC date and next UTC midnight; public RPCs accept no user, date, or XP arguments.
- Browser roles cannot read/write the private tables or invoke the internal helpers with another user/date. Raw study state remains restricted to its owner.
- A forged `app_state.profile_details.dailyRewardXp=999999` is ignored by the peer projection, which returns the actual ledger bonus 25. Existing achievement XP remains 17 and private first names remain excluded. Claiming does not mutate raw client study state.

Run with PostgreSQL access to the isolated host:

```sh
docker exec -i supabase-db psql -X -v ON_ERROR_STOP=1 -U supabase_admin \
  -d codex_class180_ui_test_20260906 < backend/daily-rewards-acceptance.sql
```

## Simultaneous claims

`backend/daily-rewards-concurrency-check.py` passed using eight independent PostgreSQL connections against one new synthetic member. Exactly one response awarded 25 XP; the other seven returned zero. Every response observed one claim and 25 total XP. The final ledger contained one row, and a second synthetic member remained unaffected.

The script commits disposable fixtures so the connections can share them, then deletes them in a `finally` block. Cleanup verified zero remaining progress and ledger rows. It accepts no alternative database name.

Run the script on the isolated host with Docker access:

```sh
python3 backend/daily-rewards-concurrency-check.py
```

## Security review and production boundary

An independent read-only catalog review confirmed both private tables enable RLS, browser roles have no direct table privileges, all six reward functions set an empty search path, public wrappers use invoker rights, anonymous function access is denied, and the peer projection retains its class-scope check and security-invoker/security-barrier properties. No new reward-object security finding was identified. This was a targeted catalog review, not a hosted Supabase advisor run.

The final original-database read-only check at 20:12:35 UTC found no daily reward schema or RPC in `postgres`. Observed original counts remained 101 Auth users, 98 profiles, and 100 memberships. All 15 recorded production container IDs and start times remained unchanged. No production deployment, production migration, branch push, or copied-user reward claim was performed for this verification.
