import type { ReactNode } from 'react'
import { AcademyLogo } from './AcademyBrand'
import { buildWeeklyActivity, formatDashboardTime, graduationProgress } from '../lib/dashboard'
import './HomeDashboard.css'

type CodeSet = 'penal' | 'hs' | 'vehicle'
type Props = {
  name: string
  className: string
  department: string
  startDate?: string | null
  endDate?: string | null
  now: number
  streak: number
  bestStreak: number
  studySeconds: number
  dailyGoalMinutes: number
  studyFocus: 'balanced' | 'recall' | 'scenarios' | 'exam'
  level: number
  levelPercent: number
  totalXp: number
  totalAttempts: number
  accuracy: number
  mastered: number
  totalCodes: number
  sessions: { at: number }[]
  subjects: { codeSet: CodeSet; attempts: number; accuracyPercent: number }[]
  focusCodes: { section: { sectionNumber: string; title: string; codeSet: CodeSet }; accuracyPercent: number }[]
  onStudy: (codeSet?: CodeSet) => void
  onPracticeTest: () => void
  onStudyGuide: () => void
  onScenarios: () => void
  onGames: () => void
  onStats: () => void
  onClass: () => void
}


function Icon({ kind }: { kind: 'arrow' | 'book' | 'target' | 'clock' | 'bolt' | 'check' | 'chart' | 'spark' }) {
  const paths: Record<typeof kind, ReactNode> = {
    arrow: <><path d="M5 12h14m-6-6 6 6-6 6" /></>,
    book: <><path d="M12 6v15M3 4c4-1 7 0 9 2 2-2 5-3 9-2v15c-4-1-7 0-9 2-2-2-5-3-9-2V4Z" /></>,
    target: <><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4"/><path d="m12 12 8-8m-1-2v3h3"/></>,
    clock: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
    bolt: <path d="m14 2-9 12h6l-1 8 9-12h-6l1-8Z"/>,
    check: <path d="m5 12 4 4L19 6"/>,
    chart: <><path d="M4 3v17h17M8 15l4-5 4 2 5-7"/></>,
    spark: <><path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5L12 3Z"/></>,
  }
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[kind]}</svg>
}

const subjectLabels: Record<CodeSet, string> = { penal: 'Penal Code', hs: 'Health & Safety', vehicle: 'Vehicle Code' }

