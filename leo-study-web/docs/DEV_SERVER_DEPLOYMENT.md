# 180 Academy development server

This deployment serves the separate GitHub `dev` branch at `dev.180.academy`, initially fast-forwarded from the tested `codex/class180-ui-overhaul-test` worktree. It runs independently of the Mac. The production website, Coolify application, main branch and original `postgres` database were not deployed or modified. Public routing and final browser verification are recorded separately in [Development domain rollout](DEV_DOMAIN_ROLLOUT.md).

**Public status:** [https://dev.180.academy](https://dev.180.academy) is live as of September 6, 2026. After the development-only DNS/tunnel cutover, four public requests verified healthy JSON and the exact final build ID, all with uncached Cloudflare `DYNAMIC` responses. The synthetic public browser checks are recorded in the rollout report.

**September 6 isolation correction:** A later audit found shared Docker service names intermittently routed production requests to development despite unchanged production containers. The four development services now use namespaced service keys and private-only compatibility aliases. See [Development service network isolation](DEV_NETWORK_ISOLATION.md) for the cause, repair, verification and rollback constraints.

## Server layout

- Host: TrueNAS `192.168.1.1`.
- Existing isolated compose project: `/mnt/tank2/stacks/class180-ui-test-20260906/compose.json`.
- Existing cloned database: `codex_class180_ui_test_20260906` inside `supabase-db`.
- Development web origin: `http://192.168.1.1:55434`. This specific LAN address allows all three existing tunnel replicas to reach the same origin. Mailpit and the direct test API retain their loopback-only bindings.
- Active web runtime: native Coolify application ID `7`, stable alias `academy-dev-web`, internal port `8789`, capped at 512 MiB and one CPU. It serves the compiled frontend plus account/class APIs and the class-request mail worker. The former `class180-ui-test-20260906-web-1` is stopped and retained for rollback.
- Reverse proxy: `class180-ui-test-20260906-dev-proxy-1`, capped at 128 MiB and half a CPU. It routes `/supabase/` to the existing isolated gateway, preserving realtime WebSocket upgrades, and other app routes to the web runtime.
- The proxy uses a read-only root filesystem, bounded temporary filesystems and `restart: unless-stopped`. The native application runs as the unprivileged Node user with all capabilities dropped and restart policy `unless-stopped`. Existing test Auth, REST, Storage, Realtime, gateway and Mailpit restart policies also use `unless-stopped`.
- Active runtime source: [Dockerfile.github](../ops/dev-preview/Dockerfile.github); retained manual artifact template: [Dockerfile.runtime](../ops/dev-preview/Dockerfile.runtime). Both use the verified Node 22.22.0 Alpine image digest.
- Reverse-proxy template: [nginx.conf](../ops/dev-preview/nginx.conf).

The native application uses the existing isolated `edge` Docker network, which connects the development proxy, test gateway and mail sink. The original private `test` network retains the other cloned services. The application does not join the production database network. The namespaced `academy-test-auth`, `academy-test-rest`, `academy-test-storage` and `academy-test-realtime` services retain a database-network attachment to reach the separately named clone. Their short aliases exist only on the private test network, and shared-network callers use namespaced development HTTP targets. See [Development service network isolation](DEV_NETWORK_ISOLATION.md). No production container was restarted or reconfigured.

## Retained releases and configuration

- Retained artifact release for rollback: `web/releases/b3854b5-dev-20260906T162216` beneath the isolated stack directory.
- Image: `180-academy-dev:b3854b5-dev-20260906t162216`.
- Artifact SHA-256: `b110168f9aeabb56ffd386fa965a3b672317ad3c4341872bec9c41ed9ad32d26`.
- Prior artifact build ID: `b3854b5d8d0e03695a3def0eba46a90f600a547c-dev-1788711736990`.
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
- Host capacity before deployment was approximately 6.1 GiB available RAM with 20 CPUs and load around 2.15. Existing test services used approximately 529 MiB; the two new services have an additional combined 640 MiB memory cap. The first artifact was compiled on the Mac; native GitHub updates now compile on the server. During the first native build, approximately 5.7 GiB remained available.

## Updating or stopping the development runtime

Normal updates are pushes to the exact GitHub `dev` branch. Coolify builds the new commit, runs the required checks, and replaces only the development web application after its health check passes. The existing proxy, cloned services and database remain in place. Stop or restart only application ID `7` in Coolify when managing the active web runtime.

For an explicitly authorized rollback to the retained manual artifact, pause automatic deployments on application ID `7`, start only the old `web` service from `/mnt/tank2/stacks/class180-ui-test-20260906/compose.json`, then restore `web/coolify/nginx-before-native.conf` over `web/nginx.conf`. Check the development proxy configuration and reload only `class180-ui-test-20260906-dev-proxy-1`. Verify the intended prior version and health before stopping the native development application. Keep the clone and its corrected data policies; a web rollback does not require a database restore.

The old artifact helper remains in the repository for explicitly approved manual review deployments. It is not part of the GitHub automation and requires its original test-worktree branch guard. The tracked proxy template now targets `academy-dev-web`, matching the active server configuration.

## GitHub-driven development runtime

A separate native Coolify resource was configured on September 6, 2026 for the exact `dev` branch. See [GitHub development deployment](DEV_GITHUB_DEPLOYMENT.md) for the build and runtime contract. Native deployment `80` completed successfully for commit `2d7da58d5932e5cb424662185c3a47463aaf5838`. At **17:36:26 UTC**, the development proxy switched to the verified healthy native application and the former artifact container was stopped. Public health returned 200 and the served version manifest matched that exact commit.

| Resource | Isolated development configuration |
| --- | --- |
| Coolify application | ID `7`, UUID `ju211x77a5m1va458ufqmhac` |
| Repository and branch | `BradRoland/leostudy`, exact branch `dev` |
| Environment | `development` within the existing product project |
| Logical server | ID `1`, UUID `lt3evedoadelsq2xysnow89w`, named `180 Academy development only` |
| Docker destination | UUID `o13fbfdemto8dgoeeqbdn1a8`, existing `class180-ui-test-20260906_edge` network |
| Stable alias | `academy-dev-web`, internal port `8789`, no host-port mapping |
| Runtime limits | 512 MiB RAM and 1 CPU |
| Build settings | One concurrent build; source-commit injection enabled; automatic Dockerfile ARG injection disabled |
| Build context / Dockerfile | `/leo-study-web` / `/ops/dev-preview/Dockerfile.github` |

The additional logical server profile points to the same already configured TrueNAS Docker engine using its existing SSH key. A read-only SSH preflight verified the engine identity. The destination uses the existing isolated edge network because Coolify’s checkout helper needs GitHub access. That network contains only the development proxy, cloned gateway and Mailpit; no production containers participate. Runtime guards still enforce the cloned gateway and mail sink. Its proxy type is `NONE`, Sentinel is disabled, and no host installer or validation job was run. This avoids attaching the production proxy to the isolated application network. The production server/application records retain their original settings.

The existing repository webhook is retained. Installed Coolify code normalizes a push ref and applies an exact `git_branch` filter before matching the canonical repository and checking the HMAC signature. Production application ID `5` remains on `main`; development application ID `7` is on `dev`. The existing secret was copied privately into only the new development resource. Preview deployments are disabled. No secret or administrator credential was added to GitHub.

Coolify's global HTTP API remains disabled. Configuration used the installed framework's normal controllers/models in the existing owner context, with a private, short-lived setup token. The setup token was revoked and its private file deleted after setup. Runtime credentials remain runtime-only; the sole explicit build environment key is the clone's public anonymous key, with the checked-out `SOURCE_COMMIT` supplied by Coolify.

The new logical profile does not run duplicate host cleanup. Forced cleanup, unused-volume deletion and unused-network deletion are disabled. This installed Coolify release has no cleanup-off switch, so its profile uses the never-occurring February 31 schedule (`0 0 31 2 *`). The installed scheduler catches the no-matching-calendar-date exception without dispatching cleanup or falling back to another schedule; a direct scheduler check confirmed this and server ID 1 had zero cleanup executions. Production retains its own existing maintenance settings.

Installed native Dockerfile deployment queues serialize deployments for the same application. The new image is built and checked before startup, and native rolling deployment retains the prior container until the new container passes its health check. A failed build never reaches the replacement step. A brief startup overlap on the development alias is possible; this environment does not promise zero downtime.

The initial push triggered native deployment `77` for the correct development commit. Setup exposed three platform-specific configuration issues: the first queued helper retained the initial internal network, the custom-run parser truncated a hyphenated security option, and the default health check used the wrong loopback address. These were corrected only on the new development resource. The effective health check now uses the installed wget fallback at `http://127.0.0.1:8789/api/health`; a separate Node request inside the container also returned 200. All build checks passed, and unsuccessful setup attempts preserved the previously served development site.

After successful cutover, all 15 production baseline container IDs and start times were unchanged. No `coolify-proxy` container exists on this host, and none was created or attached to another network. Production application ID `5` still has its August 2 deployment `58` at commit `7ce163bb6bb32bd17336295f2ee1eadfd36cc59d`. The API remained disabled, the new server had no cleanup executions, and `watch_paths` is empty so subsequent documentation-only pushes can verify the same automatic deployment path.
