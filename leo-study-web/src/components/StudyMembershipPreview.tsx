import './StudyMembershipPreview.css'

function InsightIcon({ planning = false }: { planning?: boolean }) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{planning ? <><rect x="4" y="4" width="16" height="17" rx="3"/><path d="M8 2v4m8-4v4M4 10h16m-12 5 2 2 5-4"/></> : <><path d="M4 4v16h16m-12-5 4-5 4 2 4-7"/><path d="M16 5h4v4"/></>}</svg>
}

function Arrow() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12h14m-5-5 5 5-5 5"/></svg>
}

export function HomeInsightsPreview({ planning = false, onExplore }: { planning?: boolean; onExplore: () => void }) {
  return <section className="study-insight-card" aria-label={planning ? 'Personal study tools with Pro' : 'Study insights with Plus'}>
    <div className="study-insight-top"><span className="study-insight-icon"><InsightIcon planning={planning}/></span><span className="study-plan-label">{planning ? 'Academy Pro' : 'Academy Plus + Pro'}</span></div>
    <h2>{planning ? 'Turn insight into a plan.' : 'See where your practice takes you.'}</h2>
    <p>{planning ? 'Give your next session a clear direction, with tools built around your study history.' : 'Understand what’s improving and which subjects deserve another look.'}</p>
    <ul className="study-insight-features">{(planning ? ['Personal weekly plan', 'Focused weakness drills', 'Weekly comparisons & reports'] : ['Accuracy trends', 'Subject & mastery breakdowns', 'Session history']).map(item => <li key={item}><span aria-hidden="true">✓</span>{item}</li>)}</ul>
    <div className="study-insight-action"><button className="study-membership-link" onClick={onExplore}>Explore your analytics<Arrow/></button><small>{planning ? 'Pro · $10/month' : 'Plans from $5/month'}</small></div>
  </section>
}

export function StudyProgressPreview({ onExplore, onStudy }: { onExplore: () => void; onStudy: () => void }) {
  return <section className="study-progress-preview" aria-labelledby="progress-preview-title">
    <div className="study-progress-intro">
      <div className="study-progress-copy"><p className="study-plan-label">A little more clarity. Every session.</p><h2 id="progress-preview-title">Put your progress<br/><span>in perspective.</span></h2><p>See the knowledge you’re building, find the subjects that need attention, and make your next study session count.</p><div className="study-progress-actions"><button className="primary" onClick={onExplore}>Compare memberships<Arrow/></button><button className="study-membership-link" onClick={onStudy}>Keep studying<Arrow/></button></div><small>Plus from $5/month · Cancel anytime</small></div>
      <aside className="study-progress-outline" aria-label="Membership analytics features">
        <div className="study-progress-outline-head"><span className="study-insight-icon"><InsightIcon/></span><div><strong>A clearer view of your learning</strong><small>Included with Plus and Pro</small></div></div>
        <div><span className="study-preview-number">01</span><p><strong>See your strengths</strong><span>Accuracy and mastery across your code sets.</span></p></div>
        <div><span className="study-preview-number">02</span><p><strong>Find your focus</strong><span>Identify the codes that need more practice.</span></p></div>
        <div><span className="study-preview-number">03</span><p><strong>Follow your progress</strong><span>Review your sessions and weekly activity.</span></p></div>
      </aside>
    </div>
    <div className="study-progress-plans">
      <article><div className="study-progress-plan-head"><h3>Academy Plus</h3><p><strong>$5</strong><span>/ month</span></p></div><p>Practice with better feedback.</p><ul><li>Complete personal study analytics</li><li>T-MAS practice, scenarios and answer review</li><li>Selected themes and your Plus profile badge</li></ul></article>
      <article><div className="study-progress-plan-head"><h3>Academy Pro</h3><p><strong>$10</strong><span>/ month</span></p></div><p>Everything in Plus, with a plan to move forward.</p><ul><li>Personal weekly plan and focused weakness drills</li><li>Saved practice setups, study calendar and reports</li><li>All themes, name styling and Pro profile frames</li></ul></article>
    </div>
    <footer><p>Your free study tools, class community and earned rewards stay yours. Membership adds deeper insight and helps support 180 Academy.</p><small>Monthly billing. Tax may apply. If you cancel, benefits continue through your paid period.</small></footer>
  </section>
}
