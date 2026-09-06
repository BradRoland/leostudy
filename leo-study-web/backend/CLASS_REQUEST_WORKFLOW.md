# Class request workflow

The browser submits an authenticated request to `/api/class-requests`. The database validates the class name, academy, department list and dates and records the request and owner email event in one transaction. A pending requester with no active membership cannot enroll through another class or invite until the owner approves. Existing members retain access while requesting an additional class. The owner's email links to `/owner/classes?request=<request UUID>`; the owner must sign in before approving. Opening an email link never approves a request.

Approval creates a listed, active, open class and its departments, adds the requester as `class_admin`, and records the approval email atomically. The new class appears in enrollment immediately. Repeated submissions with an outstanding request return that request; repeated approvals return the same class. A conflicting existing class cannot be overwritten. Existing Class 180 accounts and historical study data remain intact, and its unlisted class remains closed to new enrollment.

For requesters without an existing membership, the request transaction also merges a profile-setup marker into user metadata. This covers Google requesters and ensures they complete their name, optional photo and study plan after approval. Other metadata keys and existing members' onboarding state are preserved. This marker controls the interface only; database roles and memberships control access.

## Deployment configuration

Apply `supabase/migrations/20260906035018_class_request_email_workflow.sql` to the target database before the application update. The migration has been exercised against an isolated copy of the existing database. No production migration is part of this test branch.

Set these **server-only** environment variables in the intended deployment:

| Variable | Purpose |
| --- | --- |
| `CLASS_REQUEST_EMAIL_ENABLED` | Set to `true` after verifying the target database and mail transport. Defaults to disabled. |
| `CLASS_REQUEST_EMAIL_FROM` | Verified sender address, optionally `180 Academy <address>`. Falls back to existing `SMTP_ADMIN_EMAIL`. |
| `CLASS_REQUEST_OWNER_EMAIL` | Owner's actual review inbox. Falls back to the configured `VITE_OWNER_EMAIL`; no address is invented. |
| `CLASS_REQUEST_APP_URL` | The deployment's full origin, e.g. its HTTPS staging/production origin. Used in both email links. Falls back to `VITE_AUTH_REDIRECT_BASE_URL`. |
| `CLASS_REQUEST_SMTP_HOST`, `CLASS_REQUEST_SMTP_PORT` | Existing SMTP service. Fallbacks: `SMTP_HOST`, `SMTP_PORT`. |
| `CLASS_REQUEST_SMTP_USER`, `CLASS_REQUEST_SMTP_PASSWORD` | SMTP credentials. Fallbacks: `SMTP_USER` and `SMTP_PASS`/`SMTP_PASSWORD`. |
| `CLASS_REQUEST_SMTP_SECURE` | `true` for implicit TLS on port 465, `false` for STARTTLS on 587. |
| `CLASS_REQUEST_SMTP_REQUIRE_TLS` | Defaults to `true`. Set `false` only for the isolated local mail sink. |
| `CLASS_REQUEST_EMAIL_TEST_RECIPIENT` | Optional override redirects **every** workflow message to this test recipient. Remove it before production delivery. |
| `RESEND_API_KEY` | Optional alternative HTTPS provider, used only when SMTP is not configured. |

No email credentials belong in frontend `VITE_*` variables. The existing public owner email fallback is only an inbox address. Production sender and owner configuration still require deployment verification; a mail sink test does not prove external inbox delivery.

For local development, run the backend with `HOST=127.0.0.1` and an unused `PORT`; the default host remains unchanged for Coolify. The Vite test environment proxies the request endpoints to that backend. Keep the isolated database's Auth SMTP pointed to its local mail sink too.

## Delivery and recovery

The backend checks `class_request_email_outbox` every 30 seconds and after successful request actions. Database row leases prevent concurrent workers from claiming the same event. Success records a provider receipt. A definite temporary transport failure retries with increasing delay, for at most eight attempts. Disabled or incomplete email configuration leaves the event pending.

SMTP cannot guarantee exactly-once delivery if a process stops after the mail server accepts a message. Ambiguous SMTP errors, expired worker leases, permanent failures, and exhausted retries become `needs_review`. Check the provider or mail sink before retrying these events. The service never automatically resends them. HTTPS delivery uses a stable Resend idempotency key and never retries past its 23-hour safety window.

The queue is accessible only to the server service role. Operators can inspect status, attempts, `last_error`, and `provider_message_id` there. After confirming a message was not delivered, reset only that reviewed event to `status='pending'`, `attempts=0`, `available_at=now()`, `first_attempt_at=null`, `lock_token=null`, and `locked_until=null`. Do not reset a delivered event. Queue state never changes class approval or membership.

## Verification

`node --test backend/class-request-service.test.mjs` exercises authorization, validation, all mail templates, safe test routing, SMTP/HTTPS errors, retry behavior and duplicate drain suppression with mocked transports.

`backend/class-request-acceptance.sql` executes real Postgres assertions inside a rolled-back transaction. Run it only on a disposable staging database. It checks requester identity, RLS, invalid input, owner-only approval, idempotency, dynamic enrollment, department isolation, admin/cadet roles, original profile/membership preservation, queue leases and recovery states. These tests never deliver external email.

`node backend/staging-class-request-check.mjs` runs real HTTP submission/approval and SMTP delivery through the isolated localhost test stack, using `.env.staging.local` and `.test-accounts.local`. It rejects nonlocal API/mail targets, creates and cleans up its own synthetic requester and class, and verifies exactly two messages in the local inbox. This check passed with actual owner authorization, department/admin assignment, and email links. It does not send to an external inbox.

`node backend/staging-multiplayer-check.mjs` checks existing features against the same isolated API using three synthetic users in two new unlisted classes, then removes its fixtures. Verified: class chat persistence and real Postgres realtime delivery; cross-class chat read/write and duel join denial; quiz duel creation, joining, readiness/countdown, scored round submissions and forfeit completion; Connect4 turn enforcement, seven legal moves, a vertical win and final result records. This is an API/database gameplay regression check, not a complete browser playthrough of every game mode. The test does not enable disabled features or communicate with real class members.
