import { supabase } from './supabase'

export type ClassRosterMember = {
  userId: string
  name: string
  membershipTier?: string
  avatarUrl: string
  department: string
  bio: string
  studySeconds: number
  streak: number
  bestStreak: number
  mastered: number
  flashcards: number
  scenarios: number
  gamesPlayed: number
  wins: number
  losses: number
  winStreak: number
}

const record = (value: unknown): Record<string, unknown> => value && typeof value === 'object' ? value as Record<string, unknown> : {}
const count = (value: unknown) => typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0
export const rosterDefaultAvatar = '/default-avatar-academy-v1.svg'

// Membership is the source of the roster, so people without study state still
// appear. Each request stays scoped to the authenticated class and its members.
export async function loadClassRoster(classId: string): Promise<ClassRosterMember[]> {
  if (!supabase || !classId) throw new Error('Your class is not available yet.')
  const members: Array<{ user_id: string; department_name: string }> = []
  const pageSize = 100
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await supabase.rpc('list_class_member_departments', { p_class_id: classId })
      .order('user_id').range(offset, offset + pageSize - 1)
    if (error) throw error
    members.push(...(data || []))
    if (!data || data.length < pageSize) break
  }
  const unique = [...new Map(members.map(member => [member.user_id, member])).values()]
  const roster: ClassRosterMember[] = []
  // Keep UUID filters comfortably below gateway URL/header limits.
  const profileBatchSize = 40
  for (let offset = 0; offset < unique.length; offset += profileBatchSize) {
    const batch = unique.slice(offset, offset + profileBatchSize)
    const ids = batch.map(member => member.user_id)
    const [profiles, states, duels] = await Promise.all([
      supabase.from('academy_public_profiles').select('user_id,username,avatar_path,bio,legacy_supporter_tier,membership_tier').in('user_id', ids),
      supabase.from('public_study_profiles').select('user_id,profile_details,best_streak,mastered_codes').in('user_id', ids),
      supabase.from('duel_player_stats').select('user_id,wins,losses,current_win_streak').eq('class_id', classId).eq('game_type', 'all').in('user_id', ids),
    ])
    for (const result of [profiles, states, duels]) if (result.error) throw result.error
    const profileById = new Map((profiles.data || []).map(row => [row.user_id, row]))
    const stateById = new Map((states.data || []).map(row => [row.user_id, row]))
    const duelById = new Map((duels.data || []).map(row => [row.user_id, row]))
    for (const member of batch) {
      const profile = profileById.get(member.user_id)
      const state = stateById.get(member.user_id)
      const details = record(state?.profile_details)
      const stats = record(details.stats)
      const games = record(stats.gamePlays)
      const duel = duelById.get(member.user_id)
      const avatarPath = String(profile?.avatar_path || '').trim()
      roster.push({
        userId: member.user_id,
        name: String(profile?.username || '').trim() || 'Classmate',
        membershipTier: String(profile?.membership_tier || 'free'),
        avatarUrl: avatarPath ? /^https?:\/\//i.test(avatarPath) ? avatarPath : supabase.storage.from('avatars').getPublicUrl(avatarPath).data.publicUrl : rosterDefaultAvatar,
        department: member.department_name || 'Department not set',
        bio: String(profile?.bio || details.bio || '').trim(),
        studySeconds: count(stats.studySeconds),
        streak: count(stats.studyDayStreak),
        bestStreak: Math.max(count(stats.bestStudyDayStreak), count(state?.best_streak)),
        mastered: count(Number(state?.mastered_codes ?? details.publicMasteredCodes ?? 0)),
        flashcards: count(stats.flashcardsReviewed),
        scenarios: count(stats.scenariosReviewed),
        gamesPlayed: count(games.matching) + count(games.speed) + count(games.blaster),
        wins: count(duel?.wins), losses: count(duel?.losses), winStreak: count(duel?.current_win_streak),
      })
    }
  }
  return roster.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base', numeric: true }) || a.userId.localeCompare(b.userId))
}

export function formatRosterStudyTime(seconds: number) {
  const minutes = Math.floor(seconds / 60)
  if (!minutes) return seconds > 0 ? '<1 min' : '0 min'
  return minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)}h ${minutes % 60}m`
}
