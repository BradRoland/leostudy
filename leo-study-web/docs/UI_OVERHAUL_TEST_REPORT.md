# Class 180 UI overhaul — isolated test report

This work remains on the `codex/class180-ui-overhaul-test` branch. No main/Coolify deployment or production application migration was performed.

## Environment and retained snapshot

- Original database: `postgres` inside the existing `supabase-db` container, PostgreSQL 17.6, home server `192.168.1.1`.
- Isolated full-data clone: `codex_class180_ui_test_20260906`, in the same PostgreSQL instance. Before tests it contained **101 auth users, 98 profiles, and 100 memberships**, matching the snapshot. Class 180 was unlisted/code-only; Classes 181 and 182 were active/listed/open.
- Root-only snapshot: `/mnt/tank2/stacks/supabase/backups/class180-ui-test-20260906/production-snapshot.dump`; SHA-256 `2d9e122c71bc94fb5e77b6a7c9bd0f2a86614d73b3f68828d8a2f3a9f4958615`.
- Test service stack: `/mnt/tank2/stacks/class180-ui-test-20260906/compose.json`. Container prefix: `class180-ui-test-20260906-`.
- Separate Auth, REST, Storage, Realtime, gateway and Mailpit services use the clone. Test JWT keys differ from production; old cloned realtime tenant references were removed from the clone and replaced by `class180-ui-test`. Its replication-slot suffix is `codex_ui_20260906`.
- Scheduled jobs and database network extensions were excluded from restore, as was an obsolete GraphQL function ACL whose referenced function was absent. Application/auth/storage data and application table permissions were retained. New avatar uploads use separate test storage; production avatar files were not copied.
- OAuth provider credentials and auth hooks were omitted from the test Auth service. SMTP goes only to the local Mailpit sink; test infrastructure does not send to real inboxes. Historical requests do not get backfilled into the new email queue.
- Server endpoints bind only to loopback. A single authenticated SSH connection carries a bounded relay for the three test ports, without changing server SSH settings. Test containers have `restart: no` and conservative resource limits.

## Preview and local process control

| Purpose | Local URL |
| --- | --- |
| UI development preview | http://127.0.0.1:5176 |
| Compiled staging preview | http://127.0.0.1:5177 |
| Test Supabase API | http://127.0.0.1:55431 |
| Mail sink viewer | http://127.0.0.1:55432 |
| Request API/email worker | http://127.0.0.1:8789 |
| SMTP sink | 127.0.0.1:55433 |

All keys/settings are in ignored, mode-0600 `.env.staging.local`. Synthetic cadet and owner logins are in ignored, mode-0600 `.test-accounts.local`. Neither file is committed. The test JWTs expire seven days after creation. No production `.env` was copied into the worktree.

From this worktree, after stopping any previous local preview processes:

```sh
npm ci
npx playwright install chromium
npm run dev:staging
```

The helper was started successfully against the retained clone. It refuses ports already occupied by a previous instance. `dev:staging` uses the existing macOS Keychain SSH credential without printing it, refreshes the non-secret server relay program, starts the localhost relay, backend and Vite, and stops those local children on **Ctrl+C**. It preserves the server clone and containers. Alternate existing SSH/Keychain identifiers can be passed with `CLASS180_TEST_SSH_TARGET`, `CLASS180_TEST_SSH_USER`, and `CLASS180_TEST_KEYCHAIN_SERVICE`. The helper refuses a non-test API or a non-local SMTP sink.

The server stack can be stopped for resource recovery with the following command in an authorized administrative server shell; the database clone and snapshot remain available:

```sh
cd /mnt/tank2/stacks/class180-ui-test-20260906
docker compose -f compose.json stop
```

Use `docker compose -f compose.json up -d` in the same directory to restart test containers, then restart the local helper. Do not run commands against the original Supabase compose project. Do not remove the clone or snapshot before review is finished. Later disposal must target only this exact test stack, its storage, and `codex_class180_ui_test_20260906`.

## Reproducing checks

```sh
npm test
npm run lint
npm run build:staging
npm run test:e2e
npm run test:staging:http
node backend/staging-multiplayer-check.mjs

# In a second terminal, after build:staging:
npm run preview:staging
# In a third terminal:
npm run test:staging:build
```

The compiled preview smoke uses the staging-built assets and direct isolated Auth/REST endpoints; request API functionality is tested through the development proxy and actual backend separately. The browser tests use actual isolated Auth, database APIs, Storage, and backend endpoints. They never inject a production-app authentication bypass or mocked data layer. Browser network requests are limited to loopback. `backend/class-request-acceptance.sql` runs the migration's authorization and workflow acceptance checks in a transaction and rolls back. It must be executed with `psql -U supabase_admin -d codex_class180_ui_test_20260906 -X -v ON_ERROR_STOP=1` inside `supabase-db`.

