import { useState } from 'react'
import { membershipNames, type MembershipAccess, type MembershipTier } from '../lib/membership'
import './MembershipPage.css'

type Props = {
  access: MembershipAccess
  preview: boolean
  busy: boolean
  error: string
  status: string
  onCheckout: (tier: 'tier5' | 'tier10') => void
  onManage: () => void
  onRefresh: () => void
  onStudy: () => void
}
const features: { label: string; free: boolean | string; tier5: boolean | string; tier10: boolean | string }[] = [
  { label: 'Core study tools, games & class community', free: true, tier5: true, tier10: true },
  { label: 'Earned levels, streaks & daily rewards', free: true, tier5: true, tier10: true },
  { label: 'T-MAS practice exams & scenario training', free: false, tier5: true, tier10: true },
  { label: 'Answer explanations & practice review', free: false, tier5: true, tier10: true },
  { label: 'Accuracy trends & subject breakdowns', free: false, tier5: true, tier10: true },
  { label: 'Mastery, strengths & weakness tracking', free: false, tier5: true, tier10: true },
  { label: 'Session history & weekly activity', free: false, tier5: true, tier10: true },
  { label: 'Website themes', free: 'Classic', tier5: 'Selected collection', tier10: 'Full collection' },
  { label: 'Membership badge across your profile', free: false, tier5: 'Plus badge', tier10: 'Pro badge' },
  { label: 'Personal weekly study plan & goals', free: false, tier5: false, tier10: true },
  { label: 'Focused weakness drills', free: false, tier5: false, tier10: true },
  { label: 'Saved practice setups', free: false, tier5: false, tier10: true },
  { label: 'Study calendar & week-over-week comparisons', free: false, tier5: false, tier10: true },
  { label: 'Downloadable progress report', free: false, tier5: false, tier10: true },
  { label: 'Custom name color, font & glow', free: false, tier5: false, tier10: true },
  { label: 'Additional profile-frame styles', free: false, tier5: false, tier10: true },
]
const plans = [
  { id: 'free' as const, price: 0, name: 'Free', tagline: 'Build your foundation.', items: ['Core study tools and games', 'Your class community', 'Earned levels, streaks and rewards'], action: 'Continue studying' },
  { id: 'tier5' as const, price: 5, name: 'Academy Plus', tagline: 'Know where you stand.', items: ['T-MAS practice and answer review', 'Your complete study analytics', 'Mastery and weakness breakdowns', 'Selected themes and Plus badge'], action: 'Get Academy Plus' },
  { id: 'tier10' as const, price: 10, name: 'Academy Pro', tagline: 'Turn insight into a study plan.', items: ['Everything in Academy Plus', 'Personal plan and weakness drills', 'Saved practice setups', 'Study calendar and weekly comparisons', 'Downloadable progress report', 'All themes, name styling and Pro frames'], action: 'Get Academy Pro' },
]
function FeatureValue({ value }: { value: boolean | string }) {
  return typeof value === 'string' ? <span>{value}</span> : value ? <span className="membership-check"><span aria-hidden="true">✓</span><span className="sr-only">Included</span></span> : <span className="membership-unavailable"><span aria-hidden="true">—</span><span className="sr-only">Not included</span></span>
}
export function MembershipPage(props: Props) {
  const [selected, setSelected] = useState<MembershipTier>(props.access.tier)
  const paid = props.access.tier !== 'free'
  const hasBilling = Boolean(props.access.subscriptionId)
  return <section className="membership-page" aria-labelledby="membership-title">
    <header className="membership-hero">
      <p className="eyebrow">180 Academy memberships</p>
      <h1 id="membership-title">Study with purpose.<br/><span>See your next step.</span></h1>
      <p>Unlock the practice, insight, and personal study tools that help you make the most of every session. Your membership also helps keep 180 Academy growing.</p>
      <div className="membership-assurances"><span>Monthly billing</span><span>Cancel anytime</span><span>Keep your earned progress</span></div>
    </header>
    <div className="membership-current" aria-live="polite"><div><small>Your membership</small><strong>{membershipNames[props.access.tier]}</strong>{paid && props.access.paidThrough ? <span>{props.access.cancelAtPeriodEnd ? 'Access continues until' : 'Paid through'} {new Date(props.access.paidThrough).toLocaleDateString()}</span> : <span>{hasBilling ? props.access.status === 'past_due' ? 'Your payment needs attention. Manage your billing to restore access.' : 'Your paid access has ended. Your study progress is still here.' : 'Choose the tools that fit your study goals.'}</span>}</div><div>{hasBilling ? <button className="secondary" onClick={props.onManage} disabled={props.busy || props.preview}>Manage membership</button> : null}<button className="secondary" onClick={props.onRefresh} disabled={props.busy}>Refresh access</button></div></div>
    {props.error ? <p className="membership-message error" role="alert">{props.error}</p> : null}
    {props.status ? <p className="membership-message" role="status">{props.status}</p> : null}
    {props.preview ? <p className="membership-preview">Development preview · Checkout is disabled here. These plans are being tested with Stripe sandbox payments.</p> : null}
    <div className="membership-plans">{plans.map(plan => <article key={plan.id} className={`membership-plan ${plan.id === 'tier10' ? 'membership-plan-pro' : ''}`}>
      <div className="membership-plan-label">{plan.id === 'tier10' ? 'The complete study toolkit' : plan.id === 'tier5' ? 'Practice + insight' : 'A place to start'}</div>
      <h2>{plan.name}</h2><p>{plan.tagline}</p><div className="membership-price"><strong>${plan.price}</strong><span>{plan.price ? '/ month' : 'forever'}</span></div>
      <ul>{plan.items.map(item => <li key={item}><span aria-hidden="true">✓</span>{item}</li>)}</ul>
      <button className={plan.id === 'tier10' ? 'primary' : 'secondary'} disabled={plan.id !== 'free' && (props.busy || props.preview || props.access.tier === plan.id)} onClick={() => plan.id === 'free' ? props.onStudy() : paid ? props.onManage() : props.onCheckout(plan.id)}>{plan.id !== 'free' && props.access.tier === plan.id ? 'Your current plan' : plan.id !== 'free' && props.preview ? 'Available after testing' : paid && plan.id !== 'free' ? 'Change plan in Stripe' : plan.action}</button>
      <small>{plan.price ? 'Renews monthly. Tax may apply.' : 'No payment details required.'}</small>
    </article>)}</div>
    <section className="membership-compare" aria-labelledby="membership-compare-title">
      <div className="membership-compare-head"><div><p className="eyebrow">Choose your toolkit</p><h2 id="membership-compare-title">See everything you unlock</h2></div><div className="membership-tabs" role="tablist" aria-label="Compare membership benefits">{plans.map(plan => <button key={plan.id} role="tab" tabIndex={selected === plan.id ? 0 : -1} onKeyDown={event => { const direction = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0; if (!direction && !['Home','End'].includes(event.key)) return; event.preventDefault(); const index = event.key === 'Home' ? 0 : event.key === 'End' ? plans.length - 1 : (plans.findIndex(item => item.id === selected) + direction + plans.length) % plans.length; setSelected(plans[index].id); document.getElementById(`membership-tab-${plans[index].id}`)?.focus() }} id={`membership-tab-${plan.id}`} aria-selected={selected === plan.id} aria-controls="membership-benefit-panel" onClick={() => setSelected(plan.id)}>{plan.name.replace('Academy ', '')}</button>)}</div></div>
      <div id="membership-benefit-panel" role="tabpanel" aria-labelledby={`membership-tab-${selected}`} className="membership-feature-panel"><h3>{membershipNames[selected]} includes</h3>{selected === 'free' ? <p>Your free study foundation is here to stay. Plus adds practice and analytics; Pro adds tools to act on those insights.</p> : <p>{selected === 'tier5' ? 'Add practice and clear feedback to your daily study routine.' : 'Bring practice, insight, planning, and personal style into one place.'}</p>}<div className="membership-feature-list">{features.map(feature => <div key={feature.label} className={feature[selected] ? '' : 'is-unavailable'}><span>{feature.label}</span><FeatureValue value={feature[selected]}/></div>)}</div></div>
      <div className="membership-table-wrap"><table><caption>Full membership comparison</caption><thead><tr><th scope="col">Feature</th>{plans.map(plan => <th scope="col" key={plan.id}>{plan.name}<small>${plan.price}{plan.price ? '/month' : ''}</small></th>)}</tr></thead><tbody>{features.map(feature => <tr key={feature.label}><th scope="row">{feature.label}</th>{plans.map(plan => <td key={plan.id}><FeatureValue value={feature[plan.id]}/></td>)}</tr>)}</tbody></table></div>
    </section>
    <section className="membership-faq"><h2>Simple, clear membership</h2><details><summary>What happens if I cancel?</summary><p>Your next renewal stops. Your benefits stay active through the period you already paid for, then your account returns to Free. Your study progress and earned achievements remain.</p></details><details><summary>Can I change my plan?</summary><p>Use Manage membership to review changes in Stripe. Stripe shows the price and any billing adjustment before you confirm.</p></details><details><summary>Does a membership increase my scores or level?</summary><p>Levels and competitive scores come from your study and play. Memberships unlock study tools and personalization.</p></details></section>
  </section>
}

export function MembershipGate({ title, pro = false, onExplore }: { title: string; pro?: boolean; onExplore: () => void }) {
  return <section className="membership-gate card"><p className="eyebrow">{pro ? 'Academy Pro' : 'Academy Plus + Pro'}</p><span className="membership-gate-symbol" aria-hidden="true">↗</span><h2>{title}</h2><p>{pro ? 'Build a focused study routine with your personal plan, targeted drills, and richer progress tools.' : 'See your progress clearly and put your knowledge into practice with a monthly membership.'}</p><button className="primary" onClick={onExplore}>Compare memberships · from ${pro ? 10 : 5}/month</button><small>Cancel anytime. Your earned progress stays yours.</small></section>
}
