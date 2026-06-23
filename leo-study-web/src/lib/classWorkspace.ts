export type ClassVisibility = 'listed' | 'unlisted'
export type ClassStatus = 'pending' | 'active' | 'completed' | 'archived' | 'rejected'

export type ActiveClassSummary = {
  status: ClassStatus | string
  visibility: ClassVisibility | string
  endDate?: string | null
}

const inviteCodePattern = /^[A-Z0-9][A-Z0-9-]{2,38}[A-Z0-9]$/

export function normalizeInviteCode(value: string) {
  const compact = String(value || '').trim().replace(/\s+/g, '').toUpperCase()
  if (!compact || compact.includes('/') || compact.includes('\\') || compact.includes('?') || compact.includes('#')) return ''
  return inviteCodePattern.test(compact) ? compact : ''
}

export function buildInviteUrl(code: string, baseUrl: string) {
  const normalizedCode = normalizeInviteCode(code)
  const normalizedBase = String(baseUrl || 'https://join.180.academy').replace(/\/+$/, '')
  if (!normalizedCode) return normalizedBase
  return `${normalizedBase}/${normalizedCode}`
}

export function extractInviteCodeFromPath(path: string) {
  const cleanPath = String(path || '').split('?')[0].split('#')[0]
  const segments = cleanPath.split('/').filter(Boolean)
  if (segments[0] === 'classes' || segments[0] === 'owner') return ''
  const candidate = segments[0] === 'invite' ? segments[1] : segments[0]
  return normalizeInviteCode(candidate || '')
}

export function formatAcademyClassLabel(academyName: string | null | undefined, className: string | null | undefined) {
  const cleanAcademyName = String(academyName || 'Academy')
    .replace(/\s+\d+\s*$/, '')
    .replace(/\s+/g, ' ')
    .trim()
  const cleanClassName = String(className || 'Class')
    .replace(/\s+/g, ' ')
    .trim()
  return `${cleanAcademyName || 'Academy'} ${cleanClassName || 'Class'}`.replace(/\s+/g, ' ').trim()
}

export function shouldShowClassAsActive(classSummary: ActiveClassSummary, now = new Date()) {
  if (classSummary.status !== 'active') return false
  if (classSummary.visibility !== 'listed') return false
  if (!classSummary.endDate) return true
  const endDateMs = Date.parse(`${classSummary.endDate}T23:59:59`)
  if (!Number.isFinite(endDateMs)) return true
  return endDateMs >= now.getTime()
}
