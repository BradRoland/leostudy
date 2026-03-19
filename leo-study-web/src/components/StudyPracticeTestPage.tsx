import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  getPracticeTestModule,
  practiceTestModules,
  type PracticeTestModuleId,
  type PracticeTestQuestion,
  type PracticeTestScenario,
} from '../content/practiceTests'

type StudyPracticeTestPageProps = {
  onStudyActivity: () => void
}

const PRACTICE_TEST_LENGTH_OPTIONS = [10, 20, 50, 100] as const

const PRACTICE_LD_LABELS: Record<string, string> = {
  '5': 'Crimes in General',
  '6': 'Property Crimes',
  '7': 'Crimes Against Persons / Death Investigation',
  '8': 'General Criminal Statutes',
  '9': 'Crimes Against Children',
  '10': 'Sex Crimes',
  '15': 'Laws of Arrest',
  '16': 'Search and Seizure',
  '20': 'Use of Force',
  '39': 'Crimes Against the Justice System',
}

type LdPerformanceLevel = 'proficient' | 'needs_reps' | 'lacking'

type LdBreakdownItem = {
  ldNumber: string
  total: number
  correct: number
  accuracy: number
  label: string
  level: LdPerformanceLevel
  levelLabel: string
  guidance: string
}

function formatDuration(seconds: number) {
  const safeSeconds = Math.max(0, Math.round(seconds))
  const minutes = Math.floor(safeSeconds / 60)
  const remainingSeconds = safeSeconds % 60
  if (minutes === 0) return `${remainingSeconds}s`
  return `${minutes}m ${remainingSeconds.toString().padStart(2, '0')}s`
}

function shuffleArray<T>(items: T[]) {
  const copy = [...items]
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1))
    ;[copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]]
  }
  return copy
}

function randomizeQuestion(question: PracticeTestQuestion): PracticeTestQuestion {
  const shuffledChoiceIndexes = shuffleArray(question.choices.map((_, index) => index))
  return {
    ...question,
    choices: shuffledChoiceIndexes.map((index) => question.choices[index]),
    correctIndex: shuffledChoiceIndexes.indexOf(question.correctIndex),
  }
}

function randomizeSessionScenarios(scenarios: PracticeTestScenario[]) {
  return shuffleArray(scenarios).map((scenario) => ({
    ...scenario,
    questions: shuffleArray(scenario.questions).map((question) => randomizeQuestion(question)),
  }))
}

function buildSessionScenarios(scenarios: PracticeTestScenario[], questionTarget: number) {
  const randomizedScenarios = randomizeSessionScenarios(scenarios)
  const sessionScenarios: PracticeTestScenario[] = []
  let questionsRemaining = questionTarget

  for (const currentScenario of randomizedScenarios) {
    if (questionsRemaining <= 0) break

    if (currentScenario.questions.length <= questionsRemaining) {
      sessionScenarios.push(currentScenario)
      questionsRemaining -= currentScenario.questions.length
      continue
    }

    sessionScenarios.push({
      ...currentScenario,
      questions: currentScenario.questions.slice(0, questionsRemaining),
    })
    questionsRemaining = 0
  }

  return sessionScenarios
}

function getLdPerformance(correct: number, total: number) {
  const accuracy = total > 0 ? Math.round((correct / total) * 100) : 0

  if (total >= 2 && accuracy >= 85) {
    return {
      accuracy,
      level: 'proficient' as const,
      levelLabel: 'Proficient',
      guidance: 'You are answering this LD consistently. Keep it warm with occasional review.',
    }
  }

  if (accuracy >= 60) {
    return {
      accuracy,
      level: 'needs_reps' as const,
      levelLabel: 'Needs More Reps',
      guidance: 'You are close, but this LD still needs more repetition under scenario pressure.',
    }
  }

  return {
    accuracy,
    level: 'lacking' as const,
    levelLabel: 'Lacking',
    guidance: 'This LD is still weak right now. Go back to the Study Guide and rework the tested points.',
  }
}

