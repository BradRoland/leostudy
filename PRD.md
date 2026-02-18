# Product Requirements Document (PRD)
## Product Name (Working)
**CodeReady** — Penal & Vehicle Code Study App for iPhone

## 1) Summary
CodeReady is an iPhone app designed for California police cadets and police officers to study California Penal Code and California Vehicle Code efficiently. It provides a structured code library plus multiple study modes—sections, quizzes, flashcards, games, scenario-based testing (including use-of-force and traffic stop scenarios), and a test mode—with an emphasis on universal usability, fast navigation, offline access, and measurable progress.

## 2) Goals
- Make it easy to **learn, review, and retain** penal/vehicle code knowledge.
- Provide **multiple learning modalities** (read, quiz, flashcards, games, timed tests).
- Support **California-based content** while keeping the UX universal and consistent (expandable to other jurisdictions later).
- Provide a **separate scenario section** for realistic decision-making practice (traffic stops and use-of-force scenarios) with clear debrief and learning takeaways.
- Enable **reliable offline study** with transparent content versioning/updates.
- Offer **progress tracking** for individuals and cohorts (optional instructor/admin features).

## 3) Non-Goals (Initial Release)
- Replacing official legal resources or providing legal advice.
- Building a full Learning Management System (LMS) equivalent (assignments, grading workflows) in v1.
- Covering every jurisdiction worldwide on day one (we will support scalable ingestion, but content rollout is phased).

## 4) Target Users & Personas
1. **Police Cadet (Primary)**
   - Needs structured study aligned to academy curriculum.
   - Wants fast repetition and clear feedback.
2. **Patrol Officer (Primary)**
   - Uses the app for refreshers, quick recall, and practice for internal exams/promotions.
3. **Field Training Officer / Instructor (Secondary)**
   - Wants to recommend modules, track cohort readiness, and identify weak areas.
4. **Applicant / Explorer (Secondary)**
   - Wants to learn California codes and decision-making basics before/during hiring pipelines.

## 5) Key User Problems
- Code study is **dense and difficult to retain** without repetition.
- Existing materials are often **static, outdated, or not mobile-friendly**.
- Users need **targeted practice** (by topic/section/weakness), not just reading.
- Studying often happens **offline** (commutes, poor reception, secure facilities).

## 6) User Stories (Representative)
- As a cadet, I want to select **California** so that I study the correct code set.
- As an officer, I want to **search by section number or keyword** and save favorites.
- As a learner, I want **spaced repetition** so the app automatically reviews what I’m forgetting.
- As a learner, I want a **test mode** that mimics academy-style exams with timing and scoring.
- As an instructor, I want to assign a **study pack** and view aggregate cohort performance.
- As a learner, I want a **scenario section** (traffic stops and use-of-force) so I can practice applying codes and decision-making under time pressure, then review what I missed.

## 7) Core Experience (Information Architecture)
### Primary Tabs (v1)
1. **Library**
2. **Study**
3. **Games**
4. **Scenarios**
5. **Test**
6. **Progress**

### Global UX Requirements
- One-tap access to **Search** from Library/Study.
- Persistent **Jurisdiction Selector** (with clear current selection).
- Clear “Not legal advice” banner within Legal/About; minimal friction elsewhere.
- Fully usable with one hand; thumb-friendly controls.
- iOS accessibility: Dynamic Type, VoiceOver labels, sufficient contrast, reduced motion options.

## 8) Functional Requirements

### 8.1 Content Library (Codes)
**Must have**
- Jurisdiction selection (v1: **California** only) with future-proofing for expansion.
- Code browsing by:
  - Hierarchy: Division/Title/Chapter/Article/Section (as applicable).
  - Alphabetical topic tags (configurable).
- Section detail screen:
  - Section number/title
  - Full text
  - “Plain language summary” (optional per jurisdiction; if present, clearly labeled)
  - Cross-references (optional)
  - Effective date / content version
