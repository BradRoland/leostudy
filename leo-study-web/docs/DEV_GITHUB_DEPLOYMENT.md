# Separate GitHub development deployment

Use a separate Coolify application tracking **only the exact `dev` branch**. Keep the production application on `main`, with its existing settings and webhook. No database migration, DNS change, or production restart belongs in the application build. The development application uses the retained isolated database and mail sink described in [Development server deployment](DEV_SERVER_DEPLOYMENT.md).

## Build contract

Select the application directory `leo-study-web` as the build context and `ops/dev-preview/Dockerfile.github` as its Dockerfile. Disable automatic injection of runtime variables into Docker build arguments. Only these two arguments are accepted:

| Argument | Value |
| --- | --- |
| `VITE_SUPABASE_ANON_KEY` | The retained clone's anonymous JWT; at least 24 hours of validity must remain |
| `SOURCE_COMMIT` | The exact 40-character Git commit checked out from `dev` |

Never supply a service-role key, SMTP password, server password, Stripe secret, or other runtime credential to a build. The build helper forwards a small allow-list of environment values, fixes the browser API to `https://dev.180.academy/supabase`, and fixes sign-in and invitation links to the development domain. Live integrations and telemetry are disabled; payment links are empty. Provider-injected commit variables cannot override `SOURCE_COMMIT` in the served version manifest.

The pinned Node image runs `npm ci --ignore-scripts`, the unit tests, lint, TypeScript checks and Vite compilation. The final image contains compiled assets, five explicitly named backend runtime modules, two deployment guard modules and locked production dependencies. Environment files, test fixtures, database scripts and browser reports are excluded. It runs as the unprivileged Node user on port 8789.

## Runtime contract

The separate development application must join only the isolated test application network and resolve its existing `gateway` and `mail` service aliases. Its stable application alias is used by the retained development proxy; the production proxy and application are separate.

| Runtime setting | Required value |
| --- | --- |
| `NODE_ENV`, `HOST`, `PORT` | `production`, `0.0.0.0`, `8789` (provided by the image) |
| `SUPABASE_URL` | `http://gateway` |
| `SUPABASE_ANON_KEY` | Unexpired clone JWT with the `anon` role |
| `SUPABASE_SERVICE_ROLE_KEY` | Unexpired clone JWT with the `service_role` role; runtime only |
| `DISABLE_LIVE_INTEGRATIONS` | `true` |
| `CLASS_REQUEST_APP_URL` | `https://dev.180.academy` |
| `CLASS_REQUEST_EMAIL_ENABLED` | `true` |
| `CLASS_REQUEST_EMAIL_FROM` | Retained development sender |
| `CLASS_REQUEST_OWNER_EMAIL` | Retained owner recipient; delivered only to the sink |
| `CLASS_REQUEST_SMTP_HOST`, `CLASS_REQUEST_SMTP_PORT` | `mail`, `1025` |
| `CLASS_REQUEST_SMTP_SECURE`, `CLASS_REQUEST_SMTP_REQUIRE_TLS` | `false`, `false` (isolated sink only) |

Leave Stripe, Discord, Resend, Coolify webhook proxy, SMTP authentication, and dotenv override settings absent or empty. The dedicated entry point refuses live credentials, external API/mail targets, role-swapped or expired JWTs, and conflicting fallback settings **before importing the backend**. It also disables loading a dotenv file. Error messages never print tokens. The guard checks JWT structure/role/expiry; the gateway and normal backend startup verify actual service access. The guard does not independently prove the gateway's database identity, so the retained clone/project/network inspection remains part of deployment configuration.

## Automation checks and rollout

The GitHub trigger and Coolify resource must filter the exact `dev` ref. Pull requests, tags and `main` must not invoke this deployment. Use a single development deployment concurrency group and immutable commit IDs. No TrueNAS administrator password or production deployment credential belongs in GitHub Actions.

Before switching the development proxy to the new application, verify its container health, `/api/health`, and `/app-version.json` against the expected commit. Retain the previous working application/image for rollback. Verify public sign-in, exact anonymous class discovery, blocked private REST requests, an authenticated own-profile read, and disabled live routes afterward. Database policy changes require a separately reviewed clone-only action; never apply all repository migrations automatically during the web build.

`backend/development-deployment.test.mjs` covers fixed preview build settings, removal of injected secrets/commit overrides, invalid build provenance, wrong/expired JWT roles, exact runtime isolation, fallback mail credentials, live integrations and entry-point failure before backend startup. This document defines the source contract; actual resource IDs, configured branch, successful deployment commit, proxy switch and public smoke results must be recorded after they are verified.
