# Development progression and private rooms

Implemented on `dev` for `dev.180.academy`. The migration was applied only to the retained database clone `codex_class180_ui_test_20260906`. Production and `main` remain unchanged.

## Unlock journey

| Level | Unlock |
| --- | --- |
| 1 | Core practice, basic bot matches, and joining classmates’ rooms |
| 3 | Additional Blaster match timers |
| 5 | Connect Four, including bot practice and multiplayer |
| 6 | Blaster power-ups |
| 8 | Rope overtime controls |
| 10 | Custom room hosting and classmate invitations |
| 12 | Knockout / To the Death rules |

Room modifiers are selected by the host. Guests may join an equipped room without owning its host controls; Connect Four requires both participants to reach Level 5. Membership does not bypass these earned unlocks. Existing purchased features are unchanged.

## Challenges and XP

Home offers two daily challenges drawn from a catalog of 100 goals. The deterministic rotation covers every goal once in 50 days, then repeats. A migration preserves the current day’s existing goals and begins the new rotation at the next midnight UTC. Goals cover four free practice modes, three code sets, accuracy, improvement and variety, awarding 60–120 XP. See `DAILY_CHALLENGE_CATALOG.md` for the full list. Weekly challenges also draw two goals from a separate 100-goal catalog, covering all goals once in 50 weeks. The new weekly pool starts next Monday UTC after migration, preserving the current week’s original goals and claims. Weekly rewards range from 200 to 380 XP. See `WEEKLY_CHALLENGE_CATALOG.md`. Home shows only current goals, progress and rewards; catalog totals and rotation mechanics stay out of the interface. A session needs at least five answered questions in recorded practice tests or solo games. Opening or abandoning a game does not count. Flashcard browsing and bot warmups do not count toward these particular session challenges.

Challenge receipt times, reset windows, amounts and claims are maintained in a private database schema. Daily windows start at midnight UTC; weeks start Monday UTC. Unique claims and row locks prevent repeat awards, including concurrent requests. Claimed XP survives period resets. The UI refreshes after saved attempts, on focus, and every 30 seconds while visible.

The server derives levels from saved study counters, achievements, scores and duel results, plus separate daily-reward and challenge ledgers. Historical XP is imported once as a protected offset; subsequent profile display snapshots cannot grant levels. Earned XP has a high-water mark, so resets or leaderboard changes do not remove unlocks. New daily and challenge rewards are added outside that high-water mark so none are swallowed by an older snapshot.

Existing study counters and game results are still reported by the application. This change protects reward accounting and room authorization; it does not replace the entire application with server-authoritative answer validation or provide comprehensive anti-cheat protection.

## Private room flow

Hosts choose Private (Code), receive a six-digit code with a Copy code action, and share it with a classmate. The join field preserves leading zeros and accepts spaces or hyphens when pasted. Private rooms are absent from public listings. Only participants can retrieve private room details and the code.

Joining locks the room row before checking its capacity. Incorrect or missing codes are rejected even if a room UUID is supplied. Active-class restrictions, closed/full-room checks, legitimate invitation access and idempotent joins remain enforced. Direct client writes cannot add room members or change room settings; the heartbeat retains only its `last_seen` update permission. Creation triggers cover legacy RPC overloads as well as the current one. Connect Four eligibility is also checked at participant insertion to cover invitation acceptance.

## Validation

- `backend/staging-progression-check.mjs`: disposable users/classes; exact hosting boundary; legacy RPC and forged snapshot rejection; wrong/missing codes; leading zeros; private details/list isolation; forbidden direct writes; cross-class rejection; idempotent, concurrent, full and closed room joins; Connect Four and knockout gates; permanent XP and additive daily rewards; incomplete/unknown/duplicate challenge claims; account isolation; browser Home, locked controls and a real two-browser private-room start.
- `backend/staging-daily-rotation.sql`: all 100 goals, exact and duplicate XP awards, premature/inactive claims, wrong mode/code set, short attempts, recomputed accuracy, chronological improvement, suggested next practice and the entire 50-day rotation. All changes roll back.
- `backend/staging-weekly-rotation.sql`: 100-goal weekly evaluation, whole-week selection stability, current-period claims and duplicate prevention, distinct-day conditions, wrong modes and code sets, weekly rollover and protected catalog access.
- `backend/staging-blender-avatars-check.mjs`: all seven images, actual WebP upload and profile persistence, earned locks, mobile layout, absence of catalog marketing, and future daily/weekly goal routing.
- `backend/staging-progression-calendar.sql`: transaction rolled back after verifying distinct study days, weekly rollover, retained XP and UTC day boundaries under a different database timezone.
- Existing multiplayer regression: scored quiz rounds, forfeit completion, Connect Four turn order/win/results and class-chat realtime isolation.
- Existing visual multiplayer smoke: light/dark desktop and narrow mobile layouts, private create, host mode change, leave and actual bot launch.
- Unit tests cover unlock XP boundaries and room-code normalization. Type checking, lint and production build remain required; private paid scenario text must remain absent from the public bundle.

Browser checks accept only localhost or `https://dev.180.academy`; database checks require the clone relay. Fixtures are removed in `finally`. Never point these checks or the calendar SQL at production.
