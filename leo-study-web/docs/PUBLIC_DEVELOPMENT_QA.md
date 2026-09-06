# Public development verification

The development site is `https://dev.180.academy`, with its isolated Supabase API served under `/supabase`. These checks use synthetic accounts and the copied development database. Fixture setup and cleanup use only the retained localhost service API; the service key is never sent through the public site.

## Local regression after the privacy update

`npx playwright test` passed **18 of 18** desktop and mobile cases in **1.5 minutes** on September 6, 2026. This run followed the peer-statistics projection and raw account-state privacy changes.

Coverage includes account creation; separate class, department, photo, name, and study-plan steps; existing account restoration and major app routes; failed-sign-in recovery; class-request validation and retry; owner deep-link approval; requester admin access; cadet access restrictions; phone layout; and real password-reset delivery and completion.

The clone now issues password-reset links with the public preview host. The local recovery test accepts only the exact trusted public verification origin/path, substitutes the equivalent localhost verification endpoint, and preserves and validates the local callback. Browser traffic remains restricted to localhost. This verifies recovery behavior locally; it does not by itself prove public email-link routing.

## Public checks

**Passed on September 6, 2026, at 17:00:22.962 UTC.** The final run completed in 12.9 seconds against deployed build `b3854b5d8d0e03695a3def0eba46a90f600a547c-dev-1788711736990` (built at 16:22:17.213 UTC).

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

An initial public run encountered an onboarding visibility timeout. It did not recur in three subsequent runs through profile setup, avatar handling, and chat. Diagnostic runs identified the expected anonymous content denials described above; the final check distinguishes those exact denials while retaining all other error checks. No app changes were required during public QA.

Saved evidence:

- `result.json`: timestamp, build identity, all passed checks, expected denials, and cleanup result.
- `signin-desktop.png` and `signin-mobile.png`: public email/password sign-in and development branding.
- `dashboard-desktop.png` and `dashboard-narrow.png`: synthetic user's dashboard.
- `chat-desktop.png`, `chat-mobile.png`, and `chat-narrow.png`: actual synthetic conversation with the composer above mobile navigation.

The obsolete screenshot from the first diagnostic failure was removed. The sign-in images were refreshed after the brand image finished loading; this did not rerun or change application behavior.

The preview hides unconfigured Google authentication and directs visitors to email/password sign-in. The normal build retains Google authentication.
