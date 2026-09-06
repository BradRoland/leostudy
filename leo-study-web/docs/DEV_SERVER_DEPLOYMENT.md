# 180 Academy development server

This deployment serves only the tested `codex/class180-ui-overhaul-test` worktree at `dev.180.academy`. It runs independently of the Mac. The production website, Coolify application, main branch and original `postgres` database were not deployed or modified. Public routing and final browser verification are recorded separately in [Development domain rollout](DEV_DOMAIN_ROLLOUT.md).

**Public status:** [https://dev.180.academy](https://dev.180.academy) is live as of September 6, 2026. After the development-only DNS/tunnel cutover, four public requests verified healthy JSON and the exact final build ID, all with uncached Cloudflare `DYNAMIC` responses. The synthetic public browser checks are recorded in the rollout report.

## Server layout

- Host: TrueNAS `192.168.1.1`.
- Existing isolated compose project: `/mnt/tank2/stacks/class180-ui-test-20260906/compose.json`.
- Existing cloned database: `codex_class180_ui_test_20260906` inside `supabase-db`.
- Development web origin: `http://192.168.1.1:55434`. This specific LAN address allows all three existing tunnel replicas to reach the same origin. Mailpit and the direct test API retain their loopback-only bindings.
- Web runtime: `class180-ui-test-20260906-web-1`, internal port `8789`, capped at 512 MiB and one CPU. It serves the compiled frontend plus account/class APIs and the class-request mail worker.
- Reverse proxy: `class180-ui-test-20260906-dev-proxy-1`, capped at 128 MiB and half a CPU. It routes `/supabase/` to the existing isolated gateway, preserving realtime WebSocket upgrades, and other app routes to the web runtime.
- Both new containers use a read-only root filesystem with bounded temporary filesystems and `restart: unless-stopped`. Existing test Auth, REST, Storage, Realtime, gateway and Mailpit restart policies also use `unless-stopped`.
- Runtime source template: [Dockerfile.runtime](../ops/dev-preview/Dockerfile.runtime). It installs only locked production dependencies and uses the verified Node 22.22.0 Alpine image digest.
- Reverse-proxy template: [nginx.conf](../ops/dev-preview/nginx.conf).

The existing private `test` Docker network connects the application and gateway. The application does not join the production database network. Auth/REST/Storage/Realtime retain their previous database-network attachment solely to reach the separately named clone. No production container was restarted or reconfigured.

## Retained releases and configuration

- Active release: `web/releases/b3854b5-dev-20260906T162216` beneath the isolated stack directory.
- Image: `180-academy-dev:b3854b5-dev-20260906t162216`.
- Artifact SHA-256: `b110168f9aeabb56ffd386fa965a3b672317ad3c4341872bec9c41ed9ad32d26`.
- Served build ID: `b3854b5d8d0e03695a3def0eba46a90f600a547c-dev-1788711736990`.
- Initial release retained for rollback: `web/releases/b3854b5-dev-20260906T160905` and its corresponding image.
- Pre-deployment configuration backup: `backups/pre-durable-dev-20260906T160655Z` under the same isolated stack directory. Its compose/client files contain secrets and remain root-only.
- Private runtime settings: `web/runtime.env`, mode `0600`; metadata: `web/deployment-metadata.json`. These are not part of the Docker build context or source control.

The runtime connects to `http://gateway` using only clone keys. Class-request messages use `https://dev.180.academy` links and SMTP `mail:1025`, the retained Mailpit sink. Both frontend and backend disable live integrations; no Stripe credentials are configured. Stripe, Discord and Coolify webhook routes are additionally denied by the development proxy. See [Preview integration safety](PREVIEW_INTEGRATION_SAFETY.md).

## Auth and key lifetime

The isolated JWT signing secret is unchanged and was checked to differ from production. New test anon/service tokens were issued on September 6, 2026 and expire **September 6, 2027 at 16:06:55 UTC**. Renew these test tokens before that time and rebuild the frontend with the new anon token; updating a server environment alone does not replace an embedded browser key. No token values are recorded here.

Installed Auth remains `supabase/gotrue:v2.186.0`. Its settings are:

| Setting | Development value |
| --- | --- |
| `API_EXTERNAL_URL` | `https://dev.180.academy` |
| `GOTRUE_SITE_URL` | `https://dev.180.academy` |
| `GOTRUE_JWT_ISSUER` | `https://dev.180.academy/supabase/auth/v1` |
| Confirmation/recovery/invite/email-change mail paths | `/supabase/auth/v1/verify` |
| Redirect allow-list | Development origin plus retained loopback previews on ports 5176 and 5177 |
| SMTP | `mail:1025`, local sink only |

This installed Auth release resolves absolute mail paths against the external origin, so the explicit `/supabase` prefix belongs in each mail path. Actual recovery delivery and the verification redirect were tested. Signup autoconfirm remains enabled; the signup confirmation URL was separately generated and checked. Google provider credentials remain absent from the clone.

The ignored local `.env.staging.local` contains renewed keys while retaining `http://127.0.0.1:55431` as its test API. The local helper was restarted with development mail links and disabled live integrations. It still connects to this exact clone; the server-hosted website continues running if the helper or Mac stops.

## Private data boundary

Before publishing, tests found inherited broad read policies on private study state. The clone now applies `20260906161504_private_study_state_public_profiles.sql`: raw study state is own-user only; allowed peer statistics/cosmetics use the explicitly filtered `public_study_profiles` projection; profiles and owner badges are class-scoped. Separate SQL acceptance verified anonymous, unclassed and cross-class denial and preserved legitimate peer displays and own saves.

The development proxy additionally validates private REST bearer tokens through the isolated Auth `/user` endpoint. It does not trust decoded client claims. Anonymous access is limited to the exact class-discovery and department-query shapes used by enrollment and the invite lookup RPC. The complete method and URI must match, preventing duplicate query parameters or arbitrary nested PostgREST selections from bypassing validation. Auth administrative endpoints and the inherited unsafe global-leaderboard-reset RPC are blocked at this edge. Mailpit, PostgreSQL and service-role administration are not published.

The privacy review also removed inherited anonymous/authenticated execution grants from internal reset, score-finalization, notification, trigger and cleanup helpers in the clone. SQL privilege checks passed without invoking destructive helpers. The separate synthetic chat/realtime, quiz duel and Connect4 regression passed afterward, confirming authorized game completion still works.

## Validation

- New private origin returns healthy app/Auth responses, and delivered HTML, version manifest, JavaScript and CSS hashes exactly match the final local build.
- Nine private REST checks—missing, anon and invalid bearers across profiles, study state and roles—returned 401/403. Duplicate/nested selection bypass attempts were denied. Exact anonymous discovery/invite requests and valid signed-in own-profile reads passed.
- Actual recovery email reached Mailpit with the development hostname and `/supabase/auth/v1/verify` path. Following that verification endpoint returned a 303 redirect to the intended development recovery callback. No token or message body was printed.
- A full actual request/owner-approval API check through the new origin passed, delivered exactly two sink messages with development review/sign-in links and the 180 Academy sender, and removed its synthetic fixtures.
- Independent authenticated edge checks after the privacy migration saw zero other users’ raw study-state rows while own state and permitted peer projections remained readable.
- All 15 captured production container IDs, start times and running states were unchanged after server deployment. Original `supabase-db` remained healthy, with its existing start time `2026-08-24T02:16:59.456419152Z`.
- After public cutover, both TrueNAS tunnel containers received a configuration with 44 hostname routes, compared with 43 previously. The only added ingress entry was `dev.180.academy` to `http://192.168.1.1:55434`; every prior entry, including the catchall, remained structurally identical. The shared SHA-256 of those unchanged prior entries was `86f7446983780296f64dbfbd258f381e2768251608952c980d564fbb85d2dd56`. The production-container audit passed again after cutover with all 15 unchanged.
- Host capacity before deployment was approximately 6.1 GiB available RAM with 20 CPUs and load around 2.15. Existing test services used approximately 529 MiB; the two new services have an additional combined 640 MiB memory cap. Frontend compilation occurs on the Mac rather than the server.

## Updating or stopping the development runtime

Build with the explicit development API/origin, renewed test anon key and `VITE_DISABLE_LIVE_INTEGRATIONS=true`. Package only `dist/`, production `backend/` modules, `package.json` and `package-lock.json`; never package environment files or credentials. From the approved test worktree, an explicitly authorized update can use:

```sh
node scripts/staging/deploy-dev-artifact.mjs \
  --deploy-approved-dev \
  --release review-YYYYMMDDTHHMMSS \
  --artifact .dev-deployment.local/180-academy-runtime.tar.gz
node scripts/staging/dev-origin-smoke.mjs
```

The helper uses the existing Keychain-backed SSH access without printing its credential, verifies the exact clone/project, safely extracts the artifact, builds a new capped runtime image and recreates only the development web container. Confirm the served manifest/assets afterward. It does not change DNS, the proxy template, database policies, production services or main.

In an authorized server shell, stopping only the new web origin preserves all database and storage data:

```sh
docker compose -f /mnt/tank2/stacks/class180-ui-test-20260906/compose.json stop web dev-proxy
```

Use `up -d --no-deps web dev-proxy` with that same compose path to restart. For a runtime rollback, select the retained previous image in this test compose service and recreate only `web`; do not restore old broad data policies. Keep the clone, original database snapshot, releases and configuration backups until review is complete.
