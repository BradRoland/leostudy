# CodeReady iPhone App Starter

This folder contains a SwiftUI starter implementation based on the product requirements in `PRD.md`.

## Included in this starter
- App entry point and shared state (`CodeReadyApp`, `AppState`)
- Core models for California code study content
- In-memory repository with sample California Penal/Vehicle sections, quizzes, flashcards, and scenarios
- Tab structure:
  - Library
  - Study
  - Games
  - Scenarios
  - Test Mode
  - Progress
- Supporter tier gating stubs (`$2`, `$5`, `$10`) and full-sync scope placeholders
- Modernized visual theme (gradient backgrounds, glass cards, refreshed tab styling)
- JSON seed loader for California code sections (`CodeReady/Data/ca_codes_seed.json`)

## How to run in Xcode
1. Create a new iOS App project in Xcode (SwiftUI lifecycle).
2. Name it `CodeReady`.
3. Replace generated app files with the files from this folder (keep the same module name, or update type names if needed).
4. Build and run on iPhone simulator.

## Current state
- This is a functional UI prototype with mock data and interactions.
- Networking, persistence, authentication, iCloud sync, and real App Store purchases are not implemented yet.
- You can expand code coverage by replacing `CodeReady/Data/ca_codes_seed.json` with full official datasets.
- You can add more code files any time:
  - Bundle approach: add a new `.json` file under `CodeReady/Data` and include it in target resources.
  - Runtime approach: place `custom_codes.json`, `custom_penal_codes.json`, or `custom_vehicle_codes.json` in the app's Documents directory.
  - Expected JSON schema per item: `codeSet`, `sectionNumber`, `title`, `text`, optional `tags`, optional `frequentlyTested`.

## Suggested next implementation steps
1. Add local persistence (SwiftData or Core Data) for notes, favorites, progress, and flashcard schedules.
2. Build question/scenario engines with scoring and retake logic.
3. Integrate sign-in providers (Sign in with Apple, Google).
4. Add iCloud sync and conflict resolution.
5. Replace mock repository with versioned California content ingestion pipeline.
6. Add StoreKit 2 entitlements for supporter tiers and upgrade flow.
