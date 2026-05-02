import { useEffect, useMemo, useState } from 'react'
import { studyGuideModules, type StudyGuideDomain, type StudyGuideModuleId } from '../content/studyGuide'
import { studyGuideOfficialResearchByLd, type StudyGuideOfficialChapterGuide } from '../content/studyGuideOfficialResearch'
import {
  getStudyGuideExamCoverage,
  studyGuideExamCoverageSourceNote,
  type StudyGuideExamCoverage,
} from '../content/studyGuideExamBlueprint'

type StudyGuidePageProps = {
  onOpenFlashcards: () => void
  onOpenTest: () => void
  onStudyActivity: () => void
}

type LoadedGuideDomain = StudyGuideDomain & {
  guideId: string
  moduleId: StudyGuideModuleId
  moduleTitle: string
  examCoverage: StudyGuideExamCoverage[]
}

function normalizeQuery(value: string) {
  return value.trim().toLowerCase()
}

function chapterMatchesQuery(chapter: StudyGuideOfficialChapterGuide, query: string) {
  if (!query) return true

  const haystack = [
    chapter.title,
    chapter.ttsSection?.learningNeed ?? '',
    ...chapter.ttsSection?.objectives.map((objective) => `${objective.label} ${objective.text}`) ?? [],
    ...chapter.topics,
    ...chapter.topicBriefs.map((brief) => `${brief.title} ${brief.excerpt}`),
    ...chapter.synopsisSections.flatMap((section) => [section.title, ...section.points]),
  ]
    .join('\n')
    .toLowerCase()

  return haystack.includes(query)
}

function countWords(value: string) {
  return value.split(/\s+/).filter(Boolean).length
}

function countChapterWords(chapter: StudyGuideOfficialChapterGuide) {
  const text = [
    chapter.ttsSection?.learningNeed ?? '',
    ...chapter.ttsSection?.objectives.map((objective) => objective.text) ?? [],
    ...chapter.topicBriefs.map((brief) => brief.excerpt),
    ...chapter.synopsisSections.flatMap((section) => section.points),
  ].join(' ')

  return countWords(text)
}

