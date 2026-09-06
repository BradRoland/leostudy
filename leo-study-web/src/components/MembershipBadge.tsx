export function MembershipBadge({ tier }: { tier?: string }) {
  if (!['tier5','tier10'].includes(tier || '')) return null
  const pro = tier === 'tier10'
  return <span className={`academy-membership-badge ${pro ? 'pro' : 'plus'}`} aria-label={pro ? 'Academy Pro member' : 'Academy Plus member'}><svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="m12 2 8 3v6c0 5-5 9-8 11-3-2-8-6-8-11V5Z"/><path d={pro ? 'm12 6 1.6 3.4 3.7.5-2.7 2.6.6 3.7-3.2-1.8-3.2 1.8.6-3.7-2.7-2.6 3.7-.5Z' : 'm8 11 4-3 4 3m-8 4 4-3 4 3'}/></svg>{pro ? 'PRO' : 'PLUS'}</span>
}