- Actions:
  - Bookmark/Favorite
  - Highlight (local-only)
  - Personal notes (local-only; optional cloud sync)
  - Share (link or text; controlled to avoid sensitive annotations)

**Should have**
- “Frequently tested” / “Academy essentials” curated sets.
- Toggle to show/hide annotations and summaries for focus.

**Could have**
- Offline PDF export (if content licensing permits).

### 8.2 Study Modes

#### A) Sections (Reading Mode)
- Continue reading (resume position).
- Quick jump to section number.
- “Study pack” view (curated subset of sections).

#### B) Flashcards (Spaced Repetition)
**Must have**
- Flashcard types:
  - Definition/term -> answer
  - Scenario -> correct section(s)
  - Section -> key elements (mens rea, actus reus, thresholds) where applicable
- Spaced repetition scheduling (e.g., Leitner/SM-2 style) with adjustable daily goal.
- Mark: Again / Hard / Good / Easy.

**Should have**
- Cloze deletion cards (fill-in-the-blank).
- “Create your own cards” (with guardrails to avoid misinformation: user-created flagged as “personal”).

#### C) Quizzes (Practice)
**Must have**
- Quiz builder filters:
  - Code set (Penal / Vehicle)
  - Topics/tags
  - Difficulty (basic/intermediate/advanced)
  - Question count (10/25/50)
  - Mode: untimed or timed
- Question types:
  - Multiple choice
  - True/False
  - “Select all that apply” (optional v1)
- Review mode:
  - Show correct answer + explanation
  - Link to the section text

**Should have**
- Adaptive quizzes that focus on weak areas.

#### D) Scenarios (Decision-Making Practice)
Scenarios are interactive, branching exercises designed to test how learners apply California Penal/Vehicle codes and related decision-making under pressure. This is a separate section from quizzes and tests.

**Must have**
- Scenario categories:
  - **Traffic Stops**
  - **Use of Force** (clearly labeled; see Safety requirements)
- Scenario format:
  - Narrative + context + constraints (time, officer safety considerations, unknowns)
  - Decision points (multiple choice or select-best-action)
  - Immediate or end-of-scenario debrief (configurable by mode)
  - Explanations with links to relevant code sections
- Scenario settings:
  - Timed/untimed
  - “Training” (feedback during) vs “Evaluation” (feedback after)
- Content warnings and controls:
  - Clear labels for sensitive content (violence, weapons, injury, etc.)
  - Optional “Reduce intensity” mode (less graphic language, fewer explicit details)

**Should have**
- Branching paths with consequences (without glamorizing violence).
- “Replay decision point” and “try alternate path” options.

**Could have**
- Instructor-curated scenario packs aligned to academies/agency policies (v2+).

### 8.3 Games
Games are short sessions (1–5 minutes) optimized for engagement and repetition. All games must be optional and should allow “low-violence” alternatives for policy/comfort reasons.

**Game 1: Matching**
- Match term <-> definition
- Match scenario <-> correct section
- Time-based scoring + streaks

**Game 2: Rapid Fire (Tap the Answer)**
- Question appears; answers scroll/appear quickly; user taps correct.
- Increasing speed; combo multiplier.

**Game 3: “Blaster” Mode (Arcade)**
- Player targets “answer tiles” moving across screen; must select/shoot correct answer.
- Accessibility option: replace “shooting” with “tagging”/“locking” visuals and no weapon imagery.
- Must support reduced motion and non-violent theme toggle.

**Additional game concepts (proposed)**
- **Case File**: short scenario with 3–5 questions; earn a “case solved” badge.
- **Hot Seat**: 60-second timed recall (section -> elements; elements -> section).
- **Code Scramble**: reorder key elements/steps to form a correct rule statement.

### 8.4 Test Mode (Exam Simulation)
**Must have**
- Preset exam types:
  - Academy practice exam
  - Vehicle code exam
  - Mixed comprehensive