function scrollToElement(id: string) {
  const element = document.getElementById(id)
  if (!element) return
  element.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

function examChipClassName(examId: StudyGuideExamCoverage['id']) {
  return `study-guide-exam-chip study-guide-exam-chip-${examId}`
}

export function StudyGuidePage({ onStudyActivity }: StudyGuidePageProps) {
  const loadedDomains = useMemo<LoadedGuideDomain[]>(
    () =>
      studyGuideModules
        .filter((module) => module.hasContent)
        .flatMap((module) =>
          module.domains.map((domain) => ({
            ...domain,
            guideId: `${module.id}-${domain.id}`,
            moduleId: module.id,
            moduleTitle: module.title,
            examCoverage: getStudyGuideExamCoverage(domain.ldNumber),
          })),
        )
        .sort((left, right) => {
          const ldCompare = Number(left.ldNumber) - Number(right.ldNumber)
          if (ldCompare !== 0) return ldCompare
          return left.title.localeCompare(right.title)
        }),
    [],
  )

  const [selectedDomainId, setSelectedDomainId] = useState<string>(() => loadedDomains[0]?.guideId ?? '')
  const [searchValue, setSearchValue] = useState('')

  const query = useMemo(() => normalizeQuery(searchValue), [searchValue])

  useEffect(() => {
    if (loadedDomains.length === 0) {
      if (selectedDomainId !== '') setSelectedDomainId('')
      return
    }

    if (!loadedDomains.some((domain) => domain.guideId === selectedDomainId)) {
      setSelectedDomainId(loadedDomains[0]?.guideId ?? '')
    }
  }, [loadedDomains, selectedDomainId])

  useEffect(() => {
    let lastMarkedAt = 0
    const markInteraction = () => {
      const now = Date.now()
      if (now - lastMarkedAt < 1200) return
      lastMarkedAt = now
      onStudyActivity()
    }
    const handleKeyDown = () => markInteraction()
    const handlePointerDown = () => markInteraction()
    const handleWheel = () => markInteraction()
    const handleTouchMove = () => markInteraction()

    document.addEventListener('scroll', markInteraction, true)
    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('pointerdown', handlePointerDown)
    window.addEventListener('wheel', handleWheel, { passive: true })
    window.addEventListener('touchmove', handleTouchMove, { passive: true })
    return () => {
      document.removeEventListener('scroll', markInteraction, true)
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('pointerdown', handlePointerDown)
      window.removeEventListener('wheel', handleWheel)
      window.removeEventListener('touchmove', handleTouchMove)
    }
  }, [onStudyActivity])

  const activeDomain = useMemo(
    () => loadedDomains.find((domain) => domain.guideId === selectedDomainId) ?? null,
    [loadedDomains, selectedDomainId],
  )
  const activeExamCoverage = activeDomain?.examCoverage ?? []

  const officialResearch = useMemo(
    () => (activeDomain ? studyGuideOfficialResearchByLd[activeDomain.ldNumber] ?? null : null),
    [activeDomain],
  )

  const visibleOfficialChapters = useMemo(
    () => (officialResearch ? officialResearch.chapters.filter((chapter) => chapterMatchesQuery(chapter, query)) : []),
    [officialResearch, query],
  )

  const visibleObjectiveCount = useMemo(
    () => visibleOfficialChapters.reduce((total, chapter) => total + (chapter.ttsSection?.objectives.length ?? 0), 0),
    [visibleOfficialChapters],
  )

  const visibleWordCount = useMemo(
    () => visibleOfficialChapters.reduce((total, chapter) => total + countChapterWords(chapter), 0),
    [visibleOfficialChapters],
  )

  const chapterJumpItems = useMemo(
    () =>
      visibleOfficialChapters.map((chapter) => ({
        id: `study-guide-chapter-${chapter.chapter}`,
        label: `Chapter ${chapter.chapter}`,
        title: chapter.title,
      })),
    [visibleOfficialChapters],
  )

  const selectedScopeLabel = officialResearch
    ? `LD ${officialResearch.ldNumber} • ${officialResearch.officialTitle}`
    : activeDomain
      ? `LD ${activeDomain.ldNumber} • ${activeDomain.title}`
      : 'No learning domain loaded'

  const selectedScopeMeta = officialResearch
    ? `${visibleOfficialChapters.length} testable chapters • ${visibleObjectiveCount} TTS objectives${activeExamCoverage.length ? ` • ${activeExamCoverage.map((exam) => exam.shortLabel).join(' • ')}` : ''}`
    : 'Awaiting study guide content'

  return (
    <section className="study-session-page study-guide-page">
      <div className="study-session-shell study-session-shell-page study-guide-shell">
        <article className="card study-guide-hero">
          <div className="study-guide-hero-top">
            <div className="study-guide-hero-copy">
              <span className="study-guide-kicker">Study Guide</span>
              <h2>TTS-Aligned Learning Domains</h2>
              <p className="muted">Each LD shows only what the official POST Training and Testing Specification says can be tested, mapped directly to the matching official workbook chapter coverage.</p>
            </div>
          </div>

          <div className="study-guide-stats">
            <div className="study-guide-stat-pill">
              <small>Learning Domains</small>
              <strong>{loadedDomains.length > 0 ? loadedDomains.length : '—'}</strong>
            </div>
            <div className="study-guide-stat-pill">
              <small>Visible Chapters</small>
              <strong>{officialResearch ? visibleOfficialChapters.length : '—'}</strong>
            </div>
            <div className="study-guide-stat-pill">
              <small>TTS Objectives</small>
              <strong>{officialResearch ? visibleObjectiveCount : '—'}</strong>
            </div>
            <div className="study-guide-stat-pill">
              <small>Words In View</small>
              <strong>{officialResearch ? visibleWordCount.toLocaleString() : '—'}</strong>
            </div>
          </div>

          <p className="study-guide-source-note">Study time is recorded only while you actively work the guide—scrolling, searching, switching LDs, or jumping chapters.</p>
        </article>

        <div className="study-guide-layout">
          <aside className="study-guide-sidebar">
            <article className="card study-guide-panel">
              <label className="study-guide-search">
                <span>Search TTS + Workbook</span>
                <input
                  value={searchValue}
                  onChange={(event) => {
                    onStudyActivity()
                    setSearchValue(event.target.value)
                  }}
                  placeholder={officialResearch ? 'Search test objectives or workbook coverage' : 'No learning domain loaded yet'}
                />
              </label>
            </article>

            <article className="card study-guide-panel">
              <div className="study-guide-panel-head">
                <div>
                  <h3>Learning Domains</h3>
                  <p className="muted">Select the LD you want to study for the test.</p>
                </div>
              </div>

              <div className="study-guide-scope-list">
                {loadedDomains.map((domain) => (
                  <button
                    key={domain.guideId}
                    className={selectedDomainId === domain.guideId ? 'study-guide-scope-btn active' : 'study-guide-scope-btn'}
                    onClick={() => {
                      onStudyActivity()
                      setSelectedDomainId(domain.guideId)
                    }}
                  >
                    <div className="study-guide-scope-btn-top">
                      <span>LD {domain.ldNumber}</span>
                      {domain.examCoverage.length ? (
                        <div className="study-guide-exam-list compact">
                          {domain.examCoverage.map((exam) => (
                            <span key={`${domain.guideId}-${exam.id}`} className={examChipClassName(exam.id)}>
                              {exam.shortLabel}
                            </span>
                          ))}
                        </div>
                      ) : null}
                    </div>
                    <small>{domain.title}{domain.durationLabel ? ` • ${domain.durationLabel}` : ''}</small>
                  </button>
                ))}
              </div>
            </article>
          </aside>

          <div className="study-guide-content">
            {loadedDomains.length === 0 ? (
              <article className="card study-guide-empty-card">
                <span className="study-guide-kicker">Guide Ready</span>
                <h3>No learning domains are loaded yet.</h3>
                <p className="muted">Upload a study guide PDF and this page will build TTS-aligned workbook guides for each LD.</p>
              </article>
            ) : officialResearch ? (
              <>
                <article className="card study-guide-domain-hero">
                  <div className="study-guide-domain-hero-top">
                    <div className="study-guide-domain-badges">
                      <span className="study-guide-badge">LD {officialResearch.ldNumber}</span>
                      {activeDomain?.durationLabel ? <span className="study-guide-badge muted-badge">{activeDomain.durationLabel}</span> : null}
                      <span className="study-guide-badge muted-badge">{officialResearch.chapters.length} chapters</span>
                      <span className="study-guide-badge muted-badge">TTS + Workbook aligned</span>
                    </div>
                    {activeExamCoverage.length ? (
                      <div className="study-guide-exam-list">
                        {activeExamCoverage.map((exam) => (
                          <span key={`active-${exam.id}`} className={examChipClassName(exam.id)}>
                            {exam.shortLabel}
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </div>
                  <h3>{officialResearch.officialTitle}</h3>
                  <p className="muted">{officialResearch.summary}</p>
                  <p className="study-guide-domain-note">{selectedScopeLabel} • {selectedScopeMeta}</p>
                  <div className="study-guide-read-metrics">
                    <div className="study-guide-read-metric">
                      <small>Visible Chapters</small>
                      <strong>{visibleOfficialChapters.length}</strong>
                    </div>
                    <div className="study-guide-read-metric">
                      <small>TTS Objectives</small>
                      <strong>{visibleObjectiveCount}</strong>
                    </div>
                    <div className="study-guide-read-metric">
                      <small>Required Tests</small>
                      <strong>{officialResearch.requiredTests.length}</strong>
                    </div>
                    <div className="study-guide-read-metric">
                      <small>Focus Areas</small>
                      <strong>{officialResearch.focusAreas.length}</strong>
                    </div>
                  </div>
                </article>

                {chapterJumpItems.length > 0 ? (
                  <article className="card study-guide-chapter-nav-card">
                    <div className="study-guide-panel-head">
                      <div>
                        <span className="study-guide-kicker">Chapters</span>
                        <h3>Jump Straight To A Tested Chapter</h3>
                        <p className="muted">Chapter navigation is pinned near the top so the user can move chapter-by-chapter without hunting through the page.</p>
                      </div>
                    </div>

                    <div className="study-guide-top-chapter-list">
                      {chapterJumpItems.map((item) => (
                        <button
                          key={item.id}
                          className="study-guide-top-chapter-btn"
                          onClick={() => {
                            onStudyActivity()
                            scrollToElement(item.id)
                          }}
                        >
                          <span>{item.label}</span>
                          <small>{item.title}</small>
                        </button>
                      ))}
                    </div>
                  </article>
                ) : null}

                <div className="study-guide-overview-grid">
                  <article className="card study-guide-context-card">
                    <span className="study-guide-kicker">Study Order</span>
                    <h3>How To Study This LD</h3>
                    <p className="muted">Keep the flow simple: start at the top chapter chips, then work chapter-by-chapter through only the tested content.</p>
                    <div className="study-guide-steps">
                      <div className="study-guide-step">
                        <span>1</span>
                        <p>Start with the chapter list and read the TTS learning need first. That is the actual tested scope.</p>
                      </div>
                      <div className="study-guide-step">
                        <span>2</span>
                        <p>Study the TTS objectives next so you know exactly what POST can ask from that chapter.</p>
                      </div>
                      <div className="study-guide-step">
                        <span>3</span>
                        <p>Use the workbook coverage and synopsis blocks after that to reinforce the exact official material tied to those objectives.</p>
                      </div>
                    </div>
                    <div className="study-guide-focus-list">
                      {officialResearch.focusAreas.map((area) => (
                        <span key={area} className="study-guide-focus-chip">
                          {area}
                        </span>
                      ))}
                    </div>
                  </article>

                  <article className="card study-guide-context-card">
                    <span className="study-guide-kicker">TMAS Coverage</span>
                    <h3>Where This LD Appears</h3>
                    <p className="muted">{studyGuideExamCoverageSourceNote}</p>
                    {activeExamCoverage.length ? (
                      <div className="study-guide-exam-detail-list">
                        {activeExamCoverage.map((exam) => (
                          <article key={`exam-detail-${exam.id}`} className="study-guide-exam-detail-card">
                            <div className="study-guide-exam-detail-top">
                              <span className={examChipClassName(exam.id)}>{exam.shortLabel}</span>
                              <small>{exam.weekLabel}</small>
                            </div>
                            <p>{exam.examLabel}</p>
                          </article>
                        ))}
                      </div>
                    ) : (
                      <p className="muted">This LD is not marked in the TMAS 1 / TMAS 2 / TMAS 3 comprehensive exam coverage sheet.</p>
                    )}
                    <div className="study-guide-official-links">
                      <a className="secondary" href={officialResearch.workbookUrl} target="_blank" rel="noreferrer">
                        POST Workbook
                      </a>
                      <a
                        className="secondary"
                        href={officialResearch.trainingSpecUrl}
                        target="_blank"
                        rel="noreferrer"
                        title={officialResearch.trainingSpecLabel}
                      >
                        TTS
                      </a>
                    </div>
                    <p className="study-guide-source-note">
                      Workbook v{officialResearch.workbookVersion}
                      {officialResearch.latestRevision ? ` • ${officialResearch.latestRevision}` : ''}
                    </p>
                  </article>
                </div>

                <article className="card study-guide-chapter-guide">
                  <div className="study-guide-panel-head">
                    <div>
                      <span className="study-guide-kicker">TTS + Workbook Study Guide</span>
                      <h3>Only Tested Content For This LD</h3>
                      <p className="muted">Every chapter below starts with the official TTS test scope, then shows the matching official workbook coverage for that same section.</p>
                    </div>
                  </div>

                  {visibleOfficialChapters.length === 0 ? (
                    <div className="study-guide-empty-card">
                      <h3>No tested TTS/workbook content matched “{searchValue.trim()}”.</h3>
                      <p className="muted">Clear the search or use a broader term to restore the full tested study guide.</p>
                    </div>
                  ) : (
                    <div className="study-guide-chapter-list">
                      {visibleOfficialChapters.map((chapter, index) => (
                        <details
                          key={`${officialResearch.ldNumber}-chapter-${chapter.chapter}`}
                          id={`study-guide-chapter-${chapter.chapter}`}
                          className="study-guide-chapter-card"
                          open={index === 0 && query.length === 0}
                        >
                          <summary className="study-guide-chapter-summary">
                            <div>
                              <strong>Chapter {chapter.chapter}</strong>
                              <span>{chapter.title}</span>
                            </div>
                            <small>
                              {chapter.ttsSection?.objectives.length ?? 0} test objective{chapter.ttsSection?.objectives.length === 1 ? '' : 's'} • {chapter.topicBriefs.length} workbook brief{chapter.topicBriefs.length === 1 ? '' : 's'}
                            </small>
                          </summary>

                          <div className="study-guide-chapter-body">
                            {chapter.topics.length > 0 ? (
                              <div className="study-guide-chapter-block">
                                <h4>Focus Topics In This Chapter</h4>
                                <div className="study-guide-chapter-topic-list">
                                  {chapter.topics.map((topic) => (
                                    <span key={`${chapter.chapter}-${topic}`} className="study-guide-chapter-topic-chip">
                                      {topic}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            ) : null}

                            {chapter.ttsSection ? (
                              <div className="study-guide-chapter-block">
                                <h4>TTS Learning Need</h4>
                                <p>{chapter.ttsSection.learningNeed}</p>
                              </div>
                            ) : null}

                            {chapter.ttsSection?.objectives.length ? (
                              <div className="study-guide-chapter-block">
                                <h4>What The Test Can Hit</h4>
                                <div className="study-guide-objective-list">
                                  {chapter.ttsSection.objectives.map((objective) => (
                                    <article key={`${chapter.chapter}-${objective.label}`} className="study-guide-objective-item">
                                      <div className="study-guide-objective-ids">
                                        <span className="study-guide-objective-id">{objective.label}</span>
                                      </div>
                                      <p>{objective.text}</p>
                                      <p className="study-guide-objective-explanation">{objective.explanation}</p>
                                      <div className="study-guide-objective-scenario">
                                        <h5>Example TMAS-style scenario</h5>
                                        <p>{objective.exampleScenario.setup}</p>
                                        <p>
                                          <strong>Question focus:</strong> {objective.exampleScenario.prompt}
                                        </p>
                                        <p className="study-guide-objective-focus">
                                          <strong>What the answer should focus on:</strong> {objective.exampleScenario.answerFocus}
                                        </p>
                                      </div>
                                    </article>
                                  ))}
                                </div>
                              </div>
                            ) : null}

                            {chapter.topicBriefs.length > 0 ? (
                              <div className="study-guide-chapter-block">
                                <h4>Workbook Coverage For This Tested Section</h4>
                                <div className="study-guide-topic-briefs">
                                  {chapter.topicBriefs.map((brief) => (
                                    <article key={`${chapter.chapter}-${brief.title}`} className="study-guide-topic-brief">
                                      <h5>{brief.title}</h5>
                                      <p>{brief.excerpt}</p>
                                    </article>
                                  ))}
                                </div>
                              </div>
                            ) : null}

                            {chapter.workbookLearningNeed ? (
                              <div className="study-guide-chapter-block">
                                <h4>Workbook Learning Need</h4>
                                <p>{chapter.workbookLearningNeed}</p>
                              </div>
                            ) : null}

                            {chapter.synopsisSections.length > 0 ? (
                              <div className="study-guide-chapter-block">
                                <h4>Workbook Chapter Synopsis</h4>
                                <div className="study-guide-synopsis-list">
                                  {chapter.synopsisSections.map((section) => (
                                    <article key={`${chapter.chapter}-${section.title}`} className="study-guide-synopsis-item">
                                      <h5>{section.title}</h5>
                                      {section.points.map((point) => (
                                        <p key={point}>{point}</p>
                                      ))}
                                    </article>
                                  ))}
                                </div>
                              </div>
                            ) : null}
                          </div>
                        </details>
                      ))}
                    </div>
                  )}
                </article>
              </>
            ) : (
              <article className="card study-guide-empty-card">
                <h3>Select an LD to start studying.</h3>
                <p className="muted">Choose a learning domain from the left and the guide will switch to that LD.</p>
              </article>
            )}
          </div>
        </div>
      </div>
    </section>
  )
}
