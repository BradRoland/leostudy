# 180 Academy visual refresh — test report

Verified on **2026-09-06 UTC / 2026-09-05 PDT**, in the isolated `codex/class180-ui-overhaul-test` worktree. This report covers the second visual refresh, including the new **180 Academy** identity, charcoal/white/blue palette, refreshed navigation/dashboard, feature pages, guided account setup, and class chat.

The final browser and build checks were repeated after the chat reconnection, paid-theme compatibility, personal-workspace membership, favicon, and final dashboard copy/accessibility changes. No main-branch changes, push, production migration, or deployment were performed. The original `main` and `origin/main` remain at `7ce163bb`.

Final consolidated checks completed at **2026-09-06 05:29:31 UTC**.

## Results

| Check | Result |
| --- | --- |
| `npm test` | **69 passed, 0 failed** |
| `npx playwright test --reporter=list` | **18 passed, 0 failed**, desktop and mobile, **1.4 minutes** |
| `npm run build:staging` | **Passed**, including TypeScript compilation |
| `npm run test:staging:build` | **Passed** against the final compiled assets |
| `npm run lint` | **0 errors, 9 existing hook warnings** |
| `git diff --check` | **Passed** |
| `node backend/staging-chat-ui-check.mjs` | **Passed** with actual isolated browser/Auth/REST/Realtime services |
| `npm run test:staging:http` | **Passed**, including refreshed email identity and exactly two local sink messages |
| `node backend/staging-theme-ui-check.mjs` | **Passed**, paid selection/persistence/contrast and unchanged free/default appearance |
| `node backend/staging-personal-workspace-check.mjs` | **Passed**, owner/admin personal membership scope and profile-save safety |

Final staging manifest: `0.0.0-2026-09-06T05:26:54.497Z`. The build produced approximately **3.27 MB JavaScript / 741.28 KB gzip** and retains the existing large-chunk warning. Dependencies were not broadly upgraded as part of the visual refresh.

## Browser regression coverage

The 18 cases comprise the following nine flows on **1440×1000 desktop** and **390×664 mobile Chromium**:

1. Existing accounts restore their dashboard and open the main study, game, class, profile, stats, and chat routes. No uncaught JavaScript errors or horizontal document overflow were detected.
2. Incorrect passwords keep the user signed out, show a usable error, and leave the sign-in action available.
3. New accounts complete active-class selection, a separate department screen, first/last name, an actual optional avatar upload to isolated Storage, study focus, and daily goal. The dashboard and saved setup survive reload.
4. A new class request passes from class details to account creation, remains blocked from class access while pending, and reaches an owner through the review deep link. Approval promotes the creator to class admin; the creator finishes profile-only setup, reaches management, and retains access after reload. A separate cadet can then select the newly approved class and its departments without obtaining admin access.
5. Cancelled authentication callback errors remain readable and the narrow layout stays within the viewport.
6. Invalid request dates are rejected, and academy/location/class/department/date fields survive saving, reloading, and editing a guest request draft.
7. An injected temporary request-API failure preserves the newly created account and class details, shows the failure, and permits a successful retry with one pending request.
8. An ordinary cadet opening an owner review link cannot access approval controls.
9. Password recovery delivers an actual reset message to the local mail sink. Following its link opens the new-password form; the new password works and the old password fails.

Successful paths use the actual isolated backend and database. Only the deliberate temporary HTTP failure is injected. Class requests and approval notifications are verified against the local mail sink, including the owner-review and requester-sign-in destinations.

## Chat verification

The separate synthetic chat browser check verified persisted multiline messages, live inbound updates, reactions, day grouping, emoji insertion, report-dialog cancellation, retained drafts after a failed send, and opening/closing the compact chat panel.

It also forced an unexpectedly closed Realtime channel and verified **Reconnecting → Live updates** followed by successful live activity. The check passed at desktop, 390px, and 320px widths, checked readable settled dark-theme sender text, and confirmed that the mobile composer remains above the bottom navigation. No uncaught page errors occurred. The fixture class contained only synthetic recipients and its records were cleaned up.

## Personal-workspace and profile-save regression

Final review exposed an existing membership-selection problem: owners and class admins could legitimately read other members through database policies, but the personal-workspace loader did not filter by the signed-in user. Another member's newer membership could therefore become the apparent personal class or department. The loader now explicitly scopes its query to the current identity while owner/admin roster access remains available through the management queries.