- Configurable:
  - Timed (e.g., 30/60/90 minutes)
  - Randomized questions
  - Section/topic coverage targets
- Results:
  - Score, time, breakdown by topic
  - Missed questions list with explanations and “study this” shortcuts
  - Retake missed-only

**Should have**
- “Proctor-like” mode: lock review until exam ends.

### 8.5 Progress & Insights
**Must have**
- Daily/weekly study streaks (opt-in).
- Mastery by topic (e.g., 0–5 levels) derived from quiz + flashcard outcomes.
- “Weak areas” list with suggested study plan.

**Should have**
- Cohort dashboards for instructors (requires accounts and permissioning).

### 8.6 Accounts, Sync, and Offline
**v1 baseline**
- App works fully offline after initial content download.
- Local progress stored on device.
- Optional sign-in for backup/sync (Apple Sign In preferred).

**Should have**
- iCloud sync for notes/bookmarks/progress.

## 8.7 Monetization (Optional “Supporter Tiers” One-Time Unlocks)
Monetization is optional and must not block baseline studying. Support is positioned as “tip/donate” style, implemented as one-time tiered unlocks that add perks.

**Must have**
- Free access includes: Library, search, bookmarks, core quizzes/flashcards/test mode, and a baseline set of games and scenarios.
- Optional Supporter tiers via iOS In-App Purchase (one-time, non-consumable):
  - **$2** tier
  - **$5** tier
  - **$10** tier
- Higher tiers include the perks of lower tiers (“upgrade” model).
- Transparent value statement and “not required” copy, including **Restore Purchases**.

**Perks by tier (proposed; increasing value)**
- **$2 — Supporter**
  - Themes (UI theming)
  - Alternate app icons (iOS alternate icons)
  - Extra scenarios: “Supporter Pack 1” (traffic stops + use-of-force), plus a monthly rotating “Scenario of the Week”
- **$5 — Supporter Plus** (includes $2 perks)
  - Extra scenarios: “Pack 2” + harder/branching variants
  - Advanced analytics: improvement over time (score trends, topic mastery deltas, weak-area closure rate), plus “before vs after” topic charts
  - New game modifiers: longer sessions, difficulty ramps, and daily challenges
- **$10 — Supporter Pro** (includes $5 perks)
  - Extra scenarios: “Pack 3” + “evaluation-only” scenario exams with stricter scoring
  - Advanced analytics+: readiness index, time-to-answer trends, and “exam prediction” (based on practice performance; clearly labeled as estimate)
  - Power tools:
    - Custom Study Packs (curate your own modules of sections/questions/scenarios)
    - Home Screen Widgets (streak, daily goal, quick-start test)
    - Progress export (shareable PDF/CSV summary for personal use)

**Accounts + sync**
- Sign-in options: **Sign in with Apple** and **Google**
- iCloud-based sync supported once signed in
- Sync includes **everything** (when enabled): jurisdiction selection, settings, bookmarks, highlights, notes, flashcard scheduling state, quiz/test history, scenario history, mastery/progress, streaks, and purchased-tier entitlement
- Offline-first: all data is available offline; sync occurs when network is available (conflict resolution rules required)

**Constraints**
- Follow Apple IAP rules for unlockable content and clearly represent purchases as optional support with perks.
- Implement tier upgrades cleanly (single entitlement representing highest tier purchased).
- If offering Google (or other third-party) sign-in, also offer **Sign in with Apple** (Apple requirement).
- Keep “account required” prompts non-blocking unless using a feature that truly needs sync.

## 9) Content & Data Requirements
### Source of Truth
- Codes must come from **authoritative sources** (official government publications where available).
- Each code set must have:
  - Source metadata
  - Version/effective date
  - Update cadence policy

