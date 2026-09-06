# 180 Academy visual refresh coverage

All work is confined to `codex/class180-ui-overhaul-test` and the existing isolated preview/database clone. This document covers the second, app-wide visual refresh following the initial onboarding and approval workflow overhaul. Production and the main branch are unchanged.

## Shared presentation

The shared shell now uses the 180 Academy identity, a charcoal/white palette with electric-blue accents, consistent line icons, clearer sidebar groups, and coordinated desktop/mobile navigation. `Professional.css` owns the shared palette and controls. `FeatureRefresh.css` adapts feature layouts to that system. Auth/enrollment and chat have their own coordinated component styles.

## Feature-page inventory

| Screen | Layout work | Visual check |
| --- | --- | --- |
| Study hub | Four clear launch cards with icon panels and directional affordances; grouped study focus, metrics and reading lists | Desktop 1440px + mobile 390px |
| Flashcard setup/session | Separate setup header and action, readable subject controls, metric tiles, focus list, quiet session surfaces | Desktop + mobile |
| Quick quiz setup/session | Clear configuration groups, primary start action, roomier question/answer controls; selected/correct/incorrect feedback preserved | Desktop + mobile |
| Study guide | Reading canvas with compact domain navigation, modular overview, wrapping metadata and objective panels | Desktop + mobile |
| Practice test | Configuration and preparation panels side by side on desktop; compact module tabs and summary tiles; stacked phone layout | Desktop + mobile |
| Games hub | Four prominent mode cards; grouped filters; readable scoreboard names, ranks and scores | Desktop + mobile |
| Matching lobby | Coordinated setup controls, scoreboard card and filter rows | Desktop + mobile |
| Speed Test lobby | Coordinated setup controls, scoreboard card and filter rows | Desktop + mobile |
| Code Blaster lobby | Coordinated setup controls, scoreboard card and filter rows | Desktop + mobile |
| 1v1 lobby | Main create/invite/join controls now come before the class leaderboard in both DOM and visual order; refined room, player and sidebar panels | Desktop + mobile |
| Library | Two-column cards on desktop and one column on phones; separate code, title, mastery and accuracy hierarchy | Desktop + mobile |
| Stats | Metric grid, chart cards, structured focus lists and consistent data typography; two-column phone metrics | Desktop + mobile |
| Leaderboards | Consistent surfaces and score rows; long names retain room instead of wrapping into vertical fragments | Desktop + mobile |
| My class | Organized class cards, department chips, visible management actions and permission notices | Desktop + mobile |
| Class access / owner review | Shared class panels, responsive request details, primary review actions, management field grouping | Desktop + mobile + 320px, including actual synthetic class-admin controls and owner panels |
| Profile / account settings | Clear section navigation; grouped two-column fields on desktop; stacked fields on phones | Desktop + mobile |
| Scenarios | Compact module switcher, readable question canvas and answer controls, semantic feedback colors | Desktop + mobile |
| Support | Consistent tier cards, feature lists and primary actions | Desktop + mobile |
| Sign-in, signup, recovery, class enrollment | Coordinated 180 Academy identity, step layouts and field/button styles | Auth component owner verifies |
| Class chat and compact chat panel | Coordinated conversation, participant, composer and open/close controls | Chat component owner verifies |

## Branding audit

- Browser tab title and application metadata now say **180 Academy**. The self-contained `/favicon.svg` embeds the new generated logo on a white rounded square for legibility in light and dark browser tabs. See [Brand identity](BRAND_IDENTITY.md).
- Application-visible product headings and support copy are updated in the shared app. Auth branding is updated by its component owner.
- Class-request notification templates use **180 Academy**, including the requester sign-in action and the new blue button treatment.
- Specialized UI components contain no remaining `LEO Study`, `LEOStudy`, or `Elio Study` product labels.
- Existing storage keys, cache namespaces, internal service/package identifiers, schema/migration paths, and account data remain intact. These names are compatibility details rather than product labels.

## Verification performed for this refresh

- Rendered **17 feature routes at 1440×1000, 390×844 and 320×800** through the actual isolated Auth/API services; no uncaught JavaScript errors, empty pages, or horizontal document overflow.
- Inspected the resulting guide, practice, games, library, stats, profile and 1v1 screenshots and corrected inherited mobile layout overrides, cramped score rows and the 1v1 mobile content order.
- Owner admin, owner request review and actual class-admin controls were checked at 1440px/390px/320px in both light and dark themes using synthetic accounts. Text and selected controls were visually inspected. Temporary class/admin fixtures were removed, and the synthetic owner’s theme preference was restored after review.
- A copied-account customization check exposed an existing personal-workspace query that could select another member’s class when owner/admin permissions allow broad roster access. The query now explicitly filters the signed-in user; owner roster access remains unchanged. Theme saves skip unchanged department updates, and actual department failures retain the server’s readable message. `node backend/staging-personal-workspace-check.mjs` passed against disposable owner/admin fixtures with newer unrelated memberships, verifying actual RLS visibility, personal class/department/role selection, same-browser account switching, theme persistence without membership writes, preserved admin access, a readable simulated error, and a successful real department retry. All fixture users/classes were removed. No schema or copied-account membership repair was needed.
- Class-request service/email unit checks passed **11/11** after notification branding changes.
- Restarted only the local test preview helper and verified a complete synthetic HTTP request/owner approval flow delivered exactly two messages to the local SMTP sink. Both messages use the **180 Academy TEST** sender display name (the existing local test address is retained), the **180 ACADEMY** header and electric-blue actions; the requester action says **Sign in to 180 Academy**. The first check immediately after restart encountered a transport retry and exceeded its 35-second test window. SMTP verification then succeeded, and the unchanged complete check passed on the clean rerun. Queue retry behavior was preserved. All temporary request/class/user fixtures were removed, and the preview plus isolated Auth health checks passed. No external email was sent.
- Checked TypeScript after the 1v1 JSX order change. No event handlers, RPCs, state transitions, game-board geometry or answer evaluation logic changed.
- Intermediate feature screenshots are ignored local review artifacts because cloned leaderboard views may contain existing class names. Only deliberately synthetic review screenshots belong in committed artifacts.
- Final browser regression and compiled-bundle results are recorded in the [visual refresh test report](VISUAL_REFRESH_TEST_REPORT.md).

## Synthetic feature review images

- [Study hub — desktop](screenshots/feature-study-desktop.png) / [mobile](screenshots/feature-study-mobile.png)
- [Practice setup — desktop](screenshots/feature-study-practice-test-desktop.png) / [mobile](screenshots/feature-study-practice-test-mobile.png)
- [Library — desktop](screenshots/feature-library-desktop.png) / [mobile](screenshots/feature-library-mobile.png)
- [Stats — desktop](screenshots/feature-stats-desktop.png) / [mobile](screenshots/feature-stats-mobile.png)
- [1v1 lobby — desktop](screenshots/feature-duel-desktop.png) / [mobile](screenshots/feature-duel-mobile.png)

The 1v1 images use a temporary synthetic class with no real classmates; it was deleted after capture.
