# Supporter payments: development verification

Development-only change. Do not merge to `main`, migrate the production database, or edit the live Stripe configuration without approval.

## Findings and corrections

- A synthetic ordinary user in the retained clone could update `profiles.supporter_tier` to a paid tier. The new migration removes browser write privileges for that column while retaining ordinary profile inserts and edits. Client profile upserts no longer include the cached tier.
- Checkout completion previously granted access without checking payment status. Both webhook servers now use a shared dispatcher, retrieve the authoritative Stripe Checkout Session, require a completed **paid one-time** purchase in the expected mode, resolve an exact configured Payment Link or Price ID, and reconcile its academy account.
- Amount, product-name and metadata fallbacks are removed: unrelated products in this shared Stripe account must not become supporter purchases.
- `fulfill_supporter_checkout` is a service-only, security-invoker RPC. A private RLS-protected ledger and the profile grant commit together. Duplicate/concurrent delivery is idempotent, conflicting reuse fails, database failures remain retryable, and a delayed lower-tier purchase preserves higher access.
- The legacy manual grant endpoint is restricted to Stripe test keys. Preview payment endpoints remain disabled.
- The home page displays a supporter invitation outside the collapsed class panel. Support describes actual available benefits and separate one-time purchases, including possible tax. Preview checkout buttons are visibly disabled. Missing/invalid links and refresh failures have user-facing messages.
- Returning focus from Stripe refreshes server-owned entitlements. The visible support page also checks every 15 seconds. A manual refresh remains available. Uploaded avatars and earned study progression are preserved.

## Verified Stripe configuration (read-only, September 6, 2026)

The connected account is named **LEO Study** and was inspected in live mode; a separate LEO Study sandbox is now connected. Its three active Payment Links sell one-time USD products of $2, $5 and $10, with automatic tax enabled. The production app's configured Price IDs and browser links match these objects. Server Stripe and signing credentials are configured (values were not displayed).

The academy webhook is enabled at `https://180.academy/api/stripe/webhook`, but subscribes only to `checkout.session.completed`. A separate billing-system webhook exists and must be left alone. The academy endpoint will also need `checkout.session.async_payment_succeeded` when this change is approved for production. All three live links currently use Stripe-hosted confirmation rather than an academy return redirect. Sandbox links created for this audit use a development support-page redirect and card payments; automatic-tax behavior still needs separate sandbox coverage.

## Verification

- 100 unit tests passed, including 14 payment tests covering paid/unpaid/delayed events, exact product mapping, user reconciliation, invalid signatures, wrong mode, unsupported recurring purchases, and retryable failures.
- `node backend/staging-supporter-access-check.mjs` passed against the explicit localhost clone gateway. It verifies forbidden paid inserts/updates/RPC calls, legitimate profile creation, one paid grant across six concurrent deliveries, profile preservation, higher-tier preservation, conflicting session rejection, and rollback/retry after a missing-user failure. Disposable accounts are removed afterward.
- `node backend/staging-supporter-ui-check.mjs` passed with a real browser and disposable clone account. It checks the visible home invitation, preview checkout lock, all three tier feature gates, focus refresh without re-login, profile saving after a grant, and desktop/mobile widths. The synthetic service grant does **not** represent a real Stripe checkout.
- `backend/staging-stripe-sandbox-check.mjs` passed using the officially authorized Stripe CLI in the retained **LEO Study sandbox**. Genuine paid Checkout Sessions for all three configured prices generated Stripe-signed events, automatically granted the matching tiers in the clone, and remained idempotent on signed replay. Actual unpaid/expired sessions and a declined test card did not grant access. Missing/invalid signatures were rejected. Disposable academy users and their grant records were removed afterward.
- The sandbox harness calls the same fulfillment/resolver/dispatcher used by the application. Stripe's CLI performs authoritative API reads using its secure OAuth login; credentials are not exported. A temporary loopback-only listener verifies Stripe signatures and calls the shared fulfillment code. This verifies real Stripe events and database grants, but does not exercise the production HTTP server's SDK/configuration or a human clicking through hosted Checkout.
- With `STRIPE_TEST_ASYNC=1`, genuine SEPA sandbox events also passed: unpaid completion did not grant access, delayed success granted tier2, and delayed failure left the account free. The official CLI async fixtures require EUR, so the test used one temporary EUR price mapped only inside the harness. Its cleanup command initially used the wrong boolean argument syntax; the corrected archival command was then run separately. The three USD supporter prices were unchanged.
- TypeScript/Vite staging build passed. Lint has no errors and nine pre-existing warnings.
- All 30 authentication, class-request approval and roster browser scenarios passed on desktop/mobile with trace recording disabled. Earlier trace runs exhausted temporary disk space; the clean rerun passed. The development deployment completed successfully, and the same supporter browser smoke check passed against `https://dev.180.academy` using disposable accounts in the clone.

## Still required before payment readiness

The existing sandbox is connected and contains three matching test products/prices and card Payment Links (tagged academy-development-testing). The sandbox links return to the development support page and do not enable payments in the public preview. Real card and delayed-payment event-to-role checks, declines and expired-session checks passed through the isolated local harness. Hosted Checkout browser interaction, automatic tax and the production server configuration still require verification. Browser automation currently reports no connected browser. The published dev image intentionally refuses Stripe credentials; do not weaken that isolation to test payments.

Refunds and disputes currently do not revoke one-time supporter access automatically. Decide the access policy before implementing revocation; do not guess a user's entitlement should be removed. Subscription lifecycle handling is outside the current one-time product configuration.

Before an approved production rollout: deploy the client that omits the tier from profile saves, apply the reviewed column/ledger migration, deploy the webhook changes, add the delayed-success event, and verify endpoint delivery and role assignment. The migration is required by the new fulfillment code. No production action has been taken as part of this verification.
