# 180 Academy development domain

Live development site: **https://dev.180.academy**. The domain was switched to the isolated server deployment on September 6, 2026.

## Scope

The user authorized publishing the refreshed test version at this development hostname. Main, the production Coolify application, and the production database must remain unchanged. All source changes belong to `codex/class180-ui-overhaul-test`.

The deployment serves locally compiled assets and the Node backend from the retained isolated TrueNAS stack. The browser connects to `https://dev.180.academy/supabase`; the development reverse proxy removes that prefix and forwards to the cloned Auth, REST, Storage, and Realtime services. SMTP remains on the private mail sink. Live payments, outbound integration webhooks, the production game Worker, and telemetry are disabled. The preview is labeled in its wordmark.

## Build

Run `node scripts/development/build.mjs` from the app directory on the test branch. The helper reads the ignored `.env.staging.local`, verifies the clone origin and anonymous-key role/expiry, sets all public URLs explicitly, and creates `.dev-deployment.local/180-academy-runtime.tar.gz`.

The archive contains only compiled `dist`, package manifests, and backend runtime modules. It excludes local credentials, test accounts, fixtures, browser reports, source dependencies, and administrative SQL. Production dependencies are installed for the server architecture. Both the runtime and frontend use the explicit preview integration switch described in `PREVIEW_INTEGRATION_SAFETY.md`.

## Cloudflare routing and rollback

Account: `e226118830d2d4395e377369b044af66`.
Zone: `558e68c61e0012ac064446d873d6b633` (`180.academy`).

Only the `dev.180.academy` CNAME and its development route are in scope:

| Setting | Before | Live development destination |
| --- | --- | --- |
| DNS record | `9955f45646d5c763a1c38a10469aa808` | Same record |
| CNAME target | `2589c60b-bdf1-4d84-b166-b0b7ec695404.cfargotunnel.com` (`MAC`) | `fc45b9d9-f35a-4f7f-af8c-6016e0277409.cfargotunnel.com` (`My tunnel`) |
| Proxy / TTL | Proxied / Auto | Proxied / Auto |
| Application origin | `http://192.168.1.67:5173` | `http://192.168.1.1:55434` |

The DNS record save visibly changed only `dev.180.academy` from `MAC` to `My tunnel`. Cloudflare then confirmed “Route added successfully” for the development hostname. The old `MAC` route is retained for rollback. Reverting the CNAME restores its previous routing; remove only the newly added development route from `My tunnel` if the rollout is abandoned. The original route was timing out before this work, so a DNS rollback restores configuration rather than guaranteeing a working old preview.

`My tunnel` has three active replicas on different hosts. Its development origin must use the TrueNAS LAN address, not localhost. Database ports, the mail viewer, and SMTP are not published through this route. The other 43 existing routes and the seven other academy DNS records remain outside this change.

## Pre-public verification

- Initial production homepage response: HTTP 200.
- Main and origin/main both remain `7ce163bb6bb32bd17336295f2ee1eadfd36cc59d`.
- Preview integration changes: 75 unit tests passed; build passed; lint had 0 errors and 9 existing warnings.
- Initial runtime archive inspected: no private configuration or local files; browser bundle contains the development Supabase URL and no configured service-role/mail/Stripe secrets.
- Inherited permissive study-state reads and unsafe helper permissions were repaired on the clone before publication. SQL privacy/permission acceptance, sanitized peer statistics, personal saves, actual chat/quiz/Connect4 checks, and all 18 desktop/mobile browser regressions passed. See `DEV_PRIVACY_TEST_REPORT.md`.

## Public verification

- Public `/api/health`, `/signin`, and `/app-version.json` return HTTP 200 over HTTPS. HTML is `no-store` and `noindex, nofollow`.
- The served build is `b3854b5d8d0e03695a3def0eba46a90f600a547c-dev-1788711736990`, built at `2026-09-06T16:22:17.213Z`; its HTML, JavaScript, CSS, and manifest match the uploaded local artifact.
- Both server tunnel replicas received 44 hostname routes: the sole addition is this development route. All 43 prior entries, including the catchall, remain structurally identical.
- Four repeated public probes returned the expected health/build responses. All 15 captured production containers retained their IDs, start times, and status.
- Public browser results and screenshots are recorded in `PUBLIC_DEVELOPMENT_QA.md`; server setup, backups, key expiry, and restart/rollback instructions are in `DEV_SERVER_DEPLOYMENT.md`.

The development site uses email/password sign-in. Google OAuth remains unconfigured on the isolated clone and its buttons are hidden in preview mode. Auth and class-approval email delivery stays in the private test mailbox; no real outbound email, payment, or production game-Worker action is enabled by publishing this site. The normal production configuration remains unchanged, and promoting the test branch/database migrations still requires the user's approval.
