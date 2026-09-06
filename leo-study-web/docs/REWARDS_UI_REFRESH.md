# Rewards and workspace refresh

Development-only update for 180 Academy, September 6, 2026. The release targets GitHub `dev` and `https://dev.180.academy`. Production/main and its database require separate approval.

## What changed

- New neutral Academy default avatar, plus six earned avatar designs at levels 3, 5, 10, 20, 35 and 50. Selecting a design uses the existing profile image upload/save flow; uploaded photos remain unchanged unless the user chooses another picture.
- A shared shield badge in the dashboard, profiles, chat and multiplayer, with a consistent rank vocabulary. Fifteen new vector profile frames preserve the existing saved keys and unlock thresholds.
- Daily rewards of 25, 30, 35, 40, 50, 60 and 100 XP across a repeating seven-claim journey. Missing a day does not reset this journey. Server UTC determines eligibility; a user's ledger serializes claims and prevents duplicate awards.
- Dashboard and settings reward cards show the next cosmetics, remaining level XP, collection status, daily claim feedback and a direct route into practice. Earned bonus XP is added once to existing study XP; existing study scores and level thresholds are retained.
- The games hub has clearer mode descriptions and launch cards. Multiplayer has organized create/invite/bot actions, labeled setup controls, room status and responsive empty states. Settings has a clearer navigation rail, grouped forms and a full-width avatar collection. Both themes follow the same design tokens.
- A delayed reward response keeps the saved level visible and prevents a lower cached level from being written during unrelated settings saves. The server total replaces that display fallback when available.

## Validation before deployment

- 88 unit tests passed.
- 30 desktop/mobile browser tests passed in 2.5 minutes. Coverage includes complete signup/class request/approval flows, password recovery, hydration races, existing routes, daily claim failure/retry, a single level boundary crossing, reload persistence, locked cosmetics, saved avatar byte equality, frame persistence and delayed reward loading during a real settings save.
- Multiplayer smoke passed at 1440, 390 and 320 pixels: real private room creation, host mode change, leaving, invite empty state, bot setup and actual Quiz bot launch. No page errors or horizontal overflow were found. Dark/light captures were inspected; theme checks explicitly verify the rendered shell state.
- TypeScript and the staging build passed. Lint has no errors; the existing nine hook dependency warnings remain. The existing large bundle warning remains.
- Real PostgreSQL permission/cycle tests and eight-connection concurrency checks passed on `codex_class180_ui_test_20260906`. Exactly one concurrent claim awarded 25 XP. Details and repeatable commands are in `DAILY_REWARDS_DATABASE_TESTS.md`.

## Reproduce

```sh
npm test
npm run lint
npm run build:staging
npm run test:e2e
node scripts/staging/multiplayer-refresh-smoke.mjs
```

After the expected development commit is healthy, run the two public smoke checks. Fixtures are created and removed only through the guarded localhost clone; public browser/API traffic uses anonymous or signed-in user permissions.

```sh
node scripts/staging/public-dev-smoke.mjs --run-approved-dev-check
node scripts/staging/public-rewards-smoke.mjs --run-approved-dev-check --expected-commit=<full-development-commit>
```

Public results and screenshots are written under ignored `artifacts/public-dev.local` and `artifacts/public-rewards.local`. Local reward screenshots are under ignored `.artifacts/rewards-refresh.local`. These artifacts can contain synthetic account details and are not published in GitHub.

## Release boundary

The new SQL migration was applied only to the retained development clone. No automatic database migration step was added to deployment. Do not merge this release to main or apply its migration to production until the owner approves that separate rollout. Test mail remains captured in Mailpit and preview live integrations remain disabled.
