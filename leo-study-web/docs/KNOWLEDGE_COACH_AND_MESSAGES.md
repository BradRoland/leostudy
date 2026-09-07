# Knowledge insights, AI coaching and classmate messages

Development branch only. The migrations were applied to `codex_class180_ui_test_20260906`; production and main remain unchanged.

## Study evidence

Paid members get a searchable knowledge map covering the bundled Penal, Health & Safety, and Vehicle Code library. Accuracy weights recorded answers, coverage counts practiced codes, and untested material is separate from weaknesses. Fewer than five answers is an early signal; focus areas have at least five answers below 70% accuracy. Mastery requires 20 consecutive correct answers. Direct review buttons open the relevant flashcard. These are practice measures, not an exam readiness prediction.

The coach also receives aggregate recorded study time, flashcard/scenario counts and per-mode session accuracy for up to 200 saved sessions over the last 14 days. Session averages and per-answer accuracy remain explicitly distinct. The older activity and game details remain available in an expandable section.

## Subscriber coach

Both Plus ($5/month) and Pro ($10/month) include the coach: Plus has 20 requests per UTC day, Pro 60. Presets explain results, identify gaps, build a 15-minute plan and improve study routines. Follow-up questions retain four conversation turns in memory; closing/reloading the page does not create persistent AI chat history. Suggested code reviews link only to codes in the authenticated user's evidence.

The model is `gpt-5.4-nano-2026-03-17`, using the Responses API, low reasoning and a strict structured response. GPT-5 nano was also evaluated; 5.4 nano gave more useful, specific guidance on the synthetic weak-topic case. Official pricing checked September 7, 2026: $0.20 per million input tokens and $1.25 per million output tokens. See https://developers.openai.com/api/docs/models/gpt-5.4-nano.

At 6,000 input tokens and the 1,600-output-token cap, a request is approximately $0.0032. At those assumed sizes, daily personal maximums imply roughly $1.92/month for Plus or $5.76/month for Pro over 30 days, before caching. Actual token usage varies. A development-wide 500-request/day limit provides an additional guardrail; it is a request cap, not a guaranteed dollar budget. Review usage before approving production scale.

Requests have a 45-second timeout, 30 KB body limit, 1,000-character question limit, bounded context, a per-user concurrency guard, and a 15-minute account-specific cache. Database reservations are atomic and survive server restarts. Failed model calls count toward the daily allowance. Cache hits do not consume another request; the displayed remaining count on a cached response reflects its original reservation.

The server verifies current paid access on every insights/coach request, including cache hits. It ignores client-supplied user identities and reads only the authenticated account's study state. The model receives no name, email, profile photo, class chat or DMs. The user sees the data-sharing explanation before asking. OpenAI requests use `store: false`; this does not claim zero provider-side abuse-monitoring retention. There are no browsing tools or autonomous actions. Model suggestions may be mistaken and are presented as coaching, with course material as the source for legal content.

`OPENAI_API_KEY` and `STUDY_COACH_ENABLED=true` are runtime-only settings in Coolify development application 7. No `VITE_` key or browser secret is used. The ignored local `.env.coach.local` is for local verification only. Do not copy credentials into source, logs, reports or frontend build arguments.

## Direct messages and competition

Classmate profile actions open private conversations beside the class chat. The dock supports three recent windows on wide screens, tabs on narrower desktops, and one active conversation on mobile. It includes an inbox, unread markers, pagination, retry-safe sends, blocking, minimize/restore and reconnect refreshes. Gameplay hides the dock so it cannot cover controls.

Database row policies permit message reads only to the two participants while both remain active classmates. Direct table writes are disabled; authenticated functions determine sender identity, enforce class membership and blocks, deduplicate retries and limit sends to 20 per minute. Removing class access prevents subsequent history reads and sends. Realtime subscriptions obey the same row policies. Threads, messages and read markers use Realtime; polling provides a reconnect fallback.

Game launches and round summaries use consistent surfaces, typography and reward displays. Personal historical game analytics require membership; current-round results remain available to everyone. Leaderboards compare the same game, code set and duration, highlight the current user, and retain class-scoped score policies. Realtime publication was enabled for class score tables and self-only game history; private app-state rows were not exposed for leaderboard updates.

## Verification

- 124 local unit tests passed, including weighted evidence, malformed inputs, aggregate-only context, model response validation, account-specific cache isolation and unavailable/quota failures.
- Local clone API and database checks cover unauthorized/expired membership, outsider message reads, sender spoofing, duplicate concurrent sends, blocks, removal of membership, daily allowance enforcement and denied client access to quota functions.
- Two-browser checks cover profile-to-DM, bidirectional live replies, adjacent class chat, minimize/restore, mobile overflow, code filters and a real paid coach response.
- Real model evaluations covered known weak-topic evidence, no recorded data, and a request to reveal another user's messages or invent an exam score. The coach declined the private-data/invented-score request.
- Desktop/mobile game setup checks cover keyboard focus, Escape cancellation, saved choices, launch and exit. Timed Matching/Speed rounds exercise the actual completion UI.

Run `npm test`, `npm run lint`, `npm run build:staging`, and (against the explicitly guarded clone) `ACADEMY_REAL_AI=true node backend/staging-knowledge-messaging-check.mjs`. Set `ACADEMY_CHECK_ORIGIN=https://dev.180.academy` to exercise the deployed development UI. This fixture script creates and removes synthetic users; real AI verification incurs small API usage. It must never target production.
