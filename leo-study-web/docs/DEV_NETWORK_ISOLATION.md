# Development service network isolation

The development Auth, REST, Storage and Realtime services reach the retained cloned database through `supabase_default`. A separate database name does not isolate Docker DNS. During the production sign-in audit on September 6, 2026, their original Compose service keys (`auth`, `rest`, `storage`, `realtime`) registered implicit aliases on that shared network and intermittently captured production traffic. Production container IDs and start times remaining unchanged did not detect this interference.

The corrected development service keys are `academy-test-auth`, `academy-test-rest`, `academy-test-storage` and `academy-test-realtime`. Their short compatibility aliases exist only on the project's private `test` network. Do not add these short aliases, or production container names, to the shared database network. Compose service names themselves are aliases; setting an empty explicit alias list does not remove them.

Services attached to the shared database network must also use namespaced development HTTP destinations. Storage uses `POSTGREST_URL=http://academy-test-rest:3000`; `IMGPROXY_URL` is empty while `ENABLE_IMAGE_TRANSFORMATION=false`. A gateway attached only to the private test/edge networks may retain its short upstream names.

The reusable `scripts/development/compose-isolation.mjs` guard checks service names, network aliases, container/host names, default or array network attachments, and shared-network HTTP destinations. The retained artifact deploy fetches only sanitized topology and HTTP hostnames, validates them before writing a release, then checks the Compose file's SHA-256 again before mutation. Ten Node-only regression tests cover the original implicit-alias failure, explicit alias restoration, hidden network mappings, and inter-service HTTP targets. Normal native web deployments do not rewrite this Supabase topology.

After any development stack/network change, inspect actual Docker endpoint aliases and repeatedly resolve production service names from the production gateway. Verify production Auth settings, REST and Google authorization/cancel redirects resolve only to production, and verify development login, own-state reads and Realtime still reach the clone. Source/environment checks alone cannot establish DNS isolation.

## Verified repair

At approximately 01:10 UTC on September 7 (September 6 Pacific time), only the four development services were recreated with the namespaced keys. Their original image versions, cloned database, keys and persistent storage were preserved. The four superseded development containers were stopped, disconnected from the shared network and removed explicitly without deleting volumes. Production services were not restarted. The private pre-repair Compose backup is under `backups/pre-service-name-isolation-20260907T010946Z`; it contains credentials and must never be published.

Before repair, four of eight repeated production Google authorizations returned "provider is not enabled" because they reached development Auth. After repair:

- All 12 production Auth settings requests reported Google enabled.
- All 8 production class-discovery API reads returned HTTP 200.
- All 16 OAuth initiation and canceled-callback checks used Google's production Supabase callback and returned to `https://180.academy`. Cases covered the normal callback, the callback with a next-page parameter, no requested redirect, and a deliberately requested development URL. Development redirects were rejected in favor of the production site.
- Production `/signin`, `/api/health`, and `/app-version.json` returned HTTP 200. The original August 2 build remained served; its main JavaScript SHA-256 was `3078f72fe15a933bfc92ea6489f3a7cd480a5980565f3850a20bcb177e454b56`, with no development-domain reference.
- GitHub main and production deployment 58 remained `7ce163bb6bb32bd17336295f2ee1eadfd36cc59d`; production Coolify application 5 remained on main and development application 7 remained on dev.
- All 15 saved production container IDs, start times and running states matched the pre-development baseline.
- The production database remained `postgres`, healthy, with 98 profiles, 101 Auth users, 100 class memberships, 3 class records and 21 storage objects at the audit. New development subscription, checkout-lease and class-email-outbox tables were absent. Read checks reported zero database deadlocks. No production application data or schema was written or restored by this repair.
- Production and development Auth signing secrets differed; production rejected a real development session with HTTP 401.
- Development email/password sign-in, own profile, own `app_state`, Realtime subscription and avatar upload/download passed. The disposable avatar was removed. Both production and development storage health endpoints returned HTTP 200.
- The new isolation guard accepted the actual sanitized server topology and all ten regression tests passed.

The OAuth checks exercised real server authorization and cancellation redirects. They did not complete a human Google account sign-in or consent; browser control was unavailable during the audit. They should not be described as full successful-account sign-in tests.

## Restart and rollback

Keep the corrected service keys and aliases during every restart or rollback. Restore only the intended development application image or proxy configuration; never restore an old Compose backup wholesale because it can reintroduce the collision. If cloned services must be recreated, target the four `academy-test-*` services explicitly and preserve their existing volumes, keys and cloned database. Remove only identified old development containers. Do not use project-wide `down`, broad orphan removal, volume deletion, production service restarts, or a new production database copy as part of this repair.

The shared host and PostgreSQL container remain resource dependencies. This setup separates application deployments, Auth configuration/signing keys and named databases; it is not a separate physical server or PostgreSQL process. Moving the retained clone into its own database container is a separate isolation project requiring a tested migration of current development data.
