# Roland membership testing

Development only: Settings → Roland exposes Plus, Pro and Remove test membership controls for Roland's existing account ID (`90f1b543-e768-4d48-95da-bec61dd9a193`) while it retains the owner role. A renamed account or another owner does not qualify.

Test grants last seven days, have no automatic renewal, and use an explicitly marked development entitlement. They exercise the existing membership, badge, content, analytics, Pro preference and coach quota checks. Switching plans updates the same test entitlement. Removing it deletes only that row and recalculates badges from any remaining subscriptions; earned progress, legacy purchases, other users and Stripe billing are preserved. Existing separately purchased access may therefore remain after removing test access. Daily coach usage is not reset by switching plans.

The backend verifies the signed-in account and current database owner role. It permits only the development origin/gateway or the isolated local relay with live integrations disabled. The database function is executable only by the service role and independently requires the exact development database, Roland ID and owner role. Direct client writes remain disabled. There is no change to the main branch or production database.

Verification: unit tests cover exact environment restrictions, other-account denial, role removal and tier validation. The guarded browser check tests Roland's Plus/Pro grants, persistence after reload, downgrade, removal, paid API access and mobile layout. It checks anonymous, cadet, other-owner and direct-client-RPC denial, and restores the account's original test entitlement and badge state afterward. Admin-generated sign-in links are consumed directly for testing; no emails are sent or passwords changed.

Run `node backend/staging-roland-membership-check.mjs` with the existing isolated relay. To test the deployed development UI, add `ACADEMY_CHECK_ORIGIN=https://dev.180.academy`. Never point it at production.
