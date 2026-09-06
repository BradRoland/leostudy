# Isolated preview integrations

Set both switches for the `dev.180.academy` preview:

| Stage | Setting |
| --- | --- |
| Frontend build | `VITE_DISABLE_LIVE_INTEGRATIONS=true` |
| Backend runtime | `DISABLE_LIVE_INTEGRATIONS=true` |

The build switch disables Stripe checkout links, the Rope Blaster cloud Worker, and Vercel telemetry, including when live values are accidentally supplied alongside it. Upgrade buttons display “Unavailable in preview.” Supabase multiplayer and bot practice remain available. The live Rope Blaster Worker is not exercised by an isolated preview.

The runtime switch avoids creating a Stripe client and removes the requirement for `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET`. It rejects the Stripe webhook/test routes, the Discord class-request notification route, and the Coolify deployment webhook proxy. The standalone Stripe webhook service exits without listening. Class request submission/approval and the class-email queue remain available.

Both switches default to `false`, preserving normal deployment behavior. These switches do **not** choose a database or mail server: configure the cloned Supabase and its mail sink explicitly.

## Build and runtime separation

Build the preview with `VITE_SUPABASE_URL=https://dev.180.academy/supabase`, the clone's public key, `VITE_AUTH_REDIRECT_BASE_URL=https://dev.180.academy`, and `VITE_INVITE_BASE_URL=https://dev.180.academy/invite`. Vite embeds these values in the compiled bundle; changing runtime variables cannot change that bundle. The Dockerfile accepts the safety, invitation, and Worker URL build arguments.

At runtime, use the isolated internal Supabase gateway and clone-only service key. Keep SMTP on the private test mail service (`mail:1025`), with `CLASS_REQUEST_SMTP_SECURE=false` and `CLASS_REQUEST_SMTP_REQUIRE_TLS=false` for that sink. Use `CLASS_REQUEST_APP_URL=https://dev.180.academy` for class-email links. Keep Discord and Resend credentials unset. Never put a service-role key or mail password in a `VITE_*` variable.

## Packaging and access

The backend serves the compiled `dist` directory and its SPA routes. Route `/supabase/` to the isolated gateway before the SPA fallback, with prefix removal and WebSocket upgrades. Preserve the preview gateway's Realtime tenant host mapping.

The Docker build excludes `.env` files, `*.local` files/directories, and browser test reports, preventing the local test account credentials, staging runtime files, and traces from entering its build context. For an uploaded prebuilt runtime, include only the required package manifests, production dependencies, backend source, and compiled `dist`; do not upload the local test credential or runtime files.

Keep database/admin services and the mail viewer private. An access boundary for this preview must cover both the app and Supabase API because the cloned database retains account data.

The preview also requires the study-state privacy migration and matching frontend projection reads; a login check alone does not replace database row policies. See [privacy verification](DEV_PRIVACY_TEST_REPORT.md).

## Verification

`backend/live-integrations.test.mjs` starts the real backend against a disposable loopback Supabase stub without Stripe keys, checks disabled handlers with GET/POST requests, and confirms the authenticated class API remains reachable. It also verifies that the standalone Stripe service does not start and that normal mode still requires Stripe credentials. Frontend tests confirm preview settings override explicit live URLs and that normal settings retain their existing behavior. These checks make no production requests.