## Verified results

Final consolidated checks: **65/65 unit and helper tests passed; 18/18 Chromium browser tests passed across desktop and mobile; TypeScript/staging production build passed; lint passed with 0 errors and 10 existing hook warnings.**

- Baseline before UI changes: **45 tests passed**, TypeScript/production build passed, lint had **0 errors and 11 existing hook warnings**. Baseline bundle size warning and existing dependency audit findings were recorded rather than silently upgraded.
- Actual migration applied successfully to the clone. SQL acceptance passed for trusted requester identity; pending access; owner-only approval; request/approval idempotency; creator admin and ordinary cadet roles; correct department scope; dynamic enrollment listing; same-name class conflict refusal; rejection notification; private outbox access; exclusive claims; retries; expired review handling; and preserved legacy profile/membership counts. The acceptance transaction rolled back.
- Actual HTTP/API and SMTP acceptance passed: unauthorized requests rejected, invalid dates rejected, owner-only review, duplicate protection, class admin and department creation, and **exactly two messages** received by the local mail sink, containing class dates, departments, owner review link, and requester sign-in link. Test-created records were cleaned up.
- Existing-user browser route smoke passed on desktop **1440×1000** and mobile **390×664**: home, study hub, flashcards, practice test, guide, scenarios, library, games hub, matching, speed, blaster, duel lobby, leaderboards, class workspace, profile, stats, and chat. No uncaught JavaScript errors or horizontal page overflow.
- New-account browser enrollment passed on desktop and mobile: account creation, active classes 181/182 with 180 excluded, department selection, first/last name, actual avatar upload to isolated Storage, study focus, daily plan, home, and persistence after reload.
- Incorrect-password feedback and enabled retry action passed on both viewports. Cancelled OAuth callback errors remained readable. Actual password-recovery email arrived at the local sink; following the recovery link, changing the password, and signing in with it passed on desktop and mobile.
- Full browser class-request flow passed on both viewports: academy/class/details/dates/departments; requester account; pending sign-in denial; authenticated owner email deep link and highlighted approval card; approval; creator profile-only wizard; admin access; dynamic class listing; and a separate ordinary cadet choosing only that new class’s departments.
- Request validation, editing a saved draft, simulated temporary HTTP failure with retained account/details and successful retry, and non-owner review denial passed on desktop and mobile. Only the transient HTTP response is fault-injected; successful workflows use real isolated services.
- Actual isolated Realtime WebSocket subscription and broadcast round trip passed. Additional actual API/database gameplay checks passed: class chat insert/read with a live Postgres INSERT event; outsider class chat read/write denial; quiz duel creation, cross-class join denial, join/both-ready/countdown, scored round submissions and completed forfeit; Connect4 create/join/ready, wrong-turn denial, seven legal moves, a vertical win and both final result records. These checks used a separate synthetic fixture class and cleaned all their records. Game browser route coverage also includes matching, speed, blaster and the duel lobby; full browser gameplay in every mode remains outside the verified scope.
- Compiled staging build and browser smoke passed with synthetic login, dashboard, study deep link, light/dark views, and 1440px/390px/320px layouts, with no uncaught JavaScript errors or page overflow. Synthetic review images are retained in `docs/screenshots/`.
- Final production audit: original database still contained **101 auth users, 98 profiles, and 100 memberships**. New private email outbox and claim function were absent from production. Original `supabase-db` remained healthy with unchanged start time **2026-08-24T02:16:59.456419152Z**; original Auth, Storage, REST, Realtime, gateway and companion services remained up for 13 days. Both new replication slots point specifically to `codex_class180_ui_test_20260906`.
- Testing found and fixed a membership-loading race that redirected existing users' deep links to home. Membership hydration now waits for the current user and discards stale responses when accounts change.

## Verification limits

Google OAuth's external authorization exchange is intentionally unverified: the clone has no Google OAuth credentials or independently registered callback. Production OAuth configuration was unchanged; cancelled/error callback UI is tested locally. Real owner/requester inbox delivery is not claimed from mail-sink tests. Production migration and notification activation remain a later rollout step requiring the user’s approval. No main-branch changes, push or deployment were performed.

Dark onboarding styling was separately checked by applying the existing dark theme class to the sign-in page after sign-out (normal sign-out currently resets to light). Filled inputs and Google/sign-in controls were inspected at desktop and 320px widths. Screenshot capture disables finite transitions to avoid saving intermediate theme colors; no authentication state is bypassed.

Build output retains the existing large-bundle warning (approximately 3.26 MB JavaScript before gzip). Lint’s remaining warnings predate this overhaul; this work reduces their count from 11 to 10. Live Google authorization, real SMTP delivery, Stripe charges, and complete gameplay in every game mode are outside the verified results above.
