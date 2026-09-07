# Weekly challenge catalog

Developer reference for the reviewed weekly goal pool. The application shows only the current goals, their progress and rewards; pool size and rotation rules are not promotional UI copy.

- Exactly 100 definitions, selected by the server as two weekly goals.
- Every goal uses free practice tests or solo Matching, Speed Challenge, or Blaster sessions. No membership, multiplayer win, or level unlock is needed.
- A qualifying completed session must contain at least five answers. Accuracy is calculated from recorded correct and incorrect answers, rather than a client-supplied percentage.
- Weekly activity uses the server's UTC week. Consistency goals count distinct UTC days, which need not be consecutive.
- A specific code-set goal requires that selection. Mixed All Codes activity does not count as several specific code sets.
- Improvement compares a later session with an earlier session in the same mode and code set, within the same week.
- Balanced study requires at least 30 correct answers per qualifying code set. `balanced_correct` is explicitly 30 on those definitions and 10 on all other definitions, where it is unused.
- Rewards range from 200 to 380 XP. Challenge XP is awarded by the server once per goal per weekly period.

The catalog provides 80 focused goals, seven consistency goals, and 13 broader volume, variety, accuracy, improvement, and balanced-study goals. Runtime selection and period boundaries are verified in the database tests.

| # | Challenge | Category | Goal | XP |
| --- | --- | --- | --- | --- |
| 1 | Field-ready fundamentals | Any practice | Get 150 correct answers across practice test or solo game sessions this week. Each session must include at least five answers. | 300 |
| 2 | Steady weekly patrol | Any practice | Finish 10 practice test or solo game sessions this week. Each session must include at least five answers. | 260 |
| 3 | Measured decisions | Any practice | Finish 5 practice test or solo game sessions at 80% accuracy or better this week. Each session must include at least five answers. | 320 |
| 4 | Three clean briefings | Any practice | Finish 3 practice test or solo game sessions without a mistake this week. Each session must include at least five answers. | 360 |
| 5 | Casework foundations | Any practice · Penal Code | Get 100 correct answers across practice test or solo game sessions with Penal Code selected this week. Each session must include at least five answers. | 240 |
| 6 | Casebook routine | Any practice · Penal Code | Finish 6 practice test or solo game sessions with Penal Code selected this week. Each session must include at least five answers. | 200 |
| 7 | Sound judgment | Any practice · Penal Code | Finish 3 practice test or solo game sessions with Penal Code selected at 80% accuracy or better this week. Each session must include at least five answers. | 260 |
| 8 | Evidence in order | Any practice · Penal Code | Finish 2 practice test or solo game sessions with Penal Code selected without a mistake this week. Each session must include at least five answers. | 300 |
| 9 | Community care | Any practice · Health & Safety Code | Get 100 correct answers across practice test or solo game sessions with Health & Safety Code selected this week. Each session must include at least five answers. | 240 |
| 10 | Wellness watch | Any practice · Health & Safety Code | Finish 6 practice test or solo game sessions with Health & Safety Code selected this week. Each session must include at least five answers. | 200 |
| 11 | Careful assessment | Any practice · Health & Safety Code | Finish 3 practice test or solo game sessions with Health & Safety Code selected at 80% accuracy or better this week. Each session must include at least five answers. | 260 |
| 12 | Clear community briefings | Any practice · Health & Safety Code | Finish 2 practice test or solo game sessions with Health & Safety Code selected without a mistake this week. Each session must include at least five answers. | 300 |
| 13 | Road-ready recall | Any practice · Vehicle Code | Get 100 correct answers across practice test or solo game sessions with Vehicle Code selected this week. Each session must include at least five answers. | 240 |
| 14 | Traffic desk routine | Any practice · Vehicle Code | Finish 6 practice test or solo game sessions with Vehicle Code selected this week. Each session must include at least five answers. | 200 |
| 15 | Sound road decisions | Any practice · Vehicle Code | Finish 3 practice test or solo game sessions with Vehicle Code selected at 80% accuracy or better this week. Each session must include at least five answers. | 260 |
| 16 | Clear traffic briefings | Any practice · Vehicle Code | Finish 2 practice test or solo game sessions with Vehicle Code selected without a mistake this week. Each session must include at least five answers. | 300 |
| 17 | Academy field notes | Practice tests | Get 120 correct answers across practice tests this week. Each session must include at least five answers. | 300 |
| 18 | The study watch | Practice tests | Finish 8 practice tests this week. Each session must include at least five answers. | 260 |
| 19 | Briefing-room precision | Practice tests | Finish 4 practice tests at 80% accuracy or better this week. Each session must include at least five answers. | 320 |
| 20 | Clean practice record | Practice tests | Finish 3 practice tests without a mistake this week. Each session must include at least five answers. | 360 |
| 21 | Case file review | Practice tests · Penal Code | Get 80 correct answers across practice tests with Penal Code selected this week. Each session must include at least five answers. | 240 |
| 22 | Penal study rotation | Practice tests · Penal Code | Finish 5 practice tests with Penal Code selected this week. Each session must include at least five answers. | 200 |
| 23 | Elements in focus | Practice tests · Penal Code | Finish 3 practice tests with Penal Code selected at 80% accuracy or better this week. Each session must include at least five answers. | 260 |
| 24 | Case file clarity | Practice tests · Penal Code | Finish 2 practice tests with Penal Code selected without a mistake this week. Each session must include at least five answers. | 300 |
| 25 | Community study file | Practice tests · Health & Safety Code | Get 80 correct answers across practice tests with Health & Safety Code selected this week. Each session must include at least five answers. | 240 |
| 26 | Health code rotation | Practice tests · Health & Safety Code | Finish 5 practice tests with Health & Safety Code selected this week. Each session must include at least five answers. | 200 |
| 27 | Informed community response | Practice tests · Health & Safety Code | Finish 3 practice tests with Health & Safety Code selected at 80% accuracy or better this week. Each session must include at least five answers. | 260 |
| 28 | Community file clarity | Practice tests · Health & Safety Code | Finish 2 practice tests with Health & Safety Code selected without a mistake this week. Each session must include at least five answers. | 300 |
| 29 | Traffic study file | Practice tests · Vehicle Code | Get 80 correct answers across practice tests with Vehicle Code selected this week. Each session must include at least five answers. | 240 |
| 30 | Vehicle code rotation | Practice tests · Vehicle Code | Finish 5 practice tests with Vehicle Code selected this week. Each session must include at least five answers. | 200 |
| 31 | Informed traffic response | Practice tests · Vehicle Code | Finish 3 practice tests with Vehicle Code selected at 80% accuracy or better this week. Each session must include at least five answers. | 260 |
| 32 | Traffic file clarity | Practice tests · Vehicle Code | Finish 2 practice tests with Vehicle Code selected without a mistake this week. Each session must include at least five answers. | 300 |
| 33 | Connected knowledge | Matching | Get 100 correct answers across Matching sessions this week. Each session must include at least five answers. | 300 |
| 34 | Matching watch | Matching | Finish 10 Matching sessions this week. Each session must include at least five answers. | 260 |
| 35 | Strong associations | Matching | Finish 5 Matching sessions at 80% accuracy or better this week. Each session must include at least five answers. | 320 |
| 36 | Clean connections | Matching | Finish 4 Matching sessions without a mistake this week. Each session must include at least five answers. | 360 |
| 37 | Linked case notes | Matching · Penal Code | Get 60 correct answers across Matching sessions with Penal Code selected this week. Each session must include at least five answers. | 240 |
| 38 | Case matching rotation | Matching · Penal Code | Finish 6 Matching sessions with Penal Code selected this week. Each session must include at least five answers. | 200 |
| 39 | Precise case connections | Matching · Penal Code | Finish 3 Matching sessions with Penal Code selected at 80% accuracy or better this week. Each session must include at least five answers. | 260 |
| 40 | Case links confirmed | Matching · Penal Code | Finish 2 Matching sessions with Penal Code selected without a mistake this week. Each session must include at least five answers. | 300 |
| 41 | Community connections | Matching · Health & Safety Code | Get 60 correct answers across Matching sessions with Health & Safety Code selected this week. Each session must include at least five answers. | 240 |
| 42 | Community matching rotation | Matching · Health & Safety Code | Finish 6 Matching sessions with Health & Safety Code selected this week. Each session must include at least five answers. | 200 |
| 43 | Precise care connections | Matching · Health & Safety Code | Finish 3 Matching sessions with Health & Safety Code selected at 80% accuracy or better this week. Each session must include at least five answers. | 260 |
| 44 | Community links confirmed | Matching · Health & Safety Code | Finish 2 Matching sessions with Health & Safety Code selected without a mistake this week. Each session must include at least five answers. | 300 |
| 45 | Traffic connections | Matching · Vehicle Code | Get 60 correct answers across Matching sessions with Vehicle Code selected this week. Each session must include at least five answers. | 240 |
| 46 | Traffic matching rotation | Matching · Vehicle Code | Finish 6 Matching sessions with Vehicle Code selected this week. Each session must include at least five answers. | 200 |
| 47 | Precise road connections | Matching · Vehicle Code | Finish 3 Matching sessions with Vehicle Code selected at 80% accuracy or better this week. Each session must include at least five answers. | 260 |
| 48 | Traffic links confirmed | Matching · Vehicle Code | Finish 2 Matching sessions with Vehicle Code selected without a mistake this week. Each session must include at least five answers. | 300 |
| 49 | Ready recall | Speed Challenge | Get 120 correct answers across Speed Challenge sessions this week. Each session must include at least five answers. | 300 |
| 50 | Recall watch | Speed Challenge | Finish 8 Speed Challenge sessions this week. Each session must include at least five answers. | 260 |
| 51 | Composed under pressure | Speed Challenge | Finish 4 Speed Challenge sessions at 80% accuracy or better this week. Each session must include at least five answers. | 320 |
| 52 | Clear recall record | Speed Challenge | Finish 3 Speed Challenge sessions without a mistake this week. Each session must include at least five answers. | 360 |
| 53 | Casework on call | Speed Challenge · Penal Code | Get 80 correct answers across Speed Challenge sessions with Penal Code selected this week. Each session must include at least five answers. | 240 |
| 54 | Penal recall rotation | Speed Challenge · Penal Code | Finish 5 Speed Challenge sessions with Penal Code selected this week. Each session must include at least five answers. | 200 |
| 55 | Confident case recall | Speed Challenge · Penal Code | Finish 3 Speed Challenge sessions with Penal Code selected at 80% accuracy or better this week. Each session must include at least five answers. | 260 |
| 56 | Clean case recall | Speed Challenge · Penal Code | Finish 2 Speed Challenge sessions with Penal Code selected without a mistake this week. Each session must include at least five answers. | 300 |
| 57 | Community on call | Speed Challenge · Health & Safety Code | Get 80 correct answers across Speed Challenge sessions with Health & Safety Code selected this week. Each session must include at least five answers. | 240 |
| 58 | Health recall rotation | Speed Challenge · Health & Safety Code | Finish 5 Speed Challenge sessions with Health & Safety Code selected this week. Each session must include at least five answers. | 200 |
| 59 | Confident community recall | Speed Challenge · Health & Safety Code | Finish 3 Speed Challenge sessions with Health & Safety Code selected at 80% accuracy or better this week. Each session must include at least five answers. | 260 |
| 60 | Clean community recall | Speed Challenge · Health & Safety Code | Finish 2 Speed Challenge sessions with Health & Safety Code selected without a mistake this week. Each session must include at least five answers. | 300 |
| 61 | Road knowledge on call | Speed Challenge · Vehicle Code | Get 80 correct answers across Speed Challenge sessions with Vehicle Code selected this week. Each session must include at least five answers. | 240 |
| 62 | Vehicle recall rotation | Speed Challenge · Vehicle Code | Finish 5 Speed Challenge sessions with Vehicle Code selected this week. Each session must include at least five answers. | 200 |
| 63 | Confident traffic recall | Speed Challenge · Vehicle Code | Finish 3 Speed Challenge sessions with Vehicle Code selected at 80% accuracy or better this week. Each session must include at least five answers. | 260 |
| 64 | Clean traffic recall | Speed Challenge · Vehicle Code | Finish 2 Speed Challenge sessions with Vehicle Code selected without a mistake this week. Each session must include at least five answers. | 300 |
| 65 | Focused response | Blaster | Get 120 correct answers across Blaster sessions this week. Each session must include at least five answers. | 300 |
| 66 | Blaster watch | Blaster | Finish 8 Blaster sessions this week. Each session must include at least five answers. | 260 |
| 67 | Controlled decisions | Blaster | Finish 4 Blaster sessions at 80% accuracy or better this week. Each session must include at least five answers. | 320 |
| 68 | Clean focus record | Blaster | Finish 3 Blaster sessions without a mistake this week. Each session must include at least five answers. | 360 |
| 69 | Casework in focus | Blaster · Penal Code | Get 80 correct answers across Blaster sessions with Penal Code selected this week. Each session must include at least five answers. | 240 |
| 70 | Penal focus rotation | Blaster · Penal Code | Finish 5 Blaster sessions with Penal Code selected this week. Each session must include at least five answers. | 200 |
| 71 | Casework composure | Blaster · Penal Code | Finish 3 Blaster sessions with Penal Code selected at 80% accuracy or better this week. Each session must include at least five answers. | 260 |
| 72 | Clear case focus | Blaster · Penal Code | Finish 2 Blaster sessions with Penal Code selected without a mistake this week. Each session must include at least five answers. | 300 |
| 73 | Community in focus | Blaster · Health & Safety Code | Get 80 correct answers across Blaster sessions with Health & Safety Code selected this week. Each session must include at least five answers. | 240 |
| 74 | Health focus rotation | Blaster · Health & Safety Code | Finish 5 Blaster sessions with Health & Safety Code selected this week. Each session must include at least five answers. | 200 |
| 75 | Community composure | Blaster · Health & Safety Code | Finish 3 Blaster sessions with Health & Safety Code selected at 80% accuracy or better this week. Each session must include at least five answers. | 260 |
| 76 | Clear community focus | Blaster · Health & Safety Code | Finish 2 Blaster sessions with Health & Safety Code selected without a mistake this week. Each session must include at least five answers. | 300 |
| 77 | Road knowledge in focus | Blaster · Vehicle Code | Get 80 correct answers across Blaster sessions with Vehicle Code selected this week. Each session must include at least five answers. | 240 |
| 78 | Vehicle focus rotation | Blaster · Vehicle Code | Finish 5 Blaster sessions with Vehicle Code selected this week. Each session must include at least five answers. | 200 |
| 79 | Traffic composure | Blaster · Vehicle Code | Finish 3 Blaster sessions with Vehicle Code selected at 80% accuracy or better this week. Each session must include at least five answers. | 260 |
| 80 | Clear traffic focus | Blaster · Vehicle Code | Finish 2 Blaster sessions with Vehicle Code selected without a mistake this week. Each session must include at least five answers. | 300 |
| 81 | A full notebook | Weekly fieldwork | Answer 200 questions across practice tests or solo games this week. Correct and incorrect answers both count. Each session must include at least five answers. | 300 |
| 82 | Practice log | Practice tests | Answer 150 questions in practice tests this week. Correct and incorrect answers both count. Each test must include at least five answers. | 280 |
| 83 | Three-day watch | Consistency | Finish a practice test or solo game on three different UTC days this week. Days do not need to be consecutive. Each session must include at least five answers. | 220 |
| 84 | Steady presence | Consistency | Finish a practice test or solo game on five different UTC days this week. Days do not need to be consecutive. Each session must include at least five answers. | 340 |
| 85 | Casebook check-ins | Consistency · Penal Code | Finish a practice test or solo game with Penal Code selected on three different UTC days this week. Days do not need to be consecutive. Each session must include at least five answers. | 240 |
| 86 | Community check-ins | Consistency · Health & Safety Code | Finish a practice test or solo game with Health & Safety Code selected on three different UTC days this week. Days do not need to be consecutive. Each session must include at least five answers. | 240 |
| 87 | Traffic check-ins | Consistency · Vehicle Code | Finish a practice test or solo game with Vehicle Code selected on three different UTC days this week. Days do not need to be consecutive. Each session must include at least five answers. | 240 |
| 88 | Return to the briefing room | Consistency · Practice tests | Finish a practice test on four different UTC days this week. Days do not need to be consecutive. Each test must include at least five answers. | 280 |
| 89 | A habit of connection | Consistency · Matching | Finish a Matching session on three different UTC days this week. Days do not need to be consecutive. Each session must include at least five answers. | 240 |
| 90 | Versatile weekly watch | Variety | Finish sessions in three different modes this week: practice tests, Matching, Speed Challenge, or Blaster. Each session must include at least five answers. | 200 |
| 91 | Complete training circuit | Variety | Finish a practice test, a Matching session, a Speed Challenge session, and a Blaster session this week. Each session must include at least five answers. | 260 |
| 92 | Across the academy | Variety | Finish a session with each specific code set selected this week: Penal, Health & Safety, and Vehicle. Mixed All Codes sessions do not count. Each session must include at least five answers. | 200 |
| 93 | Back on course | Improvement | After a session below 80% accuracy, finish a later session at 80% or better in the same mode and code set this week. Both sessions must include at least five answers. | 220 |
| 94 | A stronger second look | Improvement | Improve your accuracy by at least 20 percentage points over an earlier session in the same mode and code set this week. Both sessions must include at least five answers. | 240 |
| 95 | Knowledge that holds | Accuracy | Get 100 correct answers in practice test or solo game sessions that each finish at 80% accuracy or better this week. Each session must include at least five answers. | 360 |
| 96 | Reliable case knowledge | Accuracy · Penal Code | Get 60 correct answers in sessions with Penal Code selected that each finish at 80% accuracy or better this week. Each session must include at least five answers. | 300 |
| 97 | Reliable community knowledge | Accuracy · Health & Safety Code | Get 60 correct answers in sessions with Health & Safety Code selected that each finish at 80% accuracy or better this week. Each session must include at least five answers. | 300 |
| 98 | Reliable road knowledge | Accuracy · Vehicle Code | Get 60 correct answers in sessions with Vehicle Code selected that each finish at 80% accuracy or better this week. Each session must include at least five answers. | 300 |
| 99 | Two strong foundations | Balanced study | Get at least 30 correct answers in each of two specific code sets this week: Penal, Health & Safety, or Vehicle. Mixed All Codes sessions do not count. Each session must include at least five answers. | 280 |
| 100 | Well-rounded weekly watch | Balanced study | Get at least 30 correct answers in each of all three specific code sets this week: Penal, Health & Safety, and Vehicle. Mixed All Codes sessions do not count. Each session must include at least five answers. | 380 |
