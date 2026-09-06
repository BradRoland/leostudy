# Preview study-data privacy verification

The isolated database clone inherited `SELECT USING (true)` policies on `profiles` and `app_state`, and anonymous access to owner-role rows. Requiring a valid login at the preview proxy alone would not prevent a new account from reading other users' private study data.

Migration `20260906161504_private_study_state_public_profiles.sql` was applied **only** to `codex_class180_ui_test_20260906`. The live database and main branch were not changed.

Raw `app_state` is now readable only by its account owner. Profile display rows are limited to the signed-in user's active class, their own profile, or the platform owner's authorized view. Owner badges remain visible within the class; anonymous users and accounts without a class cannot enumerate roles.

The authenticated `public_study_profiles` view exposes explicit public study totals, game scores, streaks, level, appearance, biography/department, current activity, and an aggregate mastery count. It excludes first/last name fields, daily goals and study focus, per-code performance and algorithm snapshots, session histories, saved presets, notices, and unknown nested JSON fields. The view uses invoker/barrier protections over a private function that checks the current authenticated user and class membership. Frontend leaderboard, chat-profile, and duel-profile reads use that projection. Own-state hydration, progress saves, and bot personalization keep using private state.

`backend/private-study-profiles-acceptance.sql` passed against the clone with synthetic accounts in two isolated classes. Every fixture rolled back. It verified:

- Anonymous denial for raw state, profiles, roles, and the public projection.
- A new account without class membership can read only itself.
- Classmates can read permitted public summaries but cannot read or update each other's raw state.
- Cross-class summaries and profiles are excluded.
- Synthetic private markers in nested settings/history fields never appear in shared JSON.
- Public study totals, scores, streaks, level, styling, and both current and legacy aggregate mastery remain accurate.
- Own private settings remain intact and own progress updates succeed.
- Owners can review permitted summaries across classes while other accounts' raw state remains private.

TypeScript and targeted lint passed with no errors. Browser regression is recorded separately after the privacy change. Production rollout must include review and application of this migration alongside the frontend change; a frontend-only rollout would lack the new projection.

The catalog review also found that the inherited `reset_global_leaderboard_only()` administrative function granted browser roles execution while treating `current_user = postgres` inside `SECURITY DEFINER` as authorization. Because that identity is the function owner, it bypassed the intended owner check. The clone migration revokes execution from `PUBLIC`, `anon`, and `authenticated`, retaining service/admin access. Permission assertions verify the restriction without invoking the destructive function. The user-specific reset function checks `auth.uid()` and limits its mutations to that user; it remains available. Production remediation requires the user's later rollout approval; no live database permissions were changed.

Browser execution is also revoked for internal score-finalization, system-notification, trigger, and cleanup helpers. The unguarded score helper could otherwise complete an arbitrary room, and the notification helper could forge a system message. Authorized game RPCs still call these internally with their definer rights. No frontend calls these helpers directly. No enabled database trigger with an HTTP call was found in the clone.

After these restrictions, the isolated multiplayer acceptance passed again: actual class-chat insert/read and PostgreSQL realtime delivery, cross-class denial, quiz creation/join/readiness/scored rounds/forfeit completion, and Connect4 wrong-turn rejection plus a seven-move win and both result records. Only synthetic classes/users were involved and were cleaned up. All 18 local desktop/mobile browser tests also passed after the privacy projection change, including account enrollment, class approval, and password recovery.