function buildLdBreakdown(questions: PracticeTestQuestion[], answers: Record<string, number>): LdBreakdownItem[] {
  const breakdown = new Map<string, LdBreakdownItem>()

  questions.forEach((question) => {
    const current = breakdown.get(question.ldNumber) ?? {
      ldNumber: question.ldNumber,
      total: 0,
      correct: 0,
      accuracy: 0,
      label: PRACTICE_LD_LABELS[question.ldNumber] ?? 'Learning Domain',
      level: 'lacking' as LdPerformanceLevel,
      levelLabel: 'Lacking',
      guidance: '',
    }
    current.total += 1
    if (answers[question.id] === question.correctIndex) current.correct += 1
    breakdown.set(question.ldNumber, current)
  })

  return Array.from(breakdown.values())
    .map((item) => {
      const performance = getLdPerformance(item.correct, item.total)
      return {
        ...item,
        accuracy: performance.accuracy,
        level: performance.level,
        levelLabel: performance.levelLabel,
        guidance: performance.guidance,
      }
    })
    .sort((left, right) => Number(left.ldNumber) - Number(right.ldNumber))
}

export function StudyPracticeTestPage({ onStudyActivity }: StudyPracticeTestPageProps) {
  const [selectedModuleId, setSelectedModuleId] = useState<PracticeTestModuleId>('tmas2')
  const [selectedQuestionCount, setSelectedQuestionCount] = useState<number>(20)
  const [sessionActive, setSessionActive] = useState(false)
  const [sessionComplete, setSessionComplete] = useState(false)
  const [scenarioIndex, setScenarioIndex] = useState(0)
  const [questionIndex, setQuestionIndex] = useState(0)
  const [answers, setAnswers] = useState<Record<string, number>>({})
  const [startedAt, setStartedAt] = useState<number | null>(null)
  const [completedAt, setCompletedAt] = useState<number | null>(null)
  const [sessionScenarios, setSessionScenarios] = useState<PracticeTestScenario[]>([])
  const scenarioHeroRef = useRef<HTMLDivElement | null>(null)
  const questionBlockRef = useRef<HTMLDivElement | null>(null)
  const feedbackRef = useRef<HTMLDivElement | null>(null)
  const nextActionRef = useRef<HTMLButtonElement | null>(null)
  const setupStartRef = useRef<HTMLButtonElement | null>(null)

  const selectedModule = useMemo(() => getPracticeTestModule(selectedModuleId), [selectedModuleId])
  const availableQuestionCount = useMemo(
    () => selectedModule.scenarios.reduce((total, scenario) => total + scenario.questions.length, 0),
    [selectedModule.scenarios],
  )
  const availableLengthOptions = useMemo(
    () => PRACTICE_TEST_LENGTH_OPTIONS.filter((count) => count <= availableQuestionCount),
    [availableQuestionCount],
  )
  const effectiveQuestionCount = useMemo(
    () => availableLengthOptions.find((count) => count === selectedQuestionCount) ?? availableLengthOptions[0] ?? 0,
    [availableLengthOptions, selectedQuestionCount],
  )
  const activeScenarios = sessionScenarios.length > 0 ? sessionScenarios : selectedModule.scenarios
  const flattenedQuestions = useMemo(
    () => activeScenarios.flatMap((scenario) => scenario.questions),
    [activeScenarios],
  )
  const coveredLdNumbers = useMemo(
    () => Array.from(new Set(selectedModule.scenarios.flatMap((scenario) => scenario.questions.map((question) => question.ldNumber)))).sort((left, right) => Number(left) - Number(right)),
    [selectedModule.scenarios],
  )
  const corePracticeModules = useMemo(
    () => practiceTestModules.filter((module) => module.id === 'tmas1' || module.id === 'tmas2' || module.id === 'tmas3'),
    [],
  )
  const focusedPracticeModules = useMemo(
    () => practiceTestModules.filter((module) => module.id === 'ld152016'),
    [],
  )

  const currentScenario = activeScenarios[scenarioIndex] ?? null
  const currentQuestion = currentScenario?.questions[questionIndex] ?? null
  const selectedChoice = currentQuestion ? answers[currentQuestion.id] ?? null : null
  const currentQuestionNumber = useMemo(() => {
    if (!currentScenario || !currentQuestion) return 0
    const previousScenarioQuestions = activeScenarios
      .slice(0, scenarioIndex)
      .reduce((total, scenario) => total + scenario.questions.length, 0)
    return previousScenarioQuestions + questionIndex + 1
  }, [activeScenarios, currentQuestion, currentScenario, questionIndex, scenarioIndex])

  const correctCount = useMemo(
    () => flattenedQuestions.reduce((total, question) => total + (answers[question.id] === question.correctIndex ? 1 : 0), 0),
    [answers, flattenedQuestions],
  )
  const answeredCount = useMemo(
    () => flattenedQuestions.reduce((total, question) => total + (answers[question.id] !== undefined ? 1 : 0), 0),
    [answers, flattenedQuestions],
  )
  const missedQuestions = useMemo(
    () =>
      flattenedQuestions.filter((question) => {
        const answer = answers[question.id]
        return answer !== undefined && answer !== question.correctIndex
      }),
    [answers, flattenedQuestions],
  )
  const ldBreakdown = useMemo(
    () => buildLdBreakdown(flattenedQuestions, answers),
    [answers, flattenedQuestions],
  )
  const proficientLds = useMemo(
    () => ldBreakdown.filter((item) => item.level === 'proficient'),
    [ldBreakdown],
  )
  const needsRepsLds = useMemo(
    () => ldBreakdown.filter((item) => item.level === 'needs_reps'),
    [ldBreakdown],
  )
  const lackingLds = useMemo(
    () => ldBreakdown.filter((item) => item.level === 'lacking'),
    [ldBreakdown],
  )
  const priorityPracticeLds = useMemo(
    () =>
      [...ldBreakdown]
        .sort((left, right) => left.accuracy - right.accuracy || left.total - right.total || Number(left.ldNumber) - Number(right.ldNumber))
        .slice(0, 3),
    [ldBreakdown],
  )
  const overlayThemeClasses = useMemo(() => {
    if (typeof document === 'undefined') return ''
    const appShell = document.querySelector('.app-shell')
    if (!appShell) return ''
    return Array.from(appShell.classList)
      .filter((className) => className === 'ui-light-mode' || className === 'reduced-effects' || className.startsWith('theme-'))
      .join(' ')
  }, [sessionActive, sessionComplete])

  useEffect(() => {
    if (availableLengthOptions.length === 0) return
    if (availableLengthOptions.includes(selectedQuestionCount as (typeof PRACTICE_TEST_LENGTH_OPTIONS)[number])) return
    setSelectedQuestionCount(availableLengthOptions[0])
  }, [availableLengthOptions, selectedQuestionCount])

  useEffect(() => {
    if (!(sessionActive || sessionComplete)) return

    let lastMarkedAt = 0
    const markInteraction = () => {
      const now = Date.now()
      if (now - lastMarkedAt < 1200) return
      lastMarkedAt = now
      onStudyActivity()
    }

    document.addEventListener('scroll', markInteraction, true)
    window.addEventListener('pointerdown', markInteraction)
    window.addEventListener('wheel', markInteraction, { passive: true })
    return () => {
      document.removeEventListener('scroll', markInteraction, true)
      window.removeEventListener('pointerdown', markInteraction)
      window.removeEventListener('wheel', markInteraction)
    }
  }, [onStudyActivity, sessionActive, sessionComplete])

  useEffect(() => {
    if (!sessionActive || sessionComplete || !currentQuestion || selectedChoice !== null) return

    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable) {
        return
      }

      if (event.key < '1' || event.key > '4') return

      const nextIndex = Number(event.key) - 1
      if (nextIndex >= currentQuestion.choices.length) return
      event.preventDefault()
      onStudyActivity()
      setAnswers((current) => ({ ...current, [currentQuestion.id]: nextIndex }))
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [currentQuestion, onStudyActivity, selectedChoice, sessionActive, sessionComplete])

  useEffect(() => {
    if (!sessionActive || sessionComplete || !currentQuestion) return

    const frame = window.requestAnimationFrame(() => {
      if (selectedChoice === null) {
        scenarioHeroRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
        return
      }

      const target = nextActionRef.current ?? feedbackRef.current
      target?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    })

    return () => window.cancelAnimationFrame(frame)
  }, [currentQuestion, selectedChoice, sessionActive, sessionComplete])

  useEffect(() => {
    if (sessionActive || sessionComplete) return
    if (typeof window === 'undefined') return
    if (window.sessionStorage.getItem('practice-test-scroll-target') !== 'setup') return

    const frame = window.requestAnimationFrame(() => {
      setupStartRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      setupStartRef.current?.focus({ preventScroll: true })
      window.sessionStorage.removeItem('practice-test-scroll-target')
    })

    return () => window.cancelAnimationFrame(frame)
  }, [sessionActive, sessionComplete, selectedModuleId, effectiveQuestionCount])

  const resetSession = () => {
    setSessionActive(false)
    setSessionComplete(false)
    setScenarioIndex(0)
    setQuestionIndex(0)
    setAnswers({})
    setStartedAt(null)
    setCompletedAt(null)
    setSessionScenarios([])
  }

  const startSession = () => {
    if (selectedModule.status !== 'available' || selectedModule.scenarios.length === 0) return

    onStudyActivity()
    setSessionScenarios(buildSessionScenarios(selectedModule.scenarios, effectiveQuestionCount))
    setScenarioIndex(0)
    setQuestionIndex(0)
    setAnswers({})
    setSessionComplete(false)
    setSessionActive(true)
    setStartedAt(Date.now())
    setCompletedAt(null)
  }

  const closeSession = () => {
    if (sessionActive) {
      const confirmed = window.confirm('Exit the current practice test? This run will close.')
      if (!confirmed) return
    }
    resetSession()
  }

  const advanceQuestion = () => {
    if (!currentScenario || !currentQuestion) return
    onStudyActivity()

    const isLastQuestionInScenario = questionIndex >= currentScenario.questions.length - 1
    const isLastScenario = scenarioIndex >= activeScenarios.length - 1

    if (isLastQuestionInScenario && isLastScenario) {
      setSessionComplete(true)
      setSessionActive(false)
      setCompletedAt(Date.now())
      return
    }

    if (isLastQuestionInScenario) {
      setScenarioIndex((current) => current + 1)
      setQuestionIndex(0)
      return
    }

    setQuestionIndex((current) => current + 1)
  }

  const elapsedSeconds = useMemo(() => {
    if (!startedAt) return 0
    const finishedAt = completedAt ?? Date.now()
    return Math.max(0, (finishedAt - startedAt) / 1000)
  }, [completedAt, startedAt])

  const progressPercent = flattenedQuestions.length > 0
    ? Math.min(100, Math.round((answeredCount / flattenedQuestions.length) * 100))
    : 0

  const isLastQuestionInScenario = currentScenario ? questionIndex >= currentScenario.questions.length - 1 : false
  const nextButtonLabel = currentQuestionNumber >= flattenedQuestions.length
    ? 'Finish Practice Test'
    : isLastQuestionInScenario
      ? 'Next Scenario'
      : 'Next Question'
  const sessionOverlay = (sessionActive || sessionComplete) ? (
    <div className={`study-session-overlay study-practice-session-overlay ${overlayThemeClasses}`.trim()}>
      <div className="study-practice-session-shell">
        {sessionActive && currentScenario && currentQuestion ? (
          <>
            <div className="study-practice-session-top">
              <div className="study-session-top-copy">
                <span className="study-guide-kicker">Live Test</span>
                <strong>{selectedModule.title} Practice Test</strong>
                <small>
                  Scenario {scenarioIndex + 1}/{activeScenarios.length} • Question {currentQuestionNumber}/{flattenedQuestions.length}
                </small>
              </div>
              <button className="secondary study-session-exit-btn" onClick={closeSession}>
                Exit Test
              </button>
            </div>

            <div className="study-practice-progress-card">
              <div className="study-practice-progress-bar" aria-hidden>
                <span style={{ width: `${progressPercent}%` }} />
              </div>
              <div className="study-practice-progress-meta">
                <span>{currentScenario.title}</span>
                <span>{currentScenario.ldNumbers.map((ldNumber) => `LD ${ldNumber}`).join(' • ')}</span>
              </div>
            </div>

            <div className="study-practice-session-stage">
              <article className="card study-practice-session-card">
                <div className="study-practice-session-hero" ref={scenarioHeroRef}>
                  <div className="study-practice-session-scenario">
                    <span className="study-guide-kicker">Scenario Brief</span>
                    <p>{currentScenario.stem}</p>
                  </div>
                </div>

                <div className="study-practice-session-question-block" ref={questionBlockRef}>
                  <div className="study-practice-question-head">
                    <span className="study-practice-question-count">Question {currentQuestionNumber}</span>
                    <div className="study-practice-question-tags">
                      <span className="study-practice-question-objective">LD {currentQuestion.ldNumber}</span>
                      <span className="study-practice-question-objective">{currentQuestion.objective}</span>
                    </div>
                  </div>
                  <h2>{currentQuestion.prompt}</h2>
                  <div className="choices study-practice-choices">
                    {currentQuestion.choices.map((choice, index) => {
                      const isSelected = selectedChoice === index
                      const isCorrect = selectedChoice !== null && index === currentQuestion.correctIndex
                      const isIncorrectSelected = isSelected && selectedChoice !== currentQuestion.correctIndex
                      const className = [
                        'choice',
                        isSelected ? 'choice-selected' : '',
                        isCorrect ? 'choice-correct' : '',
                        isIncorrectSelected ? 'choice-incorrect' : '',
                      ]
                        .filter(Boolean)
                        .join(' ')

                      return (
                        <button
                          key={`${currentQuestion.id}-choice-${index}`}
                          className={className}
                          disabled={selectedChoice !== null}
                          onClick={() => {
                            if (selectedChoice !== null) return
                            onStudyActivity()
                            setAnswers((current) => ({ ...current, [currentQuestion.id]: index }))
                          }}
                        >
                          <span className="choice-key">{index + 1}</span>
                          {choice}
                        </button>
                      )
                    })}
                  </div>

                  {selectedChoice === null ? (
                    <p className="muted tiny study-practice-choice-hint">Press 1–4 or tap a choice. The question is centered and the answer set stays directly beneath it.</p>
                  ) : (
                    <div className="study-practice-feedback" ref={feedbackRef} aria-live="polite">
                      <p className={selectedChoice === currentQuestion.correctIndex ? 'good' : 'bad'}>
                        {selectedChoice === currentQuestion.correctIndex ? 'Correct answer.' : 'Incorrect answer.'}
                      </p>
                      <p className="muted">{currentQuestion.explanation}</p>
                      <button className="primary study-practice-next-action" onClick={advanceQuestion} ref={nextActionRef}>
                        {nextButtonLabel}
                      </button>
                    </div>
                  )}
                </div>
              </article>
            </div>
          </>
        ) : null}

        {sessionComplete ? (
          <article className="card study-practice-results-card study-practice-results-card-overlay">
            <div className="study-practice-card-head">
              <div>
                <span className="study-guide-kicker">Practice Test Complete</span>
                <h2>{selectedModule.title} Results</h2>
                <p className="muted">Review the weak points, then start another randomized run.</p>
              </div>
              <button className="secondary study-session-exit-btn" onClick={closeSession}>
                Close
              </button>
            </div>

            <div className="study-guide-stats">
              <div className="study-guide-stat-pill">
                <small>Score</small>
                <strong>{correctCount}/{flattenedQuestions.length}</strong>
              </div>
              <div className="study-guide-stat-pill">
                <small>Accuracy</small>
                <strong>{flattenedQuestions.length > 0 ? Math.round((correctCount / flattenedQuestions.length) * 100) : 0}%</strong>
              </div>
              <div className="study-guide-stat-pill">
                <small>Scenarios cleared</small>
                <strong>{activeScenarios.length}</strong>
              </div>
              <div className="study-guide-stat-pill">
                <small>Elapsed time</small>
                <strong>{formatDuration(elapsedSeconds)}</strong>
              </div>
            </div>

            <section className="study-practice-results-panel study-practice-coaching-panel">
              <div className="study-practice-card-head">
                <div>
                  <h3>LD coaching</h3>
                  <p className="muted">This run tells you which LDs you are already solid on and which ones still need repetition.</p>
                </div>
              </div>

              <div className="study-practice-coaching-grid">
                <article className="study-practice-coaching-card">
                  <strong>Proficient</strong>
                  {proficientLds.length > 0 ? (
                    <ul className="study-practice-coaching-list">
                      {proficientLds.map((item) => (
                        <li key={`coaching-proficient-${item.ldNumber}`}>
                          LD {item.ldNumber} — {item.label}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="muted">No LD cleared the proficiency threshold on this run.</p>
                  )}
                </article>

                <article className="study-practice-coaching-card">
                  <strong>Needs More Reps</strong>
                  {needsRepsLds.length > 0 ? (
                    <ul className="study-practice-coaching-list">
                      {needsRepsLds.map((item) => (
                        <li key={`coaching-needs-reps-${item.ldNumber}`}>
                          LD {item.ldNumber} — {item.label}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="muted">No LD landed in the middle band on this run.</p>
                  )}
                </article>

                <article className="study-practice-coaching-card">
                  <strong>Lacking</strong>
                  {lackingLds.length > 0 ? (
                    <ul className="study-practice-coaching-list">
                      {lackingLds.map((item) => (
                        <li key={`coaching-lacking-${item.ldNumber}`}>
                          LD {item.ldNumber} — {item.label}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="muted">Nothing landed in the weak band on this run.</p>
                  )}
                </article>

                <article className="study-practice-coaching-card">
                  <strong>Priority next reps</strong>
                  {priorityPracticeLds.length > 0 ? (
                    <ul className="study-practice-coaching-list">
                      {priorityPracticeLds.map((item) => (
                        <li key={`coaching-priority-${item.ldNumber}`}>
                          LD {item.ldNumber} — {item.guidance}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="muted">No LD data was generated on this run.</p>
                  )}
                </article>
              </div>
            </section>

            <div className="study-practice-results-grid">
              <section className="study-practice-results-panel">
                <h3>LD breakdown</h3>
                <div className="study-practice-breakdown-list">
                  {ldBreakdown.map((item) => {
                    return (
                      <div key={`ld-breakdown-${item.ldNumber}`} className={`study-practice-breakdown-item is-${item.level}`}>
                        <div className="study-practice-breakdown-copy">
                          <strong>LD {item.ldNumber} — {item.label}</strong>
                          <small>{item.correct}/{item.total} correct</small>
                          <small>{item.guidance}</small>
                        </div>
                        <div className="study-practice-breakdown-score">
                          <span>{item.accuracy}%</span>
                          <small className={`study-practice-status-pill is-${item.level}`}>{item.levelLabel}</small>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </section>

              <section className="study-practice-results-panel">
                <h3>Missed questions</h3>
                {missedQuestions.length === 0 ? (
                  <p className="muted">No misses on this run.</p>
                ) : (
                  <div className="study-practice-review-list">
                    {missedQuestions.map((question, index) => (
                      <article key={`missed-${question.id}`} className="study-practice-review-item">
                        <div className="study-practice-review-top">
                          <strong>{index + 1}. LD {question.ldNumber}</strong>
                          <span>{question.objective}</span>
                        </div>
                        <p>{question.prompt}</p>
                        <small>{question.explanation}</small>
                      </article>
                    ))}
                  </div>
                )}
              </section>
            </div>

            <div className="actions-row study-practice-results-actions">
              <button className="primary" onClick={startSession}>
                Retake Randomized Test
              </button>
              <button className="secondary" onClick={closeSession}>
                Back To Setup
              </button>
            </div>
          </article>
        ) : null}
      </div>
    </div>
  ) : null

  return (
    <section className="study-session-page study-practice-page">
      <div className="study-session-shell study-session-shell-page study-practice-shell">
        <article className="card study-practice-hero">
          <div className="study-practice-hero-copy">
            <span className="study-guide-kicker">Practice Test</span>
            <h2>TMAS-style scenario testing</h2>
            <p className="muted">
              This practice test is built from the official POST TTS + workbook coverage, the TMAS 2 LD blueprint, and the scenario-bank material already loaded into the app. Each run shuffles the scenario order, question order, and answer choices.
            </p>
          </div>
          <div className="study-guide-stats">
            <div className="study-guide-stat-pill">
              <small>Available now</small>
              <strong>TMAS 2</strong>
            </div>
            <div className="study-guide-stat-pill">
              <small>Question count</small>
              <strong>{selectedModule.scenarios.reduce((total, scenario) => total + scenario.questions.length, 0)}</strong>
            </div>
            <div className="study-guide-stat-pill">
              <small>Scenario sets</small>
              <strong>{selectedModule.scenarios.length}</strong>
            </div>
            <div className="study-guide-stat-pill">
              <small>LD coverage</small>
              <strong>{coveredLdNumbers.length > 0 ? coveredLdNumbers.join(', ') : '—'}</strong>
            </div>
          </div>
        </article>

        {!sessionActive && !sessionComplete ? (
          <div className="study-practice-setup-grid">
            <article className="card study-practice-setup-card">
              <div className="study-practice-card-head">
                <div>
                  <h3>Select practice test</h3>
                  <p className="muted">Pick the live TMAS, choose the size of the run, then start a clean full-screen test session.</p>
                </div>
              </div>

              <div className="study-practice-quick-grid">
                <div className="study-practice-quick-stat">
                  <small>Live now</small>
                  <strong>{selectedModule.title}</strong>
                </div>
                <div className="study-practice-quick-stat">
                  <small>Questions in bank</small>
                  <strong>{availableQuestionCount}</strong>
                </div>
                <div className="study-practice-quick-stat">
                  <small>Scenario sets</small>
                  <strong>{selectedModule.scenarios.length}</strong>
                </div>
                <div className="study-practice-quick-stat">
                  <small>LDs covered</small>
                  <strong>{coveredLdNumbers.length}</strong>
                </div>
              </div>

              <div className="segmented study-practice-module-switch">
                {corePracticeModules.map((module) => {
                  const isSelected = selectedModuleId === module.id
                  const isDisabled = module.status !== 'available'
                  return (
                    <button
                      key={module.id}
                      className={isSelected ? 'seg active' : 'seg'}
                      disabled={isDisabled}
                      onClick={() => {
                        if (isDisabled) return
                        onStudyActivity()
                        setSelectedModuleId(module.id)
                        resetSession()
                      }}
                    >
                      {module.title}
                      {isDisabled ? ' • Soon' : ''}
                    </button>
                  )
                })}
              </div>

              {focusedPracticeModules.length > 0 ? (
                <div className="study-practice-module-focus-block">
                  <small className="muted">Focused LD practice</small>
                  <div className="segmented study-practice-module-switch study-practice-module-switch-secondary">
                    {focusedPracticeModules.map((module) => {
                      const isSelected = selectedModuleId === module.id
                      return (
                        <button
                          key={module.id}
                          className={isSelected ? 'seg active' : 'seg'}
                          onClick={() => {
                            onStudyActivity()
                            setSelectedModuleId(module.id)
                            resetSession()
                          }}
                        >
                          {module.title}
                        </button>
                      )
                    })}
                  </div>
                </div>
              ) : null}

              <p className="study-practice-summary-text">{selectedModule.description}</p>
              <div className="study-practice-format-box">
                <strong>What this feels like</strong>
                <p>{selectedModule.formatSummary}</p>
              </div>

              <div className="study-practice-length-section">
                <div className="study-practice-length-copy">
                  <strong>Practice length</strong>
                  <p className="muted">Choose a short warm-up or a longer full test. Every run pulls a fresh randomized mix from the TMAS 2 bank.</p>
                </div>
                <div className="study-practice-length-grid">
                  {availableLengthOptions.map((count) => {
                    const isSelected = count === effectiveQuestionCount
                    return (
                      <button
                        key={`practice-length-${count}`}
                        className={isSelected ? 'study-practice-length-button active' : 'study-practice-length-button'}
                        onClick={() => {
                          onStudyActivity()
                          setSelectedQuestionCount(count)
                        }}
                      >
                        <strong>{count}</strong>
                        <small>{Math.ceil(count / 4)} scenario pulls</small>
                      </button>
                    )
                  })}
                </div>
              </div>

              <div className="study-guide-exam-list">
                {coveredLdNumbers.map((ldNumber) => (
                  <span key={`practice-ld-${ldNumber}`} className="study-guide-badge">
                    LD {ldNumber}
                  </span>
                ))}
              </div>

              <button
                className="primary study-session-top-action study-session-top-action-start"
                onClick={startSession}
                disabled={selectedModule.status !== 'available' || selectedModule.scenarios.length === 0}
                ref={setupStartRef}
              >
                Start {effectiveQuestionCount}-Question Practice Test
              </button>
            </article>

            <article className="card study-practice-source-card study-practice-source-card-stack">
              <div className="study-practice-source-section">
                <span className="study-guide-kicker">Before you start</span>
                <h3>What to expect</h3>
                <ul className="study-practice-list">
                  <li>The live session opens in a dedicated full-screen test window.</li>
                  <li>Each run randomizes scenario order, question order, and answer order.</li>
                  <li>After you answer, the screen jumps straight to the explanation and next action.</li>
                </ul>
              </div>

              <div className="study-practice-source-section">
                <strong>Official basis</strong>
                <ul className="study-practice-list">
                  {selectedModule.officialBasis.map((item) => (
                    <li key={`official-basis-${item}`}>{item}</li>
                  ))}
                </ul>
              </div>

              <div className="study-practice-source-section">
                <strong>Format signals</strong>
                <ul className="study-practice-list">
                  {selectedModule.formatSignals.map((item) => (
                    <li key={`format-signal-${item}`}>{item}</li>
                  ))}
                </ul>
              </div>
            </article>
          </div>
        ) : null}

      </div>
      {sessionOverlay && typeof document !== 'undefined' ? createPortal(sessionOverlay, document.body) : null}
    </section>
  )
}
