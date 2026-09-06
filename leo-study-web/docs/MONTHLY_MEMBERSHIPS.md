# Monthly memberships — development verification

Development-only implementation. Do not apply this migration, configure live prices, update the production webhook, or merge into main until Brad approves the release.

## Benefits

| Feature | Free | Plus — $5/month | Pro — $10/month |
| --- | --- | --- | --- |
| Core code study, games, class community | Included | Included | Included |
| Earned levels, streaks and daily rewards | Included | Included | Included |
| T-MAS practice and scenario training with answer review | — | Included | Included |
| Personal accuracy trends, mastery and subject breakdowns | — | Included | Included |
| Session history and weekly activity | — | Included | Included |
| Themes | Academy Blue | Academy Blue, Pastel Sky, Ocean Mint, Obsidian Black | All ten themes |
| Membership profile badge | — | Plus | Pro |
| Personal weekly goal and weakness-based study plan | — | — | Included |
| Focused code drills | — | — | Included |
| Saved T-MAS setups | — | — | Up to eight |
| 28-day study calendar and previous-week comparisons | — | — | Included |
| Downloadable CSV progress report | — | — | Included |
| Name font, glow and color | — | — | Included |
| Pro Crest and Pro Laurel profile frames | — | — | Included |

Original one-time supporter purchases retain their original cosmetic permissions. New analytics and T-MAS tools require a current monthly membership. Earned levels, scores, progress and class membership do not depend on payment. Public classmate totals and competitive leaderboards remain part of the free class community; personal analytical dashboards and trends require Plus or Pro.

## Billing and access

The application creates authenticated Stripe Checkout Sessions in subscription mode using exact server-configured monthly prices. It binds customers to authenticated account IDs, reuses open checkouts, serializes competing requests with database leases, and sends existing subscribers to the configured customer portal. Browser-selected prices, customer IDs and paid roles are never authoritative.

The sandbox portal cancels at the period end, prorates upgrades with an invoice, and schedules price decreases for the next renewal. A cancellation or failed invoice cannot erase an already paid period. Access extends only from an authoritative paid invoice for the configured subscription price. Duplicate and delayed events reconcile current Stripe state; database sequences reject older snapshots. Both API checks and the profile-badge projection evaluate expiry against the database/server clock. The browser rechecks on focus and periodically, and removes perks at the paid boundary. Expired users retain access to billing management so they can resolve payment problems or review invoices.

New subscriptions are separate from `profiles.supporter_tier`, which remains the protected legacy purchase value. Subscription/customer rows are readable only by their owner, and writes and reconciliation RPCs are restricted to the backend. Public badges expose only minimal expiry information. Private saved practice preferences are excluded from public study profiles.

## Practice content and Pro reports

Builds generate a private backend question bank containing four practice modules and 275 scenario-training entries. The authenticated content endpoint checks a current paid membership; Pro reports check Pro and read only the authenticated user's study records. Anonymous and free scenario reads are restricted by database policy as well. Public bundles are checked for all 441 private scenario stems during every build. No private bank is copied into the public asset directory.

Reports use UTC calendar days and Monday-based weeks. They describe recorded practice, not official exam readiness. Empty reports show no invented scores. Pro preferences confirm database persistence before displaying a saved message. CSV output escapes spreadsheet-formula prefixes.

## Verification on the isolated clone

- Real Stripe sandbox $5 and $10 monthly Checkout payments caused signed webhooks to grant the correct plan.
- A real test-clock renewal extended access; a declined renewal recorded past-due status without extending it.
- Scheduled cancellation retained the paid period. A short-lived disposable entitlement and badge expired without another webhook.
- Duplicate delivery remained idempotent. Opening an unpaid checkout granted nothing. Existing subscriptions opened the correct customer's portal.
- Forged client grants, anonymous membership reads, cross-account subscription reads, and free scenario access were denied.
- Database tests covered old event sequences, wrong customer bindings, paid-time preservation, checkout lease ownership, and private preference persistence.
- Browser checks covered Free/Plus/Pro comparisons, keyboard tabs, theme gates, all ten theme button contrasts in both modes, paid practice and reports, focused drills, saved setups and reload, CSV download, mobile layouts and expired access.
- General regression covers sign-in, password recovery, onboarding, approval emails through the local sink, class rosters, daily rewards, solo-game setup, and account settings. The profile-refresh test was updated to intercept the new profile projection while continuing to count writes to the original profile table.
- The application build includes a public-bank exclusion check. Lint retains nine pre-existing hook warnings and no errors.

Tests create disposable users/customers and remove their fixtures. The retained local Supabase clone is the only database changed. No production data or live Stripe configuration was changed.

## Configuration and remaining production checks

Use `STRIPE_MONTHLY_PRICE_TIER5`, `STRIPE_MONTHLY_PRICE_TIER10`, `STRIPE_PORTAL_CONFIGURATION`, and `ACADEMY_PUBLIC_URL` on the server. Retain legacy checkout mappings for old purchases. The public development deployment deliberately keeps checkout and all live integrations disabled; local sandbox verification uses the authorized Stripe CLI without exporting its OAuth credential into server configuration.

Before a separately approved production rollout, review and apply `20260906225006_monthly_academy_memberships.sql`, configure verified live monthly prices and the matching portal, and subscribe the Academy webhook to checkout completion/async success, subscription lifecycle updates, invoice-paid and invoice-failure events. Preserve the unrelated billing application's webhook. Confirm hosted Checkout/portal screens and an actual return-to-app flow in the intended environment. Sandbox verification exercises application checkout/reconciliation logic with the official CLI transport and real signed events; it does not establish that live credentials or hosted browser screens are verified.

Tax is not configured for these new monthly sandbox plans: the sandbox's Tax Settings are pending and it has zero active registrations. No tax registration was invented or enabled. Confirm the appropriate product tax classification and collecting registrations before enabling and testing tax collection for production. No live tax change has been made.

The local payment, access, and UI checks are in `backend/staging-monthly-sandbox-check.mjs`, `backend/staging-membership-access-check.mjs`, and `backend/staging-monthly-ui-check.mjs`. Run them only with the isolated clone and sandbox configuration described in their source. The sandbox runner is opt-in and requires the official Stripe CLI plus its authorized isolated profile.