### Content Model (Conceptual)
- Jurisdiction
- CodeSet (Penal, Vehicle, etc.)
- Section (number, title, text, hierarchy path, tags, references, version metadata)
- Question (prompt, choices, correct answer, explanation, linked section(s), difficulty, tags)
- Flashcard (generated or curated; links to sections/questions)

### Updates
- Delta updates (download only changes).
- User is notified when content updates occur; older versions remain readable for a limited time if needed (configurable).

## 10) Safety, Policy, and Legal Considerations
- The app must clearly state: **Educational purposes only; not legal advice**.
- Content accuracy is critical; implement:
  - Versioning
  - Audit trail for content changes
  - Rapid rollback capability
- Scenarios (traffic stops/use of force):
  - Include a clear disclaimer that scenarios are **training aids** and not a substitute for agency policy, legal updates, or supervised instruction.
  - Avoid glamorization; keep tone professional and instructional.
  - Provide content warnings and allow users to opt out of sensitive scenario categories.
- For “blaster” gameplay:
  - Provide a **non-violent theme** option (tag/lock/select) and default to a neutral theme for broader acceptability.
- Privacy:
  - Minimize data collection; no location tracking.
  - If analytics used, keep it aggregate and opt-out friendly.
- Security:
  - Protect any instructor/cohort data with role-based access.
  - Encrypt sensitive local data at rest when feasible.

## 11) Accessibility Requirements (Must)
- Dynamic Type support across all screens.
- VoiceOver labels for all interactive elements.
- Color contrast meets WCAG AA where applicable.
- Reduced motion support (disable high-motion animations in games).
- Haptics optional and user-controllable.

## 12) Performance Requirements
- Search results appear within 200ms for typical datasets on modern iPhones.
- Library browsing should feel instantaneous (prefetch, local indexing).
- Game sessions run at smooth frame rates on supported devices.
- Offline-first: no spinner “dead ends” without network.

## 13) Analytics & Success Metrics
### North Star
- Weekly active learners completing ≥3 study sessions/week.

### Metrics
- D1/D7 retention
- Average sessions per week
- Quiz completion rate and average improvement over time
- Flashcard review adherence (daily goal completion)
- Test mode usage and score progression

## 14) Rollout / Roadmap
### MVP (v1)
- California (CA) jurisdiction (Penal Code + Vehicle Code) with scalable content model for future jurisdictions
- Library browsing + search + bookmarks
- Flashcards with spaced repetition
- Quizzes with explanations + section links
- Scenarios section:
  - Baseline traffic stop scenarios
  - Baseline use-of-force scenarios (with content warnings + reduce-intensity option)
- Test mode with breakdown + retake missed-only
- 2 games: Matching + Rapid Fire (neutral theme)
- Offline download + local progress

### v1.5
- Blaster/Arcade mode with non-violent toggle + reduced motion
- Adaptive quizzes
- iCloud sync (notes/bookmarks/progress)
- Optional Supporter tiers ($2/$5/$10) + perks rollout (extra scenarios, advanced analytics, themes/alternate icons, sign-in + full sync)

### v2
- Instructor/cohort features
- More jurisdictions and configurable study packs per academy
- Community/shared packs (moderated)

## 15) Risks & Mitigations
- **Content licensing/availability**: validate sources and permissions early; start with jurisdictions with clear public access.
- **Outdated codes**: strict versioning + update notifications + visible effective date.
- **User trust**: show sources, include citations, and link to official publications where allowed.
- **App Store review for game themes**: ship neutral theme first; keep blaster visuals optional and policy-compliant.

## 16) Open Questions (For You to Confirm)
1. Should sign-in + full sync be available at launch (v1), or is it acceptable to ship in v1.5 while the offline experience ships first?
2. For “Supporter Pro” exports: do you want PDF only, CSV only, or both?
3. For use-of-force scenarios, should the app reference only **Penal/Vehicle codes**, or also include high-level references to common California training frameworks (kept generic and clearly labeled)?
