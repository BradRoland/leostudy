export type MembershipTier = 'free' | 'tier5' | 'tier10'
export type MembershipAccess = {
  tier: MembershipTier
  paidThrough: string | null
  subscriptionId: string | null
  cancelAtPeriodEnd: boolean
  status: string
}
export const freeMembership: MembershipAccess = { tier: 'free', paidThrough: null, subscriptionId: null, cancelAtPeriodEnd: false, status: 'inactive' }
export function effectiveMembership(value: MembershipAccess | null, now = Date.now()): MembershipAccess {
  if (!value || !['free','tier5','tier10'].includes(value.tier)) return freeMembership
  if (value.tier !== 'free' && Date.parse(value.paidThrough || '') > now) return value
  return { ...freeMembership, subscriptionId: value.subscriptionId || null, cancelAtPeriodEnd: value.cancelAtPeriodEnd, status: value.status }
}
export const membershipNames = { free: 'Free', tier5: 'Academy Plus', tier10: 'Academy Pro' }
