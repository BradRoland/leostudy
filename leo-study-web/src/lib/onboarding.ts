export type StudyFocus = 'balanced' | 'recall' | 'scenarios' | 'exam'
export type OnboardingProfile = {
  firstName: string
  lastName: string
  displayName: string
  dailyGoalMinutes: number
  studyFocus: StudyFocus
  avatar: File | null
  departmentName: string
}
export const dailyStudyGoals = [10, 15, 30, 45] as const
export function sanitizeStudyGoal(value: unknown) {
  const minutes = Number(value)
  return dailyStudyGoals.some((goal) => goal === minutes) ? minutes : 15
}
export function sanitizeStudyFocus(value: unknown): StudyFocus {
  return ['balanced', 'recall', 'scenarios', 'exam'].includes(String(value)) ? value as StudyFocus : 'balanced'
}
export function cleanRequestDepartments(values: string[]) {
  const seen = new Set<string>()
  return values.map((value) => value.trim().replace(/\s+/g, ' ')).filter((value) => {
    const key = value.toLowerCase()
    if (!value || seen.has(key)) return false
    seen.add(key)
    return true
  })
}
export function validateClassRequest(input: {
  academyName: string; className: string; startDate: string; endDate: string; departments: string[]; requesterDepartment?: string
}, today = new Date().toLocaleDateString('en-CA')) {
  if (!input.academyName.trim()) return 'Enter your academy name.'
  if (!input.className.trim()) return 'Enter a class number or name.'
  const validDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(`${value}T12:00:00Z`)) && new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) === value
  if (!validDate(input.startDate)) return 'Choose a valid class start date.'
  if (!validDate(input.endDate)) return 'Choose a valid graduation date.'
  if (input.endDate < input.startDate) return 'Graduation must be on or after the start date.'
  if (input.endDate < today) return 'Graduation must be today or in the future.'
  const departments = cleanRequestDepartments(input.departments)
  if (!departments.length) return 'Add at least one department in your class.'
  if (input.requesterDepartment && !departments.some((entry) => entry.toLowerCase() === input.requesterDepartment?.trim().toLowerCase())) return 'Choose your department from the departments you added.'
  return ''
}
export function validateOnboardingProfile(input: Pick<OnboardingProfile, 'firstName' | 'lastName' | 'displayName' | 'avatar'>) {
  if (!input.firstName.trim() || !input.lastName.trim()) return 'Enter your first and last name.'
  if (input.firstName.trim().length > 80 || input.lastName.trim().length > 80) return 'Please keep each name under 80 characters.'
  if (input.displayName.trim().length > 80) return 'Keep your display name under 80 characters.'
  if (input.avatar && !['image/jpeg', 'image/png', 'image/webp'].includes(input.avatar.type)) return 'Choose a JPG, PNG, or WebP profile photo.'
  if (input.avatar && input.avatar.size > 5 * 1024 * 1024) return 'Choose a profile photo smaller than 5 MB.'
  return ''
}
export function safeAuthNextPath(value: string, fallback = '/home') {
  if (!value.startsWith('/') || value.startsWith('//') || value.includes('\\')) return fallback
  try {
    const url = new URL(value, 'https://local.invalid')
    const pathname = url.pathname.toLowerCase().replace(/\/+$/, '') || '/'
    if (['/auth/callback', '/signin', '/signup', '/signup/class-request'].includes(pathname)) return fallback
    return `${pathname}${url.search}`
  } catch { return fallback }
}
export function requiresAccountProfileCompletion(metadata: Record<string, unknown>, completed: boolean) {
  // Only accounts created with the guided flow are required to finish it. Legacy members retain immediate access.
  return Number(metadata.academy_onboarding_version) >= 1 && !completed
}
export function splitProfileName(value: string) {
  const parts = value.trim().split(/\s+/).filter(Boolean)
  if (/^Cadet [a-f0-9]{8}$/i.test(value)) return { firstName: '', lastName: '' }
  return { firstName: parts[0] || '', lastName: parts.slice(1).join(' ') }
}