export function HomeDashboard(props: Props) {
  const { now, streak, totalAttempts, focusCodes } = props
  const activity = buildWeeklyActivity(props.sessions, now)
  const weeklySessions = activity.reduce((total, day) => total + day.count, 0)
  const maxSessions = Math.max(1, ...activity.map((day) => day.count))
  const graduation = graduationProgress(props.startDate, props.endDate, now)
  const focus = focusCodes[0]
  const startPreferredSession = props.studyFocus === 'exam' ? props.onPracticeTest : props.studyFocus === 'scenarios' ? props.onScenarios : () => props.onStudy(focus?.section.codeSet)
  const primaryLabel = props.studyFocus === 'exam' ? 'Start a practice test' : props.studyFocus === 'scenarios' ? 'Practice scenarios' : focus ? 'Start focused review' : 'Start studying'
  const goal = [5, 10, 15, 20, 30, 45, 60].includes(props.dailyGoalMinutes) ? props.dailyGoalMinutes : 15
  const firstName = props.name.trim().split(/\s+/)[0] || 'cadet'
  const greeting = new Date(now).getHours() < 12 ? 'Good morning' : new Date(now).getHours() < 18 ? 'Good afternoon' : 'Good evening'

  return <div className="today-dashboard">
    <header className="today-heading">
      <div><p className="today-eyebrow">YOUR PERSONAL DASHBOARD</p><h1>{greeting}, {firstName}<span className="today-greeting-dot">.</span></h1><p>Here’s your progress. Let’s keep it moving.</p></div>
      <div className="today-date"><Icon kind="clock"/><span>{new Date(now).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}</span></div>
    </header>

    <div className="today-metrics" aria-label="Your learning statistics">
      <Metric icon="target" label="Practice accuracy" value={totalAttempts ? `${props.accuracy}%` : '—'} detail={totalAttempts ? `${totalAttempts.toLocaleString()} answers recorded` : 'Complete a session to begin'} tone="teal"/>
      <Metric icon="book" label="Codes mastered" value={String(props.mastered)} detail={`Of ${props.totalCodes.toLocaleString()} codes in your library`} tone="blue"/>
      <Metric icon="clock" label="Study time" value={formatDashboardTime(props.studySeconds)} detail="Total active study time" tone="purple"/>
      <Metric icon="chart" label="Your level" value={`Level ${props.level}`} detail={`${props.totalXp.toLocaleString()} XP earned`} tone="amber"/>
    </div>


    <div className="today-hero-grid">
      <section className="today-focus-card" aria-labelledby="today-focus-title">
        <div className="today-focus-top"><span className="today-pill"><Icon kind="spark"/>YOUR NEXT MOVE</span><span className="today-duration"><Icon kind="clock"/>{goal} min daily goal</span></div>
        <div className="today-focus-content"><div><h2 id="today-focus-title">Make today<br/><span>count.</span></h2><p>{props.studyFocus === 'exam' ? 'Your focus is assessment preparation. Put your knowledge to the test, then review the areas where you can grow.' : props.studyFocus === 'scenarios' ? 'Your focus is putting knowledge into practice. Build confidence with realistic training scenarios.' : focus ? `Your next focus: ${subjectLabels[focus.section.codeSet]}. Revisit the codes that need a little more practice.` : 'Start with a few flashcards. As you practice, your study plan will adapt to the areas that need you most.'}</p><button className="today-start" onClick={startPreferredSession}>{primaryLabel}<Icon kind="arrow"/></button></div><div className="today-hero-emblem" aria-hidden="true"><div className="today-emblem-orbit"><AcademyLogo label=""/></div><span>180 ACADEMY</span></div></div>
        <div className="today-focus-foot"><Icon kind="check"/> {props.studyFocus === 'exam' || props.studyFocus === 'scenarios' ? 'Selected for your personal study focus' : focus ? 'Recommended from your practice history' : 'Your first step toward a stronger foundation'}</div>
      </section>
      <section className="today-streak-card" aria-labelledby="streak-title">
        <div className="today-section-head"><h2 id="streak-title">Your momentum</h2><span className="today-icon-tile amber"><Icon kind="bolt"/></span></div>
        <div className="today-streak-value">{streak}<span>day{streak === 1 ? '' : 's'} in a row</span></div>
        <p>{streak > 0 ? 'One day at a time. Keep your streak going with a session today.' : 'Day one starts with your next session. You’ve got this.'}</p><div className="today-streak-week" role="img" aria-label={`Completed sessions this week: ${activity.map(day => `${day.dateLabel}: ${day.count} completed sessions`).join(', ')}`}>{activity.map(day => <span key={day.key} className={day.count ? 'is-done' : ''} title={`${day.label}: ${day.count} sessions`}><i>{day.count ? <Icon kind="check"/> : day.isToday ? '•' : ''}</i><small>{day.label.slice(0,1)}</small></span>)}</div>
        <div className="today-streak-bottom"><span>Personal best</span><strong>{props.bestStreak} days</strong></div>
      </section>
    </div>


    <div className="today-learning-grid">
      <section className="today-panel today-plan" aria-labelledby="study-plan-title">
        <div className="today-section-head"><div><p className="today-eyebrow">A LITTLE FOCUS GOES A LONG WAY</p><h2 id="study-plan-title">Your study plan</h2></div><span className="today-soft-badge">Made for you</span></div>
        <p className="today-panel-intro">{focus ? 'A clear place to start, based on your recent answers.' : 'Build a foundation, then put your knowledge to work.'}</p>
        <button className="today-plan-row" onClick={() => props.onStudy(focus?.section.codeSet)}><span className="today-plan-number">01</span><span><strong>{focus ? `Review ${focus.section.sectionNumber}` : 'Warm up with flashcards'}</strong><small>{focus ? `${focus.section.title} · ${focus.accuracyPercent}% accuracy` : 'Recall the essentials across all code sets'}</small></span><Icon kind="arrow"/></button>
        <button className="today-plan-row" onClick={props.onScenarios}><span className="today-plan-number">02</span><span><strong>Put it into practice</strong><small>Apply what you know to training scenarios</small></span><Icon kind="arrow"/></button>
        <button className="today-plan-row" onClick={props.onPracticeTest}><span className="today-plan-number">03</span><span><strong>Check your understanding</strong><small>Take a practice test and review your results</small></span><Icon kind="arrow"/></button>
      </section>

      <section className="today-panel" aria-labelledby="weekly-activity-title">
        <div className="today-section-head"><div><p className="today-eyebrow">YOUR WEEK AT A GLANCE</p><h2 id="weekly-activity-title">This week</h2></div><span className="today-soft-badge">Mon – Sun</span></div>
        <div className="today-activity-total"><strong>{weeklySessions}</strong><span>completed session{weeklySessions === 1 ? '' : 's'}</span></div>
        <div className="today-activity-chart" role="img" aria-label={`Completed sessions this week: ${activity.map((day) => `${day.label} ${day.count}`).join(', ')}`}>
          {activity.map((day) => <div className={`today-chart-day${day.isToday ? ' is-today' : ''}${day.isFuture ? ' is-future' : ''}`} key={day.key} title={`${day.dateLabel}: ${day.count} completed sessions`}><span className="today-chart-count">{day.count || ''}</span><div className="today-chart-track"><span style={{ height: day.count ? `${Math.max(8, day.count / maxSessions * 100)}%` : '3px' }}/></div><span className="today-chart-label">{day.label}</span><span className="today-chart-dot"/></div>)}
        </div>
        <p className="today-chart-caption">{weeklySessions ? 'Completed tests and game sessions. Keep your rhythm going.' : 'Finish a test or game to add your first session here.'}</p>
      </section>
    </div>

    <div className="today-learning-grid">
      <section className="today-panel" aria-labelledby="subject-progress-title">
        <div className="today-section-head"><div><p className="today-eyebrow">BUILD YOUR FOUNDATION</p><h2 id="subject-progress-title">Your subject progress</h2></div><button className="today-text-link" onClick={props.onStats}>View progress<Icon kind="arrow"/></button></div>
        <div className="today-subjects">{(['penal', 'hs', 'vehicle'] as CodeSet[]).map((codeSet) => {
          const subject = props.subjects.find((item) => item.codeSet === codeSet)
          const accuracy = subject?.accuracyPercent || 0
          return <button className="today-subject-row" onClick={() => props.onStudy(codeSet)} key={codeSet}><div><strong>{subjectLabels[codeSet]}</strong><span>{subject?.attempts ? `${accuracy}% accuracy` : 'Ready to begin'}</span></div><div className="today-progress-track"><span style={{ width: `${accuracy}%` }}/></div></button>
        })}</div>
      </section>
      <section className="today-panel today-journey" aria-labelledby="journey-title"><div className="today-section-head"><div><p className="today-eyebrow">YOUR NEXT MILESTONE</p><h2 id="journey-title">Your academy journey</h2></div><span className="today-icon-tile teal"><AcademyLogo label=""/></span></div>
        {graduation ? <><div className="today-journey-value"><strong>{graduation.daysRemaining ? graduation.daysRemaining : 'Complete'}</strong><span>{graduation.daysRemaining ? `${graduation.daysRemaining === 1 ? 'day' : 'days'} until graduation` : 'Class timeline'}</span></div><div className="today-progress-track" role="progressbar" aria-label="Class timeline progress" aria-valuenow={graduation.percent} aria-valuemin={0} aria-valuemax={100}><span style={{ width: `${graduation.percent}%` }}/></div><p>{graduation.daysRemaining === 0 ? 'Your class has reached its graduation date. Keep sharpening your skills for what comes next.' : graduation.hasStarted ? 'Keep building the habits you will carry beyond the academy.' : 'Get a head start before your first day at the academy.'}</p></> : <><p>Each session is an investment in the cadet you are becoming. Keep building your foundation.</p><div className="today-level-line"><strong>Level {props.level}</strong><span>{props.levelPercent}% to next level</span></div><div className="today-progress-track" role="progressbar" aria-label="Progress to next level" aria-valuenow={props.levelPercent} aria-valuemin={0} aria-valuemax={100}><span style={{ width: `${props.levelPercent}%` }}/></div></>}
        <button className="today-text-link" onClick={props.onClass}>View your class<Icon kind="arrow"/></button>
      </section>
    </div>

    <section className="today-toolkit" aria-label="Explore your study tools"><div><p className="today-eyebrow">YOUR TOOLKIT</p><h2>Make it your kind of session.</h2></div><div className="today-toolkit-links"><button onClick={props.onStudyGuide}><Icon kind="book"/><span><strong>Study guide</strong><small>Understand the essentials</small></span><Icon kind="arrow"/></button><button onClick={props.onPracticeTest}><Icon kind="target"/><span><strong>Practice tests</strong><small>See what you know</small></span><Icon kind="arrow"/></button><button onClick={props.onGames}><Icon kind="bolt"/><span><strong>Training games</strong><small>A challenge worth taking</small></span><Icon kind="arrow"/></button></div></section>
    <footer className="today-footer"><AcademyLogo label=""/><span>Progress takes practice. You are in the right place.</span></footer>
  </div>
}

function Metric({ icon, label, value, detail, tone }: { icon: 'target' | 'book' | 'clock' | 'chart'; label: string; value: string; detail: string; tone: string }) {
  return <article className="today-metric"><div><span className={`today-icon-tile ${tone}`}><Icon kind={icon}/></span><span className="today-metric-label">{label}</span></div><strong>{value}</strong><p>{detail}</p></article>
}
