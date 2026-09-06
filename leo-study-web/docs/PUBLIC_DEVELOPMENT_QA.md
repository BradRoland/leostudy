# Public development verification

The development site is `https://dev.180.academy`, with its isolated Supabase API served under `/supabase`. These checks use synthetic accounts and the copied development database. Fixture setup and cleanup use only the retained localhost service API; the service key is never sent through the public site.

## Local regression after the privacy update

`npx playwright test` passed **18 of 18** desktop and mobile cases in **1.5 minutes** on September 6, 2026. This run followed the peer-statistics projection and raw account-state privacy changes.

Coverage includes account creation; separate class, department, photo, name, and study-plan steps; existing account restoration and major app routes; failed-sign-in recovery; class-request validation and retry; owner deep-link approval; requester admin access; cadet access restrictions; phone layout; and real password-reset delivery and completion.

The clone now issues password-reset links with the public preview host. The local recovery test accepts only the exact trusted public verification origin/path, substitutes the equivalent localhost verification endpoint, and preserves and validates the local callback. Browser traffic remains restricted to localhost. This verifies recovery behavior locally; it does not by itself prove public email-link routing.

## Public checks

**Passed on September 6, 2026, at 17:56:03.370 UTC.** The final run started at 17:55:50.481 UTC and completed in **12.9 seconds** against the native Coolify deployment of source/build `59a30a0841aa9518fdad33f957cb484a94ae67ce` (built at 17:54:25.638 UTC). The reported build identity matched that exact source commit.

[GitHub Linux CI for the tested source](https://github.com/BradRoland/leostudy/actions/runs/34050020838) passed installation, automated tests, lint, TypeScript, and the credential-free build on Node 22. The preceding native deployment at `2d7da58d5932e5cb424662185c3a47463aaf5838` also [passed Linux CI](https://github.com/BradRoland/leostudy/actions/runs/34048653033); public verification then exposed the account-loading race described below.

`scripts/staging/public-dev-smoke.mjs` requires an explicit execution flag. It checks:

- HTTPS health and disabled live-integration endpoints.
- Anonymous, anonymous-key, and invalid-token rejection for private account tables, without reading or reporting row contents.
- Public class and department queries, plus actual synthetic account creation and separate class/department screens.
- Known synthetic account identity through public Auth and REST against the expected clone, and successful authenticated access to published study content.
- Profile completion, avatar upload and image loading through the same origin, and session/deep-link persistence.
- Actual chat WebSocket connection and inbound frames through `/supabase/realtime`, plus sending and reading messages in a private synthetic class.
- Desktop and 390/320-pixel layouts, no uncaught browser errors or unexpected API failures, and no production API/integration attempts.

All disposable users, the private academy/class, and uploaded avatars were removed, with **zero cleanup errors**. Its diagnostics redact keys and passwords; screenshots and the detailed result are in the ignored `artifacts/public-dev.local/` directory.

The test recorded two expected anonymous `403` responses for `content_items`, one on sign-up and one on sign-in. The content loader attempts this protected resource before authentication, uses bundled content, and retries. The check separately proved authenticated published-content access works, and fails on every other unexpected API error.

Google Fonts and Cloudflare's injected analytics script were blocked during the check and recorded separately from production API/integration traffic. The blocked origins were `fonts.googleapis.com` and `static.cloudflareinsights.com`. Screenshots therefore use the app's fallback font. No Cloudflare global settings were changed.

## Account-loading regression and fix

Public verification of `2d7da58` exposed a real readiness race: the final onboarding action could remain enabled while the same signed-in account refreshed its profile and saved study state. Submitting during that interval stayed on the wizard with “Your account is still loading. Please try again in a moment.” Profile loading and state loading finished at separate times, so checking only the existing hydration flags was insufficient.

Commit `59a30a0` tracks completed account hydration for the current user, disables final submission until both reads succeed, and guards both the form handler and profile save. The wizard stays mounted so names, the selected avatar, and study choices survive the refresh. A successful lookup with no profile row still allows first-time completion to create that row. Membership and approval checks remain in place.

The focused browser command `npx playwright test tests/e2e/class-request-flow.spec.ts --grep 'profile completion'` passed **4 of 4 desktop and mobile cases in 25.4 seconds**. The refresh regression holds the exact profile response, then the exact saved-state response, and verifies disabled and programmatic submission, preserved fields and avatar, and successful persistence after release. The second case verifies a successful empty profile lookup can create the first profile. The held-profile test failed before the fix, demonstrating the reproduced defect. TypeScript passed; targeted lint reported **0 errors and 8 existing App warnings**. The public pass above then verified the fixed native build with ordinary browser timing.

## Saved evidence

- `result.json`: timestamp, build identity, all passed checks, expected denials, and cleanup result.
- `signin-desktop.png`: public email/password sign-in and development branding.
- `dashboard-desktop.png` and `dashboard-narrow.png`: synthetic user's dashboard.
- `chat-desktop.png`, `chat-mobile.png`, and `chat-narrow.png`: actual synthetic conversation with the composer above mobile navigation.

These listed images were captured by the final successful run. The sign-in brand image was loaded before capture. The desktop sign-in and narrow dashboard screenshots were visually inspected, and the obsolete failure screenshot was removed. Any earlier `signin-mobile.png` is historical evidence and is not part of this final run.

The preview hides unconfigured Google authentication and directs visitors to email/password sign-in. The normal build retains Google authentication.

A subsequent documentation-only commit may become the displayed development build. This browser report records the exact application source tested above; publishing unchanged application code with updated reports does not imply a second browser run.