The separate real-browser regression covered owner and admin accounts, sequential identity switching in one browser, preservation of their own class/agency/role, and saving Academy Blue without an unnecessary unchanged-department write. It also injected a plain PostgREST failure, verified a readable error, retried a real department change, and confirmed that only the current person's membership changed and the admin role remained intact. Four users, three classes, and the synthetic academy were cleaned up. A separate copied-account preview save also retained its original class membership and department.

## Saved paid-theme compatibility

A targeted real-browser check used two disposable accounts in a private synthetic class. A $5 supporter could visibly apply **Pastel Rose**, save it, verify the stored selection, reload, and retain the choice in light and dark modes. The primary action's text/background contrast met **4.5:1**. Returning to **Academy Blue** restored the refreshed default colors and survived reload. A free account kept the normal Academy Blue palette in both modes and could not select paid themes. The stored default theme ID remains `midnight` for compatibility. Shared review accounts and their preferences were untouched; the disposable records were cleaned up.

Four additional unit cases verify palette mapping, unchanged free/default behavior, readable normal/hover button colors, and light-mode custom surfaces.

## Refreshed email identity

After restarting only the local test helper, the actual request/approval HTTP check passed owner-only approval, idempotency, creator admin assignment, dynamic class listing, and exactly two SMTP sink messages. Both test sender display names were **180 Academy TEST**, the message header read **180 ACADEMY**, and the action buttons used the refreshed blue treatment. The requester action was **Sign in to 180 Academy**. Synthetic fixtures were cleaned up.

The first check immediately after restart encountered a temporary SMTP delivery retry and exceeded its 35-second mail window. SMTP connectivity then verified successfully, and an unchanged rerun passed. The queued retry behavior remained intact; there was no external delivery or production change.

## Visual review and artifacts

- The final compiled sign-in screen was captured at **1440, 390, and 320px** in light and dark themes. The browser title is **180 Academy**. No horizontal overflow occurred.
- The final compiled dashboard was captured at **1440, 390, and 320px** in light mode, plus desktop and 320px dark mode. Synthetic account login, the study deep link, and both theme switches passed.
- All four authenticated enrollment stages were inspected at desktop/mobile widths in light and dark themes. Request forms were checked at 390px and 320px, including the lower department/notes/action area. Selected states, optional photo controls, compact progress bars, and labels remain readable.
- Feature-page review covered 17 routes at **1440, 390, and 320px**, plus owner/class-admin controls in both themes. The page inventory and layout details are in [VISUAL_REFRESH_COVERAGE.md](VISUAL_REFRESH_COVERAGE.md).
- Captures disable finite transitions when switching themes, so screenshots do not record intermediate colors. The welcome UI also respects reduced-motion preferences.

Final synthetic review images are in `docs/screenshots/`:

| View | Light | Dark |
| --- | --- | --- |
| Desktop sign-in | [Preview](screenshots/signin-desktop-light.png) | [Preview](screenshots/signin-desktop-dark.png) |
| Mobile sign-in | [Preview](screenshots/signin-mobile-light.png) | [Preview](screenshots/signin-mobile-dark.png) |
| 320px sign-in | [Preview](screenshots/signin-narrow-light.png) | [Preview](screenshots/signin-narrow-dark.png) |
| Desktop dashboard | [Preview](screenshots/home-desktop-light.png) | [Preview](screenshots/home-desktop-dark.png) |
| Mobile dashboard | [Preview](screenshots/home-mobile-light.png) | — |
| 320px dashboard | [Preview](screenshots/home-narrow-light.png) | [Preview](screenshots/home-narrow-dark.png) |

Chat previews are also retained there. Intermediate enrollment and broader feature screenshots remain ignored local artifacts. The logo and favicon provenance are recorded in [BRAND_IDENTITY.md](BRAND_IDENTITY.md).

## Environment and limits

The development UI uses `http://127.0.0.1:5176`; the compiled preview uses `http://127.0.0.1:5177`. Auth/data requests go to the retained isolated clone at `http://127.0.0.1:55431`, the request backend runs at `http://127.0.0.1:8789`, and mail is captured at `http://127.0.0.1:55432`. Browser checks block non-loopback network destinations. Credentials and test-service configuration stay in ignored local files.

Live Google authorization, real owner/requester inbox delivery, Stripe charges, and complete gameplay in every mode are outside these results. Google credentials were deliberately omitted from the clone; its cancelled/error callback UI is covered. Production notification activation and rollout remain a later step requiring the user’s approval.

The retained database snapshot, infrastructure controls, and earlier SQL/API/gameplay acceptance results are documented separately in [UI_OVERHAUL_TEST_REPORT.md](UI_OVERHAUL_TEST_REPORT.md); those earlier results are not represented as new executions in this report.
