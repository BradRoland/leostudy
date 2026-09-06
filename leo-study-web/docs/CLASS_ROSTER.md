# My Class roster

`/classes` now opens **Your Class Workspace** with the active class's full roster, rather than class discovery, enrollment, switching, or request controls. Signup, invites, owner review, and class access administration retain their existing separate routes.

The roster lists each current class member's display name, photo, department, study time, study streak, mastered codes, and class-specific 1v1 wins. Names and View stats open an accessible profile dialog with the same data plus best study streak, flashcards, scenarios, solo games, losses, and win streak. Search matches names/departments; Refresh roster reloads membership and stats.

## Data boundaries

- The existing authenticated `list_class_member_departments` function supplies current members of the active class. Other-class access is denied by the existing database function. No new migration or database permission is needed.
- Membership pages are ordered by user ID and read to completion in groups of 100. Profile and stats requests use batches of 40 IDs to fit gateway limits.
- Membership drives the list, so users without an app-state row remain visible with zero activity. Profiles and the existing `public_study_profiles` projection supply only display information and aggregate study stats. The page never reads classmates' raw private app state.
- Multiplayer queries include the active class ID and aggregate game type. Study totals reflect existing academy-wide study progress.
- Loading, errors, refreshes, account changes, and class changes clear the previous roster. Stale requests cannot populate another workspace. A failed stats fetch displays a retryable error instead of presenting false zero statistics.

## Verification

The roster browser suite covers a three-person synthetic class, a newcomer without study state, an outsider, a removed member, known profile/stat values, keyboard close/focus restoration, search, error/retry, a 101-member pagination fixture, and 1440/390/320-pixel layouts in both themes. Synthetic fixtures are created and removed only in the retained local clone.

```sh
npx playwright test tests/e2e/class-roster.spec.ts
npx playwright test tests/e2e/class-request-flow.spec.ts tests/e2e/staging.spec.ts
npm test
npm run lint
npm run build:staging
```

After the exact development release has settled, the same roster suite can verify the public site:

```sh
CLASS_ROSTER_PUBLIC_CHECK=true CLASS_ROSTER_EXPECTED_COMMIT=<full-dev-commit> npx playwright test tests/e2e/class-roster.spec.ts
```

This mode is pinned to `https://dev.180.academy`; it verifies the expected source commit before creating fixtures. Fixture administration stays on localhost, and browser traffic is restricted to the development origin. It does not authorize a production deployment or database change.
