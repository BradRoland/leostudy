import { useEffect, useMemo, useRef, useState, type CSSProperties, type SyntheticEvent } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { FireFlame, type FireFlameOption } from '@9am/fire-flame-react'
import './App.css'
import { isSupabaseConfigured, supabase } from './lib/supabase'

type CodeSet = 'penal' | 'hs' | 'vehicle'
type CodeFilter = CodeSet | 'all'
type SupporterTier = 'free' | 'tier2' | 'tier5' | 'tier10'
type AppTab = 'library' | 'study' | 'games' | 'scenarios' | 'home'
type DurationFilter = 15 | 30 | 60 | 'all'
type AppIconName = 'study' | 'games' | 'scenarios' | 'support' | 'home' | 'library'

type HomeLeaderboardEntry = {
  userId: string
  playerName: string
  avatarUrl: string
  supporterTier: SupporterTier
  nameStyle: NameStyle
  bio: string
  agency: string
  isOwner: boolean
  value: number
}

type CodeSection = {
  id: string
  codeSet: CodeSet
  sectionNumber: string
  title: string
  text: string
}

type QuizQuestion = {
  id: string
  codeSet: CodeSet
  linkedSectionNumber: string
  prompt: string
  choices: string[]
  correctIndex: number
  explanation: string
}

type Flashcard = {
  id: string
  codeSet: CodeSet
  front: string
  back: string
}

type SpeedTestQuestion = {
  id: string
  codeSet: CodeSet
  statement: string
  isTrue: boolean
  explanation: string
}

type ScenarioQuestion = {
  id: string
  codeSet: CodeSet
  prompt: string
  choices: string[]
  correctIndex: number
  explanation: string
}

type CodePerformance = {
  correctCount: number
  incorrectCount: number
}

type MatchCard = {
  id: string
  pairId: string
  sectionNumber: string
  codeSet: CodeSet
  text: string
  kind: 'code' | 'definition'
}

type LeaderboardEntry = {
  id: string
  userId: string
  game: string
  playerName: string
  avatarUrl: string
  supporterTier: SupporterTier
  bio: string
  agency: string
  nameStyle: NameStyle
  isOwner: boolean
  matchDuration: number | null
  matchFilter: CodeFilter | null
  score: number
  round: number
  createdAt: number
}

type PersistedState = {
  performance: Record<string, CodePerformance>
  highScores: {
    matching: number
    blaster: number
    caseFile: number
    rapidFire: number
    gravity: number
  }
  bestStreak: number
  profileDetails: ProfileDetails
}

type UserProfile = {
  userId: string
  username: string
  avatarPath: string
  avatarUrl: string
  supporterTier: SupporterTier
}

type ProfileDetails = {
  bio: string
  agency: string
  nameStyle: NameStyle
  namePresets: NameStylePreset[]
  stats: UserStats
}

type NameStyle = {
  color: string
  fontFamily: string
  fontWeight: number
  fontStyle: 'normal' | 'italic'
  glowEnabled: boolean
  glowIntensity: number
}

type NameStylePreset = {
  id: string
  name: string
  style: NameStyle
}

type UserStats = {
  studySeconds: number
  gamePlays: Record<'matching' | 'speed', number>
  flashcardsReviewed: number
  scenariosReviewed: number
  studyModeCounts: Record<CodeFilter, number>
}

const gameHighScoreSeed = {
  matching: 0,
  blaster: 0,
  caseFile: 0,
  rapidFire: 0,
  gravity: 0,
}
const avatarBucket = (import.meta.env.VITE_SUPABASE_AVATAR_BUCKET || 'avatars').trim()
const defaultAvatarUrl = `${import.meta.env.BASE_URL || '/'}default-avatar.svg`
const defaultAvatarPngUrl = `${import.meta.env.BASE_URL || '/'}default-avatar.png`

const codeSetLabel: Record<CodeSet, string> = {
  penal: 'Penal',
  hs: 'HS',
  vehicle: 'Vehicle',
}

const tierLabel: Record<SupporterTier, string> = {
  free: 'Free',
  tier2: '$2 Supporter',
  tier5: '$5 Supporter+',
  tier10: '$10 Pro Supporter',
}

const supporterTierOrder: SupporterTier[] = ['free', 'tier2', 'tier5', 'tier10']
const ownerEmail = 'brad@thespeck.net'
const ownerUsername = 'jake'
const avatarCropFrameSize = 280
const avatarOutputSize = 512

function tierRank(tier: SupporterTier) {
  return supporterTierOrder.indexOf(tier)
}

function isOwnerIdentity(username: string, email?: string) {
  const normalizedName = username.trim().toLowerCase()
  const normalizedEmail = String(email || '').trim().toLowerCase()
  return normalizedName === ownerUsername || normalizedEmail === ownerEmail
}

async function createCroppedAvatarFile(sourceUrl: string, zoom: number, offsetX: number, offsetY: number, sourceName: string) {
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Could not load image for cropping.'))
    img.src = sourceUrl
  })

  const canvas = document.createElement('canvas')
  canvas.width = avatarOutputSize
  canvas.height = avatarOutputSize
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Could not initialize crop canvas.')

  const coverScale = Math.max(avatarOutputSize / image.naturalWidth, avatarOutputSize / image.naturalHeight) * zoom
  const drawWidth = image.naturalWidth * coverScale
  const drawHeight = image.naturalHeight * coverScale
  const offsetScale = avatarOutputSize / avatarCropFrameSize
  const drawX = (avatarOutputSize - drawWidth) / 2 + offsetX * offsetScale
  const drawY = (avatarOutputSize - drawHeight) / 2 + offsetY * offsetScale

  context.clearRect(0, 0, avatarOutputSize, avatarOutputSize)
  context.drawImage(image, drawX, drawY, drawWidth, drawHeight)

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png', 0.95))
  if (!blob) throw new Error('Could not create cropped image.')

  const baseName = sourceName.replace(/\.[^/.]+$/, '').replace(/[^a-z0-9-_]+/gi, '_').slice(0, 40) || 'avatar'
  return new File([blob], `${baseName}_cropped.png`, { type: 'image/png' })
}

const profileFontOptions = [
  { label: 'Inter', value: 'Inter, system-ui, sans-serif' },
  { label: 'Poppins', value: '"Poppins", "Inter", system-ui, sans-serif' },
  { label: 'Montserrat', value: '"Montserrat", "Inter", system-ui, sans-serif' },
  { label: 'Orbitron', value: '"Orbitron", "Inter", system-ui, sans-serif' },
  { label: 'Bebas Neue', value: '"Bebas Neue", "Inter", system-ui, sans-serif' },
  { label: 'Playfair', value: '"Playfair Display", serif' },
  { label: 'Merriweather', value: '"Merriweather", serif' },
  { label: 'Fira Code', value: '"Fira Code", "SFMono-Regular", Menlo, monospace' },
  { label: 'Pacifico', value: '"Pacifico", cursive' },
  { label: 'Caveat', value: '"Caveat", cursive' },
] as const

const defaultNameStyle: NameStyle = {
  color: '#ffd76e',
  fontFamily: profileFontOptions[0].value,
  fontWeight: 600,
  fontStyle: 'normal',
  glowEnabled: true,
  glowIntensity: 40,
}

const nameColorPalette = ['#ffd76e', '#f0f4ff', '#ff6f78', '#44de8e', '#65b7ff', '#c793ff', '#ff9f43', '#8ff3ff', '#ffec9f', '#ff8dbd']

const defaultUserStats: UserStats = {
  studySeconds: 0,
  gamePlays: {
    matching: 0,
    speed: 0,
  },
  flashcardsReviewed: 0,
  scenariosReviewed: 0,
  studyModeCounts: {
    all: 0,
    penal: 0,
    hs: 0,
    vehicle: 0,
  },
}

const stripeTierLinks: Partial<Record<Exclude<SupporterTier, 'free'>, string>> = {
  tier2: (import.meta.env.VITE_STRIPE_LINK_TIER2 || '').trim(),
  tier5: (import.meta.env.VITE_STRIPE_LINK_TIER5 || '').trim(),
  tier10: (import.meta.env.VITE_STRIPE_LINK_TIER10 || '').trim(),
}

function toCodeSet(raw: string, sectionNumber: string): CodeSet {
  const value = raw.trim().toLowerCase()
  const section = sectionNumber.trim().toLowerCase()
  if (section.startsWith('hs') || value.includes('health') || value === 'hs') return 'hs'
  if (section.startsWith('vc') || value.includes('vehicle') || value === 'vc') return 'vehicle'
  return 'penal'
}

function shortText(text: string, max = 140) {
  const clean = text.trim()
  return clean.length <= max ? clean : `${clean.slice(0, max)}...`
}

function formatStudyTime(seconds: number) {
  if (seconds <= 0) return '0m'
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  if (hours === 0) return `${minutes}m`
  if (minutes === 0) return `${hours}h`
  return `${hours}h ${minutes}m`
}

function dedupeSections(sections: CodeSection[]) {
  const map = new Map<string, CodeSection>()
  for (const section of sections) {
    map.set(`${section.codeSet}|${section.sectionNumber.toLowerCase()}`, section)
  }
  return [...map.values()].sort((a, b) => a.sectionNumber.localeCompare(b.sectionNumber))
}

function topEntryPerUser(entries: LeaderboardEntry[]) {
  return Array.from(
    entries.reduce<Map<string, LeaderboardEntry>>((accumulator, entry) => {
      const key = entry.userId.toLowerCase()
      const current = accumulator.get(key)
      if (!current || entry.score > current.score || (entry.score === current.score && entry.round > current.round)) {
        accumulator.set(key, entry)
      }
      return accumulator
    }, new Map<string, LeaderboardEntry>()),
  )
    .map(([, entry]) => entry)
    .sort((left, right) => right.score - left.score || right.round - left.round)
}

function shuffle<T>(array: T[]) {
  const clone = [...array]
  for (let index = clone.length - 1; index > 0; index -= 1) {
    const nextIndex = Math.floor(Math.random() * (index + 1))
    ;[clone[index], clone[nextIndex]] = [clone[nextIndex], clone[index]]
  }
  return clone
}

function buildQuestions(sections: CodeSection[]) {
  const questions: QuizQuestion[] = []

  for (const section of sections) {
    const pool = sections.filter((candidate) => candidate.codeSet === section.codeSet && candidate.id !== section.id)
    if (pool.length < 3) continue

    const distractorByTitle = shuffle(pool).slice(0, 3)
    const sectionChoices = shuffle([section.sectionNumber, ...distractorByTitle.map((item) => item.sectionNumber)])
    questions.push({
      id: crypto.randomUUID(),
      codeSet: section.codeSet,
      linkedSectionNumber: section.sectionNumber,
      prompt: `Which section number matches: ${section.title}?`,
      choices: sectionChoices,
      correctIndex: sectionChoices.indexOf(section.sectionNumber),
      explanation: `${section.sectionNumber}: ${section.title}. ${shortText(section.text)}`,
    })

    const distractorBySection = shuffle(pool).slice(0, 3)
    const titleChoices = shuffle([section.title, ...distractorBySection.map((item) => item.title)])
    questions.push({
      id: crypto.randomUUID(),
      codeSet: section.codeSet,
      linkedSectionNumber: section.sectionNumber,
      prompt: `What best matches ${section.sectionNumber}?`,
      choices: titleChoices,
      correctIndex: titleChoices.indexOf(section.title),
      explanation: `${section.sectionNumber}: ${section.title}. ${shortText(section.text)}`,
    })
  }

  return questions
}

function buildDeck(questions: QuizQuestion[], filter: CodeFilter) {
  const filtered = filter === 'all' ? questions : questions.filter((question) => question.codeSet === filter)
  const grouped = new Map<string, QuizQuestion[]>()

  for (const question of shuffle(filtered)) {
    const existing = grouped.get(question.linkedSectionNumber) ?? []
    existing.push(question)
    grouped.set(question.linkedSectionNumber, existing)
  }

  const deck: QuizQuestion[] = []
  while (grouped.size > 0) {
    for (const key of shuffle([...grouped.keys()])) {
      const current = grouped.get(key)
      if (!current || current.length === 0) {
        grouped.delete(key)
        continue
      }
      const next = current.shift()
      if (next) deck.push(next)
      if (current.length === 0) grouped.delete(key)
    }
  }

  return deck
}

function parseScenarioStatement(statement: string) {
  const clean = statement.trim().replace(/\s+/g, ' ')
  const questionIndex = clean.lastIndexOf('?')
  if (questionIndex < 0 || questionIndex >= clean.length - 1) {
    return { prompt: clean, choice: '' }
  }
  const prompt = clean.slice(0, questionIndex + 1).trim()
  const choice = clean.slice(questionIndex + 1).trim()
  return { prompt, choice }
}

function buildScenarioQuestions(rows: SpeedTestQuestion[]) {
  const grouped = new Map<string, SpeedTestQuestion[]>()
  for (const row of rows) {
    const groupId = row.id.replace(/-(t|f)$/i, '')
    const existing = grouped.get(groupId) ?? []
    existing.push(row)
    grouped.set(groupId, existing)
  }

  const scenarios: ScenarioQuestion[] = []

  for (const [groupId, groupRows] of grouped.entries()) {
    const pair = groupRows.filter((row) => /-(t|f)$/i.test(row.id))
    if (pair.length >= 2) {
      const parsedChoices = pair.map((row) => {
        const parsed = parseScenarioStatement(row.statement)
        return { row, prompt: parsed.prompt, choice: parsed.choice || (row.isTrue ? 'True' : 'False') }
      })
      const prompt = parsedChoices[0].prompt
      const shuffledChoices = shuffle(parsedChoices.map((item) => item.choice))
      const correctChoice = parsedChoices.find((item) => item.row.isTrue)?.choice || parsedChoices[0].choice
      scenarios.push({
        id: groupId,
        codeSet: pair[0].codeSet,
        prompt,
        choices: shuffledChoices,
        correctIndex: Math.max(0, shuffledChoices.indexOf(correctChoice)),
        explanation: (pair.find((row) => row.isTrue) || pair[0]).explanation,
      })
      continue
    }

    const row = groupRows[0]
    if (!row) continue
    scenarios.push({
      id: groupId,
      codeSet: row.codeSet,
      prompt: row.statement.trim(),
      choices: ['True', 'False'],
      correctIndex: row.isTrue ? 0 : 1,
      explanation: row.explanation,
    })
  }

  const poolsByCodeSet: Record<CodeSet, string[]> = {
    penal: [],
    hs: [],
    vehicle: [],
  }

  for (const scenario of scenarios) {
    const correctChoice = scenario.choices[scenario.correctIndex]?.trim()
    if (!correctChoice) continue
    if (!poolsByCodeSet[scenario.codeSet].includes(correctChoice)) {
      poolsByCodeSet[scenario.codeSet].push(correctChoice)
    }
  }

  const globalPool = Array.from(new Set([...poolsByCodeSet.penal, ...poolsByCodeSet.hs, ...poolsByCodeSet.vehicle]))
  const genericDistractors = [
    'Detention with reasonable suspicion',
    'Consensual encounter, no detention',
    'Probable cause for arrest exists',
    'Insufficient legal basis for search',
    'Search lawful under consent exception',
    'Evidence may be suppressed in court',
  ]

  return shuffle(
    scenarios.map((scenario) => {
      const correctChoice = scenario.choices[scenario.correctIndex]
      const sameSetPool = poolsByCodeSet[scenario.codeSet].filter((choice) => choice !== correctChoice)
      const crossPool = globalPool.filter((choice) => choice !== correctChoice && !sameSetPool.includes(choice))

      const distractors: string[] = []
      for (const choice of shuffle(sameSetPool)) {
        if (distractors.length >= 3) break
        if (!distractors.includes(choice)) distractors.push(choice)
      }
      for (const choice of shuffle(crossPool)) {
        if (distractors.length >= 3) break
        if (!distractors.includes(choice)) distractors.push(choice)
      }
      for (const choice of genericDistractors) {
        if (distractors.length >= 3) break
        if (choice !== correctChoice && !distractors.includes(choice)) distractors.push(choice)
      }

      const finalChoices = shuffle([correctChoice, ...distractors.slice(0, 3)])
      return {
        ...scenario,
        choices: finalChoices,
        correctIndex: finalChoices.indexOf(correctChoice),
      }
    }),
  )
}

function performanceKey(codeSet: CodeSet, section: string) {
  return `${codeSet}|${section.trim().toLowerCase()}`
}

function mastery(performance?: CodePerformance) {
  if (!performance || performance.correctCount + performance.incorrectCount === 0) return ''
  if (performance.correctCount >= 10) return 'Mastered'
  return 'Needs Work'
}

function sanitizeNameStyle(input: unknown): NameStyle {
  if (!input || typeof input !== 'object') return { ...defaultNameStyle }
  const value = input as Partial<NameStyle>
  const allowedFonts = new Set<string>(profileFontOptions.map((option) => option.value))
  const normalizedGlow = typeof value.glowIntensity === 'number' ? Math.max(0, Math.min(100, Math.floor(value.glowIntensity))) : defaultNameStyle.glowIntensity
  return {
    color: typeof value.color === 'string' && /^#([0-9a-f]{6})$/i.test(value.color) ? value.color : defaultNameStyle.color,
    fontFamily: typeof value.fontFamily === 'string' && allowedFonts.has(value.fontFamily) ? value.fontFamily : defaultNameStyle.fontFamily,
    fontWeight: value.fontWeight === 700 ? 700 : 600,
    fontStyle: value.fontStyle === 'italic' ? 'italic' : 'normal',
    glowEnabled: Boolean(value.glowEnabled),
    glowIntensity: normalizedGlow,
  }
}

function sanitizeNamePresets(input: unknown): NameStylePreset[] {
  if (!Array.isArray(input)) return []
  return input
    .map((entry) => {
      if (!entry || typeof entry !== 'object') return null
      const value = entry as Partial<NameStylePreset>
      const name = typeof value.name === 'string' ? value.name.trim().slice(0, 24) : ''
      if (!name) return null
      return {
        id: typeof value.id === 'string' && value.id.trim().length > 0 ? value.id : crypto.randomUUID(),
        name,
        style: sanitizeNameStyle(value.style),
      } satisfies NameStylePreset
    })
    .filter((entry): entry is NameStylePreset => Boolean(entry))
    .slice(0, 8)
}

function sanitizeUserStats(input: unknown): UserStats {
  if (!input || typeof input !== 'object') return { ...defaultUserStats, gamePlays: { ...defaultUserStats.gamePlays }, studyModeCounts: { ...defaultUserStats.studyModeCounts } }
  const value = input as Partial<UserStats>
  const gamePlays = value.gamePlays && typeof value.gamePlays === 'object' ? value.gamePlays : {}
  const studyModeCounts = value.studyModeCounts && typeof value.studyModeCounts === 'object' ? value.studyModeCounts : {}
  return {
    studySeconds: typeof value.studySeconds === 'number' ? Math.max(0, Math.floor(value.studySeconds)) : 0,
    gamePlays: {
      matching: typeof (gamePlays as Record<string, unknown>).matching === 'number' ? Math.max(0, Math.floor((gamePlays as Record<string, number>).matching)) : 0,
      speed: typeof (gamePlays as Record<string, unknown>).speed === 'number' ? Math.max(0, Math.floor((gamePlays as Record<string, number>).speed)) : 0,
    },
    flashcardsReviewed: typeof value.flashcardsReviewed === 'number' ? Math.max(0, Math.floor(value.flashcardsReviewed)) : 0,
    scenariosReviewed: typeof value.scenariosReviewed === 'number' ? Math.max(0, Math.floor(value.scenariosReviewed)) : 0,
    studyModeCounts: {
      all: typeof (studyModeCounts as Record<string, unknown>).all === 'number' ? Math.max(0, Math.floor((studyModeCounts as Record<string, number>).all)) : 0,
      penal: typeof (studyModeCounts as Record<string, unknown>).penal === 'number' ? Math.max(0, Math.floor((studyModeCounts as Record<string, number>).penal)) : 0,
      hs: typeof (studyModeCounts as Record<string, unknown>).hs === 'number' ? Math.max(0, Math.floor((studyModeCounts as Record<string, number>).hs)) : 0,
      vehicle: typeof (studyModeCounts as Record<string, unknown>).vehicle === 'number' ? Math.max(0, Math.floor((studyModeCounts as Record<string, number>).vehicle)) : 0,
    },
  }
}

function hexToRgba(hex: string, alpha: number) {
  const value = hex.replace('#', '')
  const red = Number.parseInt(value.slice(0, 2), 16)
  const green = Number.parseInt(value.slice(2, 4), 16)
  const blue = Number.parseInt(value.slice(4, 6), 16)
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`
}

function displayNameStyle(nameStyle: NameStyle | undefined, tier: SupporterTier): CSSProperties | undefined {
  if (!nameStyle || tier !== 'tier10') return undefined
  const style = sanitizeNameStyle(nameStyle)
  const glowAlpha = Math.min(0.95, 0.12 + style.glowIntensity / 140)
  const glowRadius = 4 + style.glowIntensity / 2.4
  const glowColor = hexToRgba(style.color, glowAlpha)
  return {
    color: style.color,
    fontFamily: style.fontFamily,
    fontWeight: style.fontWeight,
    fontStyle: style.fontStyle,
    textShadow: style.glowEnabled ? `0 0 ${glowRadius}px ${glowColor}, 0 0 ${Math.max(2, glowRadius * 0.45)}px ${glowColor}` : undefined,
  }
}

function sanitizeState(input: unknown): PersistedState {
  const fallback: PersistedState = {
    performance: {},
    highScores: gameHighScoreSeed,
    bestStreak: 0,
    profileDetails: {
      bio: '',
      agency: '',
      nameStyle: { ...defaultNameStyle },
      namePresets: [],
      stats: { ...defaultUserStats, gamePlays: { ...defaultUserStats.gamePlays }, studyModeCounts: { ...defaultUserStats.studyModeCounts } },
    },
  }

  if (!input || typeof input !== 'object') {
    return fallback
  }

  const state = input as Partial<PersistedState>
  return {
    performance: state.performance && typeof state.performance === 'object' ? state.performance : {},
    highScores: {
      ...gameHighScoreSeed,
      ...(state.highScores && typeof state.highScores === 'object' ? state.highScores : {}),
    },
    bestStreak: typeof state.bestStreak === 'number' ? Math.max(0, Math.floor(state.bestStreak)) : 0,
    profileDetails:
      state.profileDetails && typeof state.profileDetails === 'object'
        ? {
            bio: String((state.profileDetails as Partial<ProfileDetails>).bio || ''),
            agency: String((state.profileDetails as Partial<ProfileDetails>).agency || ''),
            nameStyle: sanitizeNameStyle((state.profileDetails as Partial<ProfileDetails>).nameStyle),
            namePresets: sanitizeNamePresets((state.profileDetails as Partial<ProfileDetails>).namePresets),
            stats: sanitizeUserStats((state.profileDetails as Partial<ProfileDetails>).stats),
          }
        : {
            bio: '',
            agency: '',
            nameStyle: { ...defaultNameStyle },
            namePresets: [],
            stats: { ...defaultUserStats, gamePlays: { ...defaultUserStats.gamePlays }, studyModeCounts: { ...defaultUserStats.studyModeCounts } },
          },
  }
}

function normalizeAvatarPath(rawValue: string): string {
  const value = rawValue.trim()
  if (!value) {
    return ''
  }

  if (!/^https?:\/\//i.test(value)) {
    const trimmedLeadingSlash = value.replace(/^\/+/, '')
    if (trimmedLeadingSlash.startsWith(`${avatarBucket}/`)) {
      return trimmedLeadingSlash.slice(avatarBucket.length + 1)
    }
    return trimmedLeadingSlash
  }

  const marker = `/storage/v1/object/public/${avatarBucket}/`
  const markerIndex = value.indexOf(marker)
  if (markerIndex < 0) {
    return ''
  }
  return value.slice(markerIndex + marker.length).replace(/^\/+/, '')
}

function toPublicAvatarUrl(rawValue: string): string {
  const avatarPath = normalizeAvatarPath(rawValue)
  if (!avatarPath) return ''
  if (avatarPath === defaultAvatarUrl.replace(/^\/+/, '')) return ''
  if (!avatarPath.includes('/')) return ''

  if (supabase) {
    const { data } = supabase.storage.from(avatarBucket).getPublicUrl(avatarPath)
    if (data?.publicUrl) return data.publicUrl
  }

  const baseUrl = (import.meta.env.VITE_SUPABASE_URL || import.meta.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/+$/, '')
  if (!baseUrl) return ''
  return `${baseUrl}/storage/v1/object/public/${avatarBucket}/${avatarPath}`
}

function mapProfileRow(row: Record<string, unknown>, userId: string): UserProfile {
  const avatarPath = String(row.avatar_path || '')
  return {
    userId,
    username: String(row.username || ''),
    avatarPath,
    avatarUrl: toPublicAvatarUrl(avatarPath) || defaultAvatarUrl,
    supporterTier: (['free', 'tier2', 'tier5', 'tier10'].includes(String(row.supporter_tier))
      ? String(row.supporter_tier)
      : 'free') as SupporterTier,
  }
}

function tierNameClass(tier: SupporterTier) {
  if (tier === 'tier2') return 'tier-name tier-name-red'
  if (tier === 'tier5') return 'tier-name tier-name-green'
  if (tier === 'tier10') return 'tier-name tier-name-gold'
  return 'tier-name'
}

function displayNameClass(tier: SupporterTier, hasStyle: boolean) {
  if (tier === 'tier10' && hasStyle) return 'tier-name'
  return tierNameClass(tier)
}

function AppIcon({ name, className = '' }: { name: AppIconName; className?: string }) {
  const commonProps = { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.9, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }
  if (name === 'study') {
    return (
      <svg {...commonProps} className={className} aria-hidden>
        <path d="M4 5.5h7a3 3 0 0 1 3 3V19H7a3 3 0 0 0-3 3Z" />
        <path d="M20 5.5h-7a3 3 0 0 0-3 3V19h7a3 3 0 0 1 3 3Z" />
      </svg>
    )
  }
  if (name === 'games') {
    return (
      <svg {...commonProps} className={className} aria-hidden>
        <path d="M8 10h8a4 4 0 0 1 3.7 5.5l-1.4 3.3a2 2 0 0 1-3 .9l-2.3-1.6a2 2 0 0 0-2.3 0l-2.3 1.6a2 2 0 0 1-3-.9L4.3 15.5A4 4 0 0 1 8 10Z" />
        <path d="M8 14h2" />
        <path d="M9 13v2" />
        <circle cx="15.5" cy="14.5" r="0.8" fill="currentColor" />
        <circle cx="17.8" cy="16.1" r="0.8" fill="currentColor" />
      </svg>
    )
  }
  if (name === 'scenarios') {
    return (
      <svg {...commonProps} className={className} aria-hidden>
        <path d="M12 3 4 7v5c0 5 3.4 8.7 8 9.9 4.6-1.2 8-4.9 8-9.9V7Z" />
        <path d="m9.3 12 1.9 1.9 3.8-3.8" />
      </svg>
    )
  }
  if (name === 'support') {
    return (
      <svg {...commonProps} className={className} aria-hidden>
        <path d="M12 21s-7-4.3-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 11c0 5.7-7 10-7 10Z" />
      </svg>
    )
  }
  if (name === 'library') {
    return (
      <svg {...commonProps} className={className} aria-hidden>
        <path d="M4 5h4v15H4zM10 3h4v17h-4zM16 7h4v13h-4z" />
      </svg>
    )
  }
  return (
    <svg {...commonProps} className={className} aria-hidden>
      <path d="M3 11.5 12 4l9 7.5" />
      <path d="M5.5 10.5V20h13v-9.5" />
    </svg>
  )
}

function App() {
  const location = useLocation()
  const navigate = useNavigate()

  const [sections, setSections] = useState<CodeSection[]>([])
  const [questions, setQuestions] = useState<QuizQuestion[]>([])
  const [speedQuestions, setSpeedQuestions] = useState<SpeedTestQuestion[]>([])
  const [activeTab, setActiveTab] = useState<AppTab>('home')
  const [studyFilter, setStudyFilter] = useState<CodeFilter>('all')
  const [libraryFilter, setLibraryFilter] = useState<CodeSet>('penal')

  const [authReady, setAuthReady] = useState(false)
  const [authEmail, setAuthEmail] = useState('')
  const [authPassword, setAuthPassword] = useState('')
  const [authPasswordConfirm, setAuthPasswordConfirm] = useState('')
  const [showSignInPassword, setShowSignInPassword] = useState(false)
  const [showSignUpPassword, setShowSignUpPassword] = useState(false)
  const [showSignUpPasswordConfirm, setShowSignUpPasswordConfirm] = useState(false)
  const [profileUsername, setProfileUsername] = useState('')
  const [profileAvatar, setProfileAvatar] = useState<File | null>(null)
  const [profileAvatarPreviewUrl, setProfileAvatarPreviewUrl] = useState('')
  const [avatarCropSourceUrl, setAvatarCropSourceUrl] = useState('')
  const [avatarCropSourceName, setAvatarCropSourceName] = useState('')
  const [avatarCropOpen, setAvatarCropOpen] = useState(false)
  const [avatarCropZoom, setAvatarCropZoom] = useState(1)
  const [avatarCropX, setAvatarCropX] = useState(0)
  const [avatarCropY, setAvatarCropY] = useState(0)
  const [accountNewPassword, setAccountNewPassword] = useState('')
  const [accountConfirmPassword, setAccountConfirmPassword] = useState('')
  const [showAccountPassword, setShowAccountPassword] = useState(false)
  const [authError, setAuthError] = useState('')
  const [authSuccess, setAuthSuccess] = useState('')
  const [authLoading, setAuthLoading] = useState(false)
  const [currentUserId, setCurrentUserId] = useState<string>('')
  const [currentUserEmail, setCurrentUserEmail] = useState('')
  const [currentUserProvider, setCurrentUserProvider] = useState('email')
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [forceProfileSetup, setForceProfileSetup] = useState(false)
  const [profileDetails, setProfileDetails] = useState<ProfileDetails>({
    bio: '',
    agency: '',
    nameStyle: { ...defaultNameStyle },
    namePresets: [],
    stats: { ...defaultUserStats, gamePlays: { ...defaultUserStats.gamePlays }, studyModeCounts: { ...defaultUserStats.studyModeCounts } },
  })
  const [newPresetName, setNewPresetName] = useState('')

  const [performance, setPerformance] = useState<Record<string, CodePerformance>>({})
  const [highScores, setHighScores] = useState(gameHighScoreSeed)
  const [bestStreak, setBestStreak] = useState(0)
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([])
  const [leaderboardError, setLeaderboardError] = useState('')
  const [selectedLeaderboardEntry, setSelectedLeaderboardEntry] = useState<LeaderboardEntry | null>(null)
  const [selectedLeaderboardIsTop, setSelectedLeaderboardIsTop] = useState(false)
  const [stateHydrated, setStateHydrated] = useState(false)
  const [celebration, setCelebration] = useState<{ title: string; subtitle: string; burst: number } | null>(null)
  const [homeStudyTimeLeaders, setHomeStudyTimeLeaders] = useState<HomeLeaderboardEntry[]>([])
  const [homeMostMasteredLeaders, setHomeMostMasteredLeaders] = useState<HomeLeaderboardEntry[]>([])
  const [homeMatchingDurationFilter, setHomeMatchingDurationFilter] = useState<DurationFilter>('all')
  const [homeMatchingCodeFilter, setHomeMatchingCodeFilter] = useState<CodeFilter>('all')
  const [homeSpeedDurationFilter, setHomeSpeedDurationFilter] = useState<DurationFilter>('all')
  const [homeSpeedCodeFilter, setHomeSpeedCodeFilter] = useState<CodeFilter>('all')
  const [homeMatchingConfigOpen, setHomeMatchingConfigOpen] = useState(false)
  const [homeSpeedConfigOpen, setHomeSpeedConfigOpen] = useState(false)
  const [profileMenuOpen, setProfileMenuOpen] = useState(false)
  const profileMenuRef = useRef<HTMLDivElement | null>(null)

  const [quizDeck, setQuizDeck] = useState<QuizQuestion[]>([])
  const [currentQuestion, setCurrentQuestion] = useState<QuizQuestion | null>(null)
  const [selectedChoice, setSelectedChoice] = useState<number | null>(null)
  const [feedback, setFeedback] = useState('')
  const [streak, setStreak] = useState(0)
  const recentCodesRef = useRef<string[]>([])

  const [flashcardIndex, setFlashcardIndex] = useState(0)
  const [flashcardOrder, setFlashcardOrder] = useState<string[]>([])
  const [flipped, setFlipped] = useState(false)

  const [matchFilter, setMatchFilter] = useState<CodeFilter>('all')
  const [matchDuration, setMatchDuration] = useState(30)
  const [matchRemaining, setMatchRemaining] = useState(30)
  const [matchRound, setMatchRound] = useState(1)
  const [matchScore, setMatchScore] = useState(0)
  const [matchRunning, setMatchRunning] = useState(false)
  const [matchCards, setMatchCards] = useState<MatchCard[]>([])
  const [selectedCards, setSelectedCards] = useState<string[]>([])
  const [wrongCardIds, setWrongCardIds] = useState<string[]>([])
  const [matchedPairIds, setMatchedPairIds] = useState<string[]>([])
  const [recentMatchSections, setRecentMatchSections] = useState<string[]>([])
  const [matchDone, setMatchDone] = useState(false)
  const [matchSessionDuration, setMatchSessionDuration] = useState(30)
  const [matchSessionFilter, setMatchSessionFilter] = useState<CodeFilter>('all')
  const [showMatchSetupModal, setShowMatchSetupModal] = useState(false)
  const [leaderboardDurationFilter, setLeaderboardDurationFilter] = useState(30)
  const [leaderboardCodeFilter, setLeaderboardCodeFilter] = useState<CodeFilter>('all')

  const [speedFilter, setSpeedFilter] = useState<CodeFilter>('all')
  const [speedDuration, setSpeedDuration] = useState(30)
  const [speedRemaining, setSpeedRemaining] = useState(30)
  const [speedRunning, setSpeedRunning] = useState(false)
  const [speedDone, setSpeedDone] = useState(false)
  const [speedScore, setSpeedScore] = useState(0)
  const [speedAnsweredCount, setSpeedAnsweredCount] = useState(0)
  const [speedCurrentQuestion, setSpeedCurrentQuestion] = useState<QuizQuestion | null>(null)
  const [speedDeck, setSpeedDeck] = useState<QuizQuestion[]>([])
  const [speedSessionQuestions, setSpeedSessionQuestions] = useState<QuizQuestion[]>([])
  const [speedSessionDuration, setSpeedSessionDuration] = useState(30)
  const [speedSessionFilter, setSpeedSessionFilter] = useState<CodeFilter>('all')
  const [showSpeedSetupModal, setShowSpeedSetupModal] = useState(false)
  const [speedFeedback, setSpeedFeedback] = useState('')
  const [speedLeaderboardDurationFilter, setSpeedLeaderboardDurationFilter] = useState(30)
  const [speedLeaderboardCodeFilter, setSpeedLeaderboardCodeFilter] = useState<CodeFilter>('all')
  const [scenarioDeck, setScenarioDeck] = useState<ScenarioQuestion[]>([])
  const [scenarioCurrentQuestion, setScenarioCurrentQuestion] = useState<ScenarioQuestion | null>(null)
  const [scenarioResult, setScenarioResult] = useState<string>('')
  const [gamesMode, setGamesMode] = useState<'matching' | 'speed'>('matching')
  const lastAppStateUpdateRef = useRef(0)
  const highScoresRef = useRef(gameHighScoreSeed)
  const leaderboardRef = useRef<LeaderboardEntry[]>([])
  const matchScoreRef = useRef(0)
  const matchRoundRef = useRef(1)
  const speedScoreRef = useRef(0)
  const speedAnsweredCountRef = useRef(0)
  const quizFireHostRef = useRef<HTMLDivElement | null>(null)
  const [quizFireWidth, setQuizFireWidth] = useState(0)

  useEffect(() => {
    document.title = 'LEO Study'
  }, [])

  useEffect(() => {
    const pendingSetup = window.localStorage.getItem('pending_profile_setup') === '1'
    if (pendingSetup) {
      setForceProfileSetup(true)
      window.localStorage.removeItem('pending_profile_setup')
    }
  }, [])

  useEffect(
    () => () => {
      if (avatarCropSourceUrl) URL.revokeObjectURL(avatarCropSourceUrl)
      if (profileAvatarPreviewUrl) URL.revokeObjectURL(profileAvatarPreviewUrl)
    },
    [avatarCropSourceUrl, profileAvatarPreviewUrl],
  )

  useEffect(() => {
    if (!profileMenuOpen) return
    const handleOutside = (event: MouseEvent) => {
      const target = event.target as Node | null
      if (profileMenuRef.current && target && !profileMenuRef.current.contains(target)) {
        setProfileMenuOpen(false)
      }
    }
    window.addEventListener('mousedown', handleOutside)
    return () => window.removeEventListener('mousedown', handleOutside)
  }, [profileMenuOpen])

  useEffect(() => {
    const loadCodes = async () => {
      const files = ['/data/ca_codes_seed.json', '/data/ca_penal_codes_pdf_seed.json', '/data/ca_vehicle_codes_pdf_seed.json']
      const responses = await Promise.all(files.map((file) => fetch(file).then((result) => (result.ok ? result.json() : []))))
      const merged = (responses.flat() as Array<Record<string, unknown>>).map((entry) => {
        const sectionNumber = String(entry.sectionNumber ?? '').trim()
        return {
          id: crypto.randomUUID(),
          codeSet: toCodeSet(String(entry.codeSet ?? ''), sectionNumber),
          sectionNumber,
          title: String(entry.title ?? ''),
          text: String(entry.text ?? ''),
        } satisfies CodeSection
      })
      const finalSections = dedupeSections(merged).filter((item) => item.sectionNumber && item.title)
      setSections(finalSections)
      setQuestions(buildQuestions(finalSections))
    }

    loadCodes().catch(() => {
      setSections([])
      setQuestions([])
    })
  }, [])

  useEffect(() => {
    const measure = () => {
      const host = quizFireHostRef.current
      if (!host) return
      const width = Math.floor(host.getBoundingClientRect().width)
      if (width > 0) setQuizFireWidth(width)
    }
    measure()
    const raf = window.requestAnimationFrame(measure)
    window.addEventListener('resize', measure)
    return () => {
      window.cancelAnimationFrame(raf)
      window.removeEventListener('resize', measure)
    }
  }, [])

  useEffect(() => {
    matchScoreRef.current = matchScore
  }, [matchScore])

  useEffect(() => {
    highScoresRef.current = highScores
  }, [highScores])

  useEffect(() => {
    leaderboardRef.current = leaderboard
  }, [leaderboard])

  useEffect(() => {
    matchRoundRef.current = matchRound
  }, [matchRound])

  useEffect(() => {
    speedScoreRef.current = speedScore
  }, [speedScore])

  useEffect(() => {
    speedAnsweredCountRef.current = speedAnsweredCount
  }, [speedAnsweredCount])

  useEffect(() => {
    const loadSpeedQuestions = async () => {
      const response = await fetch('/data/speed_test_questions.json')
      if (!response.ok) throw new Error('missing speed test seed')
      const rows = (await response.json()) as Array<Record<string, unknown>>
      const mapped = rows
        .map(
          (row) =>
            ({
              id: String(row.id || crypto.randomUUID()),
              codeSet: (['penal', 'hs', 'vehicle'].includes(String(row.codeSet)) ? String(row.codeSet) : 'penal') as CodeSet,
              statement: String(row.statement || ''),
              isTrue: Boolean(row.isTrue),
              explanation: String(row.explanation || ''),
            }) satisfies SpeedTestQuestion,
        )
        .filter((row) => row.statement.length > 0)
      setSpeedQuestions(mapped)
    }

    loadSpeedQuestions().catch(() => setSpeedQuestions([]))
  }, [])

  const refreshLeaderboard = async () => {
    if (!supabase) return

    const { data: rows, error } = await supabase
      .from('leaderboard')
      .select('id,user_id,game,score,round,created_at,match_duration,match_filter')
      .order('score', { ascending: false })
      .limit(300)

    if (error || !rows) {
      setLeaderboardError(error?.message || 'Could not load leaderboard.')
      return
    }
    setLeaderboardError('')

    const userIds = [...new Set(rows.map((entry) => String(entry.user_id)))]
    let profilesByUserId: Record<string, { username: string; avatarUrl: string; supporterTier: SupporterTier }> = {}
    let detailsByUserId: Record<string, ProfileDetails> = {}

    if (userIds.length > 0) {
      const { data: profiles } = await supabase
        .from('profiles')
        .select('user_id,username,avatar_path,supporter_tier,bio,agency')
        .in('user_id', userIds)
      profilesByUserId = (profiles || []).reduce<Record<string, { username: string; avatarUrl: string; supporterTier: SupporterTier }>>(
        (accumulator, entry) => {
          accumulator[String(entry.user_id)] = {
            username: String(entry.username || ''),
            avatarUrl: toPublicAvatarUrl(String(entry.avatar_path || '')) || defaultAvatarUrl,
            supporterTier: (['free', 'tier2', 'tier5', 'tier10'].includes(String(entry.supporter_tier))
              ? String(entry.supporter_tier)
              : 'free') as SupporterTier,
          }
          return accumulator
        },
        {},
      )
      detailsByUserId = (profiles || []).reduce<Record<string, ProfileDetails>>((accumulator, entry) => {
        accumulator[String(entry.user_id)] = {
          bio: String(entry.bio || ''),
          agency: String(entry.agency || ''),
          nameStyle: { ...defaultNameStyle },
          namePresets: [],
          stats: { ...defaultUserStats, gamePlays: { ...defaultUserStats.gamePlays }, studyModeCounts: { ...defaultUserStats.studyModeCounts } },
        }
        return accumulator
      }, {})

      const { data: appStates } = await supabase
        .from('app_state')
        .select('user_id,profile_details')
        .in('user_id', userIds)
      for (const row of appStates || []) {
        const userId = String(row.user_id || '')
        if (!userId) continue
        const details = sanitizeState({ profileDetails: row.profile_details }).profileDetails
        const existing = detailsByUserId[userId] ?? {
          bio: '',
          agency: '',
          nameStyle: { ...defaultNameStyle },
          namePresets: [],
          stats: { ...defaultUserStats, gamePlays: { ...defaultUserStats.gamePlays }, studyModeCounts: { ...defaultUserStats.studyModeCounts } },
        }
        detailsByUserId[userId] = {
          bio: existing.bio || details.bio,
          agency: existing.agency || details.agency,
          nameStyle: details.nameStyle,
          namePresets: details.namePresets,
          stats: details.stats,
        }
      }
    }

    const mapped = rows.map(
      (entry): LeaderboardEntry => ({
        id: String(entry.id),
        userId: String(entry.user_id || ''),
        game: String(entry.game),
        playerName: profilesByUserId[String(entry.user_id)]?.username || 'Player',
        avatarUrl: profilesByUserId[String(entry.user_id)]?.avatarUrl || defaultAvatarUrl,
        supporterTier: profilesByUserId[String(entry.user_id)]?.supporterTier || 'free',
        bio: detailsByUserId[String(entry.user_id)]?.bio || '',
        agency: detailsByUserId[String(entry.user_id)]?.agency || '',
        nameStyle: detailsByUserId[String(entry.user_id)]?.nameStyle || { ...defaultNameStyle },
        isOwner: isOwnerIdentity(profilesByUserId[String(entry.user_id)]?.username || ''),
        matchDuration: typeof entry.match_duration === 'number' ? entry.match_duration : null,
        matchFilter: (['all', 'penal', 'hs', 'vehicle'].includes(String(entry.match_filter))
          ? String(entry.match_filter)
          : null) as CodeFilter | null,
        score: Number(entry.score || 0),
        round: Number(entry.round || 0),
        createdAt: Date.parse(String(entry.created_at || '')) || Date.now(),
      }),
    )

    const deduped = Array.from(
      mapped
        .reduce<Map<string, LeaderboardEntry>>((accumulator, entry) => {
          const key = `${entry.userId.toLowerCase()}|${entry.game.toLowerCase()}|${entry.matchDuration ?? 0}|${entry.matchFilter ?? 'all'}`
          const current = accumulator.get(key)
          if (!current || entry.score > current.score || (entry.score === current.score && entry.round > current.round)) {
            accumulator.set(key, entry)
          }
          return accumulator
        }, new Map<string, LeaderboardEntry>())
        .values(),
    ).sort((left, right) => right.score - left.score || right.round - left.round)

    setLeaderboard(deduped)
  }

  const refreshHomeLeaderboards = async () => {
    if (!supabase) return
    const { data: states, error } = await supabase
      .from('app_state')
      .select('user_id,performance,profile_details')
      .limit(400)
    if (error || !states) return

    const userIds = [...new Set(states.map((entry) => String(entry.user_id || '')))].filter(Boolean)
    let profileMap: Record<string, { username: string; avatarUrl: string; supporterTier: SupporterTier }> = {}
    if (userIds.length > 0) {
      const { data: profiles } = await supabase
        .from('profiles')
        .select('user_id,username,avatar_path,supporter_tier')
        .in('user_id', userIds)
      profileMap = (profiles || []).reduce<Record<string, { username: string; avatarUrl: string; supporterTier: SupporterTier }>>((accumulator, entry) => {
        accumulator[String(entry.user_id)] = {
          username: String(entry.username || 'Player'),
          avatarUrl: toPublicAvatarUrl(String(entry.avatar_path || '')) || defaultAvatarUrl,
          supporterTier: (['free', 'tier2', 'tier5', 'tier10'].includes(String(entry.supporter_tier)) ? String(entry.supporter_tier) : 'free') as SupporterTier,
        }
        return accumulator
      }, {})
    }

    const studyRows: HomeLeaderboardEntry[] = []
    const masteredRows: HomeLeaderboardEntry[] = []
    for (const row of states) {
      const userId = String(row.user_id || '')
      if (!userId) continue
      const parsed = sanitizeState({ profileDetails: row.profile_details, performance: row.performance })
      const profile = profileMap[userId] || { username: 'Player', avatarUrl: defaultAvatarUrl, supporterTier: 'free' as SupporterTier }
      studyRows.push({
        userId,
        playerName: profile.username,
        avatarUrl: profile.avatarUrl,
        supporterTier: profile.supporterTier,
        nameStyle: parsed.profileDetails.nameStyle,
        bio: parsed.profileDetails.bio,
        agency: parsed.profileDetails.agency,
        isOwner: isOwnerIdentity(profile.username),
        value: parsed.profileDetails.stats.studySeconds,
      })
      const masteredCount = Object.values(parsed.performance).filter((item) => item.correctCount >= 10).length
      masteredRows.push({
        userId,
        playerName: profile.username,
        avatarUrl: profile.avatarUrl,
        supporterTier: profile.supporterTier,
        nameStyle: parsed.profileDetails.nameStyle,
        bio: parsed.profileDetails.bio,
        agency: parsed.profileDetails.agency,
        isOwner: isOwnerIdentity(profile.username),
        value: masteredCount,
      })
    }

    setHomeStudyTimeLeaders(studyRows.filter((entry) => entry.value > 0).sort((left, right) => right.value - left.value).slice(0, 5))
    setHomeMostMasteredLeaders(masteredRows.filter((entry) => entry.value > 0).sort((left, right) => right.value - left.value).slice(0, 5))
  }

  useEffect(() => {
    if (!supabase) {
      setAuthReady(true)
      return
    }
    const client = supabase

    const init = async () => {
      const {
        data: { session },
      } = await client.auth.getSession()

      if (session?.user) {
        setCurrentUserId(session.user.id)
        setCurrentUserEmail(session.user.email || '')
        setCurrentUserProvider(String(session.user.app_metadata?.provider || 'email'))
      }

      setAuthReady(true)
    }

    init().catch(() => setAuthReady(true))

    const {
      data: { subscription },
    } = client.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        setCurrentUserId(session.user.id)
        setCurrentUserEmail(session.user.email || '')
        setCurrentUserProvider(String(session.user.app_metadata?.provider || 'email'))
      } else {
        setCurrentUserId('')
        setCurrentUserEmail('')
        setCurrentUserProvider('email')
        setProfile(null)
        setStateHydrated(false)
      }
    })

    return () => {
      subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    if (!supabase || !currentUserId) {
      return
    }
    const client = supabase

    const hydrate = async () => {
      const { data: profileRow } = await client
        .from('profiles')
        .select('user_id,username,avatar_path,supporter_tier,bio,agency')
        .eq('user_id', currentUserId)
        .maybeSingle()

      if (profileRow) {
        const mapped = mapProfileRow(profileRow as Record<string, unknown>, currentUserId)
        setProfile(mapped)
        setProfileUsername(mapped.username)
        setForceProfileSetup(false)
      } else {
        setProfile({ userId: currentUserId, username: '', avatarPath: '', avatarUrl: defaultAvatarUrl, supporterTier: 'free' })
        setProfileUsername('')
        setForceProfileSetup(true)
      }

      const { data: stateRow } = await client
        .from('app_state')
        .select('performance,high_scores,best_streak,profile_details,updated_at')
        .eq('user_id', currentUserId)
        .maybeSingle()

      const nextState = sanitizeState(
        stateRow
          ? {
              performance: stateRow.performance,
              highScores: stateRow.high_scores,
              bestStreak: stateRow.best_streak,
              profileDetails: stateRow.profile_details,
            }
          : null,
      )

      setPerformance(nextState.performance)
      setHighScores(nextState.highScores)
      setBestStreak(nextState.bestStreak)
      const profileBio = String(profileRow?.bio || '')
      const profileAgency = String(profileRow?.agency || '')
      setProfileDetails({
        bio: profileBio || nextState.profileDetails.bio,
        agency: profileAgency || nextState.profileDetails.agency,
        nameStyle: nextState.profileDetails.nameStyle,
        namePresets: nextState.profileDetails.namePresets,
        stats: nextState.profileDetails.stats,
      })
      lastAppStateUpdateRef.current = Date.parse(String(stateRow?.updated_at || '')) || Date.now()
      setStateHydrated(true)

      await refreshLeaderboard()
      await refreshHomeLeaderboards()
    }

    hydrate().catch(() => undefined)
  }, [currentUserId])

  useEffect(() => {
    if (!supabase || !stateHydrated || !currentUserId) return
    const client = supabase

    const timeout = setTimeout(() => {
      void (async () => {
        const { data } = await client
          .from('app_state')
          .upsert(
            {
              user_id: currentUserId,
              performance,
              high_scores: highScores,
              best_streak: bestStreak,
              profile_details: profileDetails,
              updated_at: new Date().toISOString(),
            },
            { onConflict: 'user_id' },
          )
          .select('updated_at')
          .maybeSingle()

        const next = Date.parse(String(data?.updated_at || '')) || Date.now()
        lastAppStateUpdateRef.current = Math.max(lastAppStateUpdateRef.current, next)
      })()
    }, 500)

    return () => clearTimeout(timeout)
  }, [currentUserId, stateHydrated, performance, highScores, bestStreak, profileDetails])

  useEffect(() => {
    if (!supabase || !currentUserId) return
    const client = supabase
    const channel = client
      .channel(`sync-${currentUserId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'app_state', filter: `user_id=eq.${currentUserId}` },
        (payload) => {
          const row = payload.new as Record<string, unknown>
          const nextUpdatedAt = Date.parse(String(row.updated_at || '')) || 0
          if (nextUpdatedAt <= lastAppStateUpdateRef.current) return

          const nextState = sanitizeState({
            performance: row.performance,
            highScores: row.high_scores,
            bestStreak: row.best_streak,
            profileDetails: row.profile_details,
          })
          setPerformance(nextState.performance)
          setHighScores(nextState.highScores)
          setBestStreak(nextState.bestStreak)
          setProfileDetails(nextState.profileDetails)
          lastAppStateUpdateRef.current = nextUpdatedAt
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'profiles', filter: `user_id=eq.${currentUserId}` },
        (payload) => {
          const row = payload.new as Record<string, unknown>
          const mapped = mapProfileRow(row, currentUserId)
          setProfile(mapped)
          if (mapped.username) setProfileUsername(mapped.username)
          setProfileDetails((previous) => ({
            bio: String(row.bio || ''),
            agency: String(row.agency || ''),
            nameStyle: previous.nameStyle,
            namePresets: previous.namePresets,
            stats: previous.stats,
          }))
        },
      )
      .subscribe()

    return () => {
      client.removeChannel(channel)
    }
  }, [currentUserId])

  useEffect(() => {
    if (!supabase || !currentUserId) return
    const client = supabase
    const timer = setInterval(async () => {
      const { data: profileRow } = await client
        .from('profiles')
        .select('user_id,username,avatar_path,supporter_tier,bio,agency')
        .eq('user_id', currentUserId)
        .maybeSingle()
      if (!profileRow) return
      const mapped = mapProfileRow(profileRow as Record<string, unknown>, currentUserId)
      setProfile(mapped)
    }, 20000)

    return () => clearInterval(timer)
  }, [currentUserId])

  const filteredSections = useMemo(
    () => sections.filter((section) => section.codeSet === libraryFilter),
    [sections, libraryFilter],
  )

  const filteredFlashcards = useMemo(() => {
    const list = studyFilter === 'all' ? sections : sections.filter((section) => section.codeSet === studyFilter)
    return list.map(
      (section) =>
        ({
          id: section.id,
          codeSet: section.codeSet,
          front: section.sectionNumber,
          back: `${section.title}\n\n${shortText(section.text, 220)}`,
        }) satisfies Flashcard,
    )
  }, [sections, studyFilter])

  const orderedFlashcards = useMemo(() => {
    if (filteredFlashcards.length === 0) return []
    if (flashcardOrder.length === 0) return filteredFlashcards
    const byId = new Map(filteredFlashcards.map((card) => [card.id, card]))
    const ordered = flashcardOrder.map((id) => byId.get(id)).filter(Boolean) as Flashcard[]
    if (ordered.length !== filteredFlashcards.length) return filteredFlashcards
    return ordered
  }, [filteredFlashcards, flashcardOrder])

  const matchingLeaderboard = useMemo(
    () =>
      topEntryPerUser(
        leaderboard
          .filter((entry) => entry.game === 'Matching')
          .filter((entry) => entry.matchDuration === leaderboardDurationFilter && entry.matchFilter === leaderboardCodeFilter),
      )
        .slice(0, 8),
    [leaderboard, leaderboardDurationFilter, leaderboardCodeFilter],
  )

  const speedLeaderboard = useMemo(
    () =>
      topEntryPerUser(
        leaderboard
          .filter((entry) => entry.game === 'Speed Test')
          .filter((entry) => entry.matchDuration === speedLeaderboardDurationFilter && entry.matchFilter === speedLeaderboardCodeFilter),
      )
        .slice(0, 8),
    [leaderboard, speedLeaderboardDurationFilter, speedLeaderboardCodeFilter],
  )
  const homeMatchingLeaders = useMemo(
    () =>
      topEntryPerUser(
        leaderboard
          .filter((entry) => entry.game === 'Matching')
          .filter((entry) => entry.score > 0)
          .filter((entry) => (homeMatchingDurationFilter === 'all' ? true : entry.matchDuration === homeMatchingDurationFilter))
          .filter((entry) => (homeMatchingCodeFilter === 'all' ? true : entry.matchFilter === homeMatchingCodeFilter)),
      )
        .slice(0, 5),
    [leaderboard, homeMatchingDurationFilter, homeMatchingCodeFilter],
  )
  const homeSpeedLeaders = useMemo(
    () =>
      topEntryPerUser(
        leaderboard
          .filter((entry) => entry.game === 'Speed Test')
          .filter((entry) => entry.score > 0)
          .filter((entry) => (homeSpeedDurationFilter === 'all' ? true : entry.matchDuration === homeSpeedDurationFilter))
          .filter((entry) => (homeSpeedCodeFilter === 'all' ? true : entry.matchFilter === homeSpeedCodeFilter)),
      )
        .slice(0, 5),
    [leaderboard, homeSpeedDurationFilter, homeSpeedCodeFilter],
  )

  const speedQuestionBank = useMemo(() => {
    const base = questions.filter((question) => question.prompt.startsWith('Which section number matches:'))
    return speedFilter === 'all' ? base : base.filter((question) => question.codeSet === speedFilter)
  }, [questions, speedFilter])
  const scenarioQuestionBank = useMemo(() => buildScenarioQuestions(speedQuestions), [speedQuestions])

  useEffect(() => {
    const nextOrder = shuffle(filteredFlashcards.map((card) => card.id))
    setFlashcardOrder(nextOrder)
    setFlashcardIndex(0)
    setFlipped(false)
  }, [studyFilter, filteredFlashcards])

  const setNextQuizQuestion = (forceRebuild = false) => {
    const recentSections = recentCodesRef.current
    const sourceDeck = forceRebuild || quizDeck.length === 0 ? buildDeck(questions, studyFilter) : quizDeck
    if (sourceDeck.length === 0) {
      setCurrentQuestion(null)
      return
    }

    let picked = sourceDeck.find((question) => !recentSections.includes(question.linkedSectionNumber.toLowerCase()))
    if (!picked) picked = sourceDeck[0]

    const nextDeck = [...sourceDeck]
    const index = nextDeck.findIndex((question) => question.id === picked?.id)
    if (index >= 0) nextDeck.splice(index, 1)

    if (picked) {
      setCurrentQuestion(picked)
      setQuizDeck(nextDeck)
      recentCodesRef.current = [...recentSections, picked.linkedSectionNumber.toLowerCase()].slice(-5)
      setSelectedChoice(null)
      setFeedback('')
    }
  }

  useEffect(() => {
    setQuizDeck([])
    recentCodesRef.current = []
    setStreak(0)
    setSelectedChoice(null)
    setFeedback('')
    setNextQuizQuestion(true)
  }, [studyFilter, questions])

  useEffect(() => {
    if (!matchRunning) return
    const timer = setInterval(() => {
      setMatchRemaining((remaining) => {
        if (remaining <= 1) {
          clearInterval(timer)
          setMatchRunning(false)
          setMatchDone(true)
          const finalMatchScore = matchScoreRef.current
          const finalMatchRound = matchRoundRef.current
          const previousBest = highScoresRef.current.matching
          const globalBest = leaderboardRef.current
            .filter((entry) => entry.game === 'Matching')
            .reduce((max, entry) => Math.max(max, entry.score), 0)
          const isPersonalBest = finalMatchScore > previousBest
          const isGlobalBest = finalMatchScore > globalBest
          setHighScores((previous) => ({ ...previous, matching: Math.max(previous.matching, finalMatchScore) }))
          if (isGlobalBest) {
            triggerCelebration('🏆 New #1 Matching Score', `${finalMatchScore} points`)
          } else if (isPersonalBest) {
            triggerCelebration('🎉 New Personal Best', `Matching: ${finalMatchScore} points`)
          }

          if (supabase && currentUserId) {
            void (async () => {
              const { error: insertError } = await supabase
                .from('leaderboard')
                .insert({
                  game: 'Matching',
                  score: finalMatchScore,
                  round: finalMatchRound,
                  user_id: currentUserId,
                  match_duration: matchSessionDuration,
                  match_filter: matchSessionFilter,
                })

              if (insertError) {
                setLeaderboardError(
                  `Could not save leaderboard score: ${insertError.message}. Run the latest /supabase/schema.sql migration.`,
                )
              } else {
                setLeaderboardError('')
              }

              setLeaderboardDurationFilter(matchSessionDuration)
              setLeaderboardCodeFilter(matchSessionFilter)
              await refreshLeaderboard()
              await refreshHomeLeaderboards()
            })()
          }

          return 0
        }

        return remaining - 1
      })
    }, 1000)

    return () => clearInterval(timer)
  }, [matchRunning, currentUserId, matchSessionDuration, matchSessionFilter])

  const markPerformance = (codeSet: CodeSet, sectionNumber: string, correct: boolean) => {
    const key = performanceKey(codeSet, sectionNumber)
    const current = performance[key] ?? { correctCount: 0, incorrectCount: 0 }
    const updated: CodePerformance = {
      correctCount: current.correctCount + (correct ? 1 : 0),
      incorrectCount: current.incorrectCount + (correct ? 0 : 1),
    }
    setPerformance((previous) => ({ ...previous, [key]: updated }))
    return current.correctCount < 10 && updated.correctCount >= 10
  }

  const answerQuestion = (index: number) => {
    if (!currentQuestion || selectedChoice !== null) return
    setSelectedChoice(index)
    incrementUserStats((stats) => ({
      ...stats,
      studyModeCounts: {
        ...stats.studyModeCounts,
        [studyFilter]: stats.studyModeCounts[studyFilter] + 1,
      },
    }))

    const isCorrect = index === currentQuestion.correctIndex
    const masteredNow = markPerformance(currentQuestion.codeSet, currentQuestion.linkedSectionNumber, isCorrect)

    if (isCorrect) {
      const nextStreak = streak + 1
      setStreak(nextStreak)
      setBestStreak((previous) => Math.max(previous, nextStreak))
      setFeedback(masteredNow ? 'Correct • Mastered this code.' : 'Correct answer.')
      return
    }

    setStreak(0)
    setFeedback('Incorrect answer.')
  }

  const makeRoundCards = (targetFilter: CodeFilter) => {
    const pool = (targetFilter === 'all' ? sections : sections.filter((section) => section.codeSet === targetFilter)).filter(
      (section) => !recentMatchSections.includes(section.sectionNumber.toLowerCase()),
    )
    const selected = shuffle(pool.length >= 3 ? pool : sections).slice(0, 3)

    const cards = selected.flatMap((section) => {
      const pairId = crypto.randomUUID()
      return [
        {
          id: crypto.randomUUID(),
          pairId,
          sectionNumber: section.sectionNumber,
          codeSet: section.codeSet,
          text: section.sectionNumber,
          kind: 'code',
        },
        {
          id: crypto.randomUUID(),
          pairId,
          sectionNumber: section.sectionNumber,
          codeSet: section.codeSet,
          text: section.title,
          kind: 'definition',
        },
      ] as MatchCard[]
    })

    setMatchCards(shuffle(cards))
    setMatchedPairIds([])
    setSelectedCards([])
    setWrongCardIds([])
    setRecentMatchSections((previous) => [...previous, ...selected.map((item) => item.sectionNumber.toLowerCase())].slice(-18))
  }

  const startMatching = () => {
    setMatchSessionDuration(matchDuration)
    setMatchSessionFilter(matchFilter)
    setMatchDone(false)
    setMatchScore(0)
    setMatchRound(1)
    matchScoreRef.current = 0
    matchRoundRef.current = 1
    setMatchRemaining(matchDuration)
    setRecentMatchSections([])
    setMatchRunning(true)
    makeRoundCards(matchFilter)
    incrementUserStats((stats) => ({
      ...stats,
      gamePlays: {
        ...stats.gamePlays,
        matching: stats.gamePlays.matching + 1,
      },
    }))
  }

  const beginMatchingFromSetup = () => {
    setShowMatchSetupModal(false)
    startMatching()
  }

  const exitMatchingSession = () => {
    setMatchRunning(false)
    setMatchDone(false)
    setSelectedCards([])
    setWrongCardIds([])
    setMatchedPairIds([])
  }

  const nextSpeedQuestion = (candidateDeck?: QuizQuestion[], previousId?: string) => {
    const usingProvidedDeck = Array.isArray(candidateDeck)
    let deck = usingProvidedDeck ? [...candidateDeck] : [...speedDeck]
    if (!usingProvidedDeck && deck.length === 0) {
      deck = shuffle(speedSessionQuestions)
    }
    if (deck.length === 0) {
      setSpeedCurrentQuestion(null)
      setSpeedDeck([])
      return
    }
    if (previousId && deck.length > 1 && deck[0].id === previousId) {
      ;[deck[0], deck[1]] = [deck[1], deck[0]]
    }
    const [next, ...remaining] = deck
    setSpeedCurrentQuestion(next)
    setSpeedDeck(remaining)
  }

  const startSpeedTest = () => {
    const pool = speedQuestionBank.filter((question) => speedFilter === 'all' || question.codeSet === speedFilter)
    const initialDeck = shuffle(pool)
    if (initialDeck.length === 0) {
      setSpeedCurrentQuestion(null)
      setSpeedDeck([])
      setSpeedRunning(false)
      setSpeedDone(false)
      setSpeedFeedback('')
      return
    }
    setSpeedSessionQuestions(pool)
    setSpeedSessionDuration(speedDuration)
    setSpeedSessionFilter(speedFilter)
    setSpeedRemaining(speedDuration)
    setSpeedScore(0)
    setSpeedAnsweredCount(0)
    speedScoreRef.current = 0
    speedAnsweredCountRef.current = 0
    setSpeedFeedback('')
    setSpeedDone(false)
    setSpeedRunning(true)
    nextSpeedQuestion(initialDeck)
    incrementUserStats((stats) => ({
      ...stats,
      gamePlays: {
        ...stats.gamePlays,
        speed: stats.gamePlays.speed + 1,
      },
    }))
  }

  const beginSpeedFromSetup = () => {
    setShowSpeedSetupModal(false)
    startSpeedTest()
  }

  const exitSpeedSession = () => {
    setSpeedRunning(false)
    setSpeedDone(false)
    setSpeedFeedback('')
  }

  const answerSpeedQuestion = (choiceIndex: number) => {
    if (!speedRunning || !speedCurrentQuestion) return
    const isCorrect = choiceIndex === speedCurrentQuestion.correctIndex
    setSpeedAnsweredCount((count) => count + 1)
    if (isCorrect) {
      setSpeedScore((score) => score + 10)
      setSpeedFeedback('Correct')
    } else {
      setSpeedScore((score) => Math.max(0, score - 5))
      setSpeedFeedback('Incorrect')
    }
    const previousId = speedCurrentQuestion.id
    setTimeout(() => {
      nextSpeedQuestion(undefined, previousId)
      setSpeedFeedback('')
    }, 150)
  }

  const nextScenarioQuestion = (candidateDeck?: ScenarioQuestion[], previousId?: string) => {
    let deck = candidateDeck ? [...candidateDeck] : [...scenarioDeck]
    if (deck.length === 0) {
      deck = shuffle(scenarioQuestionBank)
    }
    if (deck.length === 0) {
      setScenarioCurrentQuestion(null)
      setScenarioDeck([])
      return
    }
    if (previousId && deck.length > 1 && deck[0].id === previousId) {
      ;[deck[0], deck[1]] = [deck[1], deck[0]]
    }
    const [next, ...remaining] = deck
    setScenarioCurrentQuestion(next)
    setScenarioDeck(remaining)
    setScenarioResult('')
  }

  const answerScenario = (choiceIndex: number) => {
    if (!scenarioCurrentQuestion) return
    const isCorrect = choiceIndex === scenarioCurrentQuestion.correctIndex
    incrementUserStats((stats) => ({ ...stats, scenariosReviewed: stats.scenariosReviewed + 1 }))
    setScenarioResult(isCorrect ? 'Correct' : `Incorrect • Correct answer: ${scenarioCurrentQuestion.choices[scenarioCurrentQuestion.correctIndex]}`)
  }

  useEffect(() => {
    if (selectedCards.length !== 2) return
    const selected = matchCards.filter((card) => selectedCards.includes(card.id))
    if (selected.length !== 2) return

    const isMatch = selected[0].pairId === selected[1].pairId && selected[0].kind !== selected[1].kind

    if (isMatch) {
      setMatchedPairIds((previous) => [...previous, selected[0].pairId])
      setMatchScore((score) => score + 10)
      setWrongCardIds([])
      markPerformance(selected[0].codeSet, selected[0].sectionNumber, true)
      setSelectedCards([])
      return
    } else {
      setMatchScore((score) => Math.max(0, score - 5))
      setWrongCardIds(selected.map((card) => card.id))
      markPerformance(selected[0].codeSet, selected[0].sectionNumber, false)
      markPerformance(selected[1].codeSet, selected[1].sectionNumber, false)
    }

    const timeout = setTimeout(() => {
      setSelectedCards([])
      setWrongCardIds([])
    }, 260)
    return () => clearTimeout(timeout)
  }, [selectedCards, matchCards])

  useEffect(() => {
    if (!matchRunning || matchCards.length === 0) return
    const uniquePairs = new Set(matchCards.map((card) => card.pairId))
    if (matchedPairIds.length !== uniquePairs.size) return
    setMatchRound((round) => round + 1)
    setMatchScore((score) => score + 20)
    makeRoundCards(matchFilter)
  }, [matchedPairIds, matchCards, matchRunning, matchFilter])

  useEffect(() => {
    if (!speedRunning) return
    const timer = setInterval(() => {
      setSpeedRemaining((remaining) => {
        if (remaining <= 1) {
          clearInterval(timer)
          setSpeedRunning(false)
          setSpeedDone(true)
          const finalSpeedScore = speedScoreRef.current
          const finalAnswered = speedAnsweredCountRef.current
          const previousBest = highScoresRef.current.rapidFire
          const globalBest = leaderboardRef.current
            .filter((entry) => entry.game === 'Speed Test')
            .reduce((max, entry) => Math.max(max, entry.score), 0)
          const isPersonalBest = finalSpeedScore > previousBest
          const isGlobalBest = finalSpeedScore > globalBest
          setHighScores((previous) => ({ ...previous, rapidFire: Math.max(previous.rapidFire, finalSpeedScore) }))
          if (isGlobalBest) {
            triggerCelebration('🏆 New #1 Speed Score', `${finalSpeedScore} points`)
          } else if (isPersonalBest) {
            triggerCelebration('🎉 New Personal Best', `Speed: ${finalSpeedScore} points`)
          }

          if (supabase && currentUserId) {
            void (async () => {
              const { error: insertError } = await supabase
                .from('leaderboard')
                .insert({
                  game: 'Speed Test',
                  score: finalSpeedScore,
                  round: finalAnswered,
                  user_id: currentUserId,
                  match_duration: speedSessionDuration,
                  match_filter: speedSessionFilter,
                })

              if (insertError) {
                setLeaderboardError(
                  `Could not save leaderboard score: ${insertError.message}. Run the latest /supabase/schema.sql migration.`,
                )
              } else {
                setLeaderboardError('')
              }

              setSpeedLeaderboardDurationFilter(speedSessionDuration)
              setSpeedLeaderboardCodeFilter(speedSessionFilter)
              await refreshLeaderboard()
              await refreshHomeLeaderboards()
            })()
          }
          return 0
        }
        return remaining - 1
      })
    }, 1000)

    return () => clearInterval(timer)
  }, [speedRunning, speedSessionDuration, speedSessionFilter, currentUserId])

  useEffect(() => {
    setScenarioDeck([])
    nextScenarioQuestion([])
  }, [scenarioQuestionBank])

  const submitSignIn = async () => {
    if (!supabase) return
    setAuthLoading(true)
    setAuthError('')
    setAuthSuccess('')

    const { data, error } = await supabase.auth.signInWithPassword({
      email: authEmail,
      password: authPassword,
    })

    if (error) {
      setAuthError(error.message)
      setAuthLoading(false)
      return
    }

    if (data.user) {
      setCurrentUserId(data.user.id)
      setCurrentUserEmail(data.user.email || '')
      setCurrentUserProvider(String(data.user.app_metadata?.provider || 'email'))
    }

    setAuthLoading(false)
  }

  const submitSignUp = async () => {
    if (!supabase) return
    if (authPassword !== authPasswordConfirm) {
      setAuthError('Passwords do not match.')
      return
    }
    setAuthLoading(true)
    setAuthError('')
    setAuthSuccess('')
    window.localStorage.removeItem('pending_profile_setup')

    const { data, error } = await supabase.auth.signUp({
      email: authEmail,
      password: authPassword,
    })

    if (error) {
      const message = error.message.toLowerCase()
      if (message.includes('already registered') || message.includes('already exists')) {
        setAuthError('This email is already in use. If you used Google before, sign in with Google.')
      } else {
        setAuthError(error.message)
      }
      setAuthLoading(false)
      return
    }

    const hasIdentity = Boolean(data?.user?.identities && data.user.identities.length > 0)
    if (!hasIdentity) {
      setAuthError('This email is already in use. If you used Google before, sign in with Google.')
      setAuthLoading(false)
      return
    }

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: authEmail,
      password: authPassword,
    })

    if (signInError) {
      const message = signInError.message.toLowerCase()
      if (message.includes('email not confirmed') || message.includes('confirmation')) {
        setAuthError('Account created, but email confirmation is enabled in Supabase. Disable email confirmation to allow immediate sign-in.')
      } else {
        setAuthError(`Account created, but sign-in failed: ${signInError.message}`)
      }
      setAuthLoading(false)
      return
    }

    await supabase.auth.signOut()
    const normalizedEmail = authEmail.trim().toLowerCase()
    setAuthEmail(normalizedEmail)
    setAuthSuccess("You're able to sign in now.")
    setAuthPassword('')
    setAuthPasswordConfirm('')
    setShowSignUpPassword(false)
    setShowSignUpPasswordConfirm(false)
    navigate('/signin')

    setAuthLoading(false)
  }

  const submitGoogle = async () => {
    if (!supabase) return
    setAuthLoading(true)
    setAuthError('')
    if (isSignUpPage) {
      window.localStorage.setItem('pending_profile_setup', '1')
    }

    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin,
      },
    })

    if (error) {
      setAuthError(error.message)
      setAuthLoading(false)
    }
  }

  const submitProfile = async () => {
    if (!supabase || !currentUserId) return
    setAuthLoading(true)
    setAuthError('')
    setAuthSuccess('')

    let avatarPath = profile?.avatarPath || ''

    if (profileAvatar) {
      const extension = profileAvatar.name.split('.').pop() || 'jpg'
      const fileName = `${currentUserId}/${crypto.randomUUID()}.${extension}`
      const uploadResult = await supabase.storage.from(avatarBucket).upload(fileName, profileAvatar, { upsert: true })
      if (uploadResult.error) {
        setAuthError(uploadResult.error.message || `Could not upload image to '${avatarBucket}' bucket.`)
        setAuthLoading(false)
        return
      }
      avatarPath = fileName
    }

    const normalizedUsername = profileUsername.trim()
    const { data: savedProfileRow, error } = await supabase
      .from('profiles')
      .upsert(
        {
          user_id: currentUserId,
          username: normalizedUsername,
          avatar_path: avatarPath,
          supporter_tier: profile?.supporterTier || 'free',
          bio: profileDetails.bio,
          agency: profileDetails.agency,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id' },
      )
      .select('user_id,username,avatar_path,supporter_tier,bio,agency')
      .single()

    if (error) {
      setAuthError(error.message)
      setAuthLoading(false)
      return
    }

    const mapped = mapProfileRow(savedProfileRow as Record<string, unknown>, currentUserId)
    setProfile(mapped)
    setProfileUsername(mapped.username)
    setForceProfileSetup(false)
    setProfileAvatar(null)
    if (profileAvatarPreviewUrl) URL.revokeObjectURL(profileAvatarPreviewUrl)
    setProfileAvatarPreviewUrl('')
    await supabase
      .from('app_state')
      .upsert(
        {
          user_id: currentUserId,
          performance,
          high_scores: highScores,
          best_streak: bestStreak,
          profile_details: profileDetails,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id' },
      )
    await refreshLeaderboard()
    await refreshHomeLeaderboards()
    setAuthSuccess('All changes saved')
    setTimeout(() => setAuthSuccess(''), 1600)
    setAuthLoading(false)
  }

  const updateAccountPassword = async () => {
    if (!supabase) return
    if (accountNewPassword.length < 6) {
      setAuthError('Password must be at least 6 characters.')
      return
    }
    if (accountNewPassword !== accountConfirmPassword) {
      setAuthError('Passwords do not match.')
      return
    }

    setAuthLoading(true)
    setAuthError('')
    setAuthSuccess('')

    const { error } = await supabase.auth.updateUser({ password: accountNewPassword })
    if (error) {
      setAuthError(error.message)
      setAuthLoading(false)
      return
    }

    setAccountNewPassword('')
    setAccountConfirmPassword('')
    setShowAccountPassword(false)
    setAuthSuccess('Password updated.')
    setTimeout(() => setAuthSuccess(''), 1600)
    setAuthLoading(false)
  }

  const linkGoogleAccount = async () => {
    if (!supabase) return
    if (currentUserProvider.toLowerCase() === 'google') {
      setAuthSuccess('Google is already linked to this account.')
      setTimeout(() => setAuthSuccess(''), 1600)
      return
    }

    setAuthLoading(true)
    setAuthError('')
    setAuthSuccess('')

    const authApi = supabase.auth as unknown as {
      linkIdentity?: (params: { provider: 'google'; options?: { redirectTo?: string } }) => Promise<{ error: { message?: string } | null }>
    }
    if (typeof authApi.linkIdentity !== 'function') {
      setAuthError('Account linking is not available in this build of Supabase auth.')
      setAuthLoading(false)
      return
    }

    const { error } = await authApi.linkIdentity({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/profile` },
    })

    if (error) {
      setAuthError(error.message || 'Could not link Google account.')
      setAuthLoading(false)
      return
    }

    setAuthSuccess('Continue with Google to finish linking your account.')
    setAuthLoading(false)
  }

  const startTierCheckout = (tier: Exclude<SupporterTier, 'free'>) => {
    const checkoutUrl = stripeTierLinks[tier]
    if (!checkoutUrl) {
      setAuthError(`Missing checkout link for ${tierLabel[tier]}. Add it in .env.`)
      return
    }
    const url = new URL(checkoutUrl)
    if (currentUserEmail) url.searchParams.set('prefilled_email', currentUserEmail)
    if (currentUserId) url.searchParams.set('client_reference_id', currentUserId)
    window.location.href = url.toString()
  }

  const signOut = async () => {
    if (!supabase) return
    setProfileMenuOpen(false)
    await supabase.auth.signOut()
    setCurrentUserId('')
    setCurrentUserEmail('')
    setCurrentUserProvider('email')
    setProfile(null)
    setForceProfileSetup(false)
    setAuthEmail('')
    setAuthPassword('')
    setAuthPasswordConfirm('')
    setShowSignInPassword(false)
    setShowSignUpPassword(false)
    setShowSignUpPasswordConfirm(false)
    setProfileAvatar(null)
    if (profileAvatarPreviewUrl) URL.revokeObjectURL(profileAvatarPreviewUrl)
    setProfileAvatarPreviewUrl('')
    if (avatarCropSourceUrl) URL.revokeObjectURL(avatarCropSourceUrl)
    setAvatarCropSourceUrl('')
    setAvatarCropSourceName('')
    setAvatarCropOpen(false)
    setAvatarCropZoom(1)
    setAvatarCropX(0)
    setAvatarCropY(0)
    setAccountNewPassword('')
    setAccountConfirmPassword('')
    setShowAccountPassword(false)
    setProfileUsername('')
    setProfileDetails({
      bio: '',
      agency: '',
      nameStyle: { ...defaultNameStyle },
      namePresets: [],
      stats: { ...defaultUserStats, gamePlays: { ...defaultUserStats.gamePlays }, studyModeCounts: { ...defaultUserStats.studyModeCounts } },
    })
    setNewPresetName('')
    setStateHydrated(false)
  }

  const resetEverything = async () => {
    if (!currentUserId) return
    const confirmed = window.confirm('Are you sure you want to reset all scores, progress, and saved study data? This cannot be undone.')
    if (!confirmed) return

    setAuthError('')
    setAuthSuccess('')
    setAuthLoading(true)

    if (supabase) {
      const [{ error: stateError }, { error: leaderboardError }] = await Promise.all([
        supabase.from('app_state').delete().eq('user_id', currentUserId),
        supabase.from('leaderboard').delete().eq('user_id', currentUserId),
      ])

      if (stateError || leaderboardError) {
        setAuthError(stateError?.message || leaderboardError?.message || 'Could not reset data.')
        setAuthLoading(false)
        return
      }
    }

    setPerformance({})
    setHighScores(gameHighScoreSeed)
    setBestStreak(0)
    setQuizDeck([])
    setCurrentQuestion(null)
    setStreak(0)
    setMatchDone(false)
    setMatchRunning(false)
    setSpeedDone(false)
    setSpeedRunning(false)
    setSpeedScore(0)
    setSpeedAnsweredCount(0)
    setMatchScore(0)
    setMatchRound(1)
    setProfileDetails((previous) => ({
      ...previous,
      namePresets: [],
      stats: { ...defaultUserStats, gamePlays: { ...defaultUserStats.gamePlays }, studyModeCounts: { ...defaultUserStats.studyModeCounts } },
    }))
    recentCodesRef.current = []
    await refreshLeaderboard()
    await refreshHomeLeaderboards()
    setAuthSuccess('All scores and progress were reset.')
    setTimeout(() => setAuthSuccess(''), 1800)
    setAuthLoading(false)
  }

  const fireLevel = streak >= 100 ? 8 : streak >= 75 ? 7 : streak >= 50 ? 6 : streak >= 40 ? 5 : streak >= 30 ? 4 : streak >= 25 ? 3 : streak >= 10 ? 2 : streak >= 5 ? 1 : 0
  const fireOption = useMemo<FireFlameOption | undefined>(() => {
    if (fireLevel === 0) return undefined
    const preset = {
      1: { particleNum: 18, particleDistance: 10 },
      2: { particleNum: 28, particleDistance: 11 },
      3: { particleNum: 40, particleDistance: 12 },
      4: { particleNum: 54, particleDistance: 13 },
      5: { particleNum: 70, particleDistance: 15 },
      6: { particleNum: 88, particleDistance: 17 },
      7: { particleNum: 108, particleDistance: 19 },
      8: { particleNum: 132, particleDistance: 21 },
    } as const
    const heights = { 1: 120, 2: 132, 3: 146, 4: 160, 5: 176, 6: 194, 7: 214, 8: 236 } as const
    const current = preset[fireLevel as keyof typeof preset]
    const height = heights[fireLevel as keyof typeof heights]
    const width = Math.max(320, quizFireWidth || 0)
    return {
      painterType: 'canvas',
      w: width,
      h: height,
      x: Math.floor(width / 2),
      y: height - 1,
      mousemove: false,
      innerColor: '#ffe0a4',
      outerColor: '#ff5a24',
      ...current,
    }
  }, [fireLevel, quizFireWidth])
  const fireParticles = useMemo(() => {
    if (fireLevel === 0) return []
    const counts = [0, 18, 30, 44, 62, 84, 108, 136, 168]
    const count = counts[fireLevel] ?? 180
    return Array.from({ length: count }, (_, index) => ({
      id: index,
      left: `${(index * 29) % 100}%`,
      size: 8 + ((index * 5 + fireLevel * 3) % 16),
      delay: `${(index % 20) * 0.045}s`,
      duration: `${0.9 + ((index * 7 + fireLevel) % 10) * 0.12}s`,
      drift: `${((index % 3) - 1) * (8 + fireLevel * 2)}px`,
    }))
  }, [fireLevel])

  const currentPath = location.pathname.toLowerCase()
  const isSignInPage = currentPath === '/signin'
  const isSignUpPage = currentPath === '/signup'
  const isHomePage = currentPath === '/home'
  const isStudyPage = currentPath === '/study'
  const isGamesPage = currentPath === '/games'
  const isScenariosPage = currentPath === '/scenarios'
  const isLibraryPage = currentPath === '/library'
  const isSupportPage = currentPath === '/support'
  const isProfilePage = currentPath === '/profile'
  const isStatsPage = currentPath === '/stats'
  const isKnownAuthedPage =
    isHomePage ||
    isStudyPage ||
    isGamesPage ||
    isScenariosPage ||
    isLibraryPage ||
    isSupportPage ||
    isProfilePage ||
    isStatsPage
  const needsProfileSetup = Boolean(authReady && currentUserId && profile && !profile.username && forceProfileSetup)

  useEffect(() => {
    if (!authReady || !currentUserId) return
    if (currentPath === '/') {
      navigate('/home', { replace: true })
      setActiveTab('home')
    }
  }, [authReady, currentUserId, currentPath, navigate])

  useEffect(() => {
    if (isHomePage) {
      setActiveTab('home')
      return
    }
    if (isStudyPage) {
      setActiveTab('study')
      return
    }
    if (isGamesPage) {
      setActiveTab('games')
      return
    }
    if (isScenariosPage) {
      setActiveTab('scenarios')
      return
    }
    if (isLibraryPage) {
      setActiveTab('library')
    }
  }, [isHomePage, isStudyPage, isGamesPage, isScenariosPage, isLibraryPage])

  const refreshSupporterTier = async () => {
    if (!supabase || !currentUserId || !profile) return
    const { data: profileRow } = await supabase
      .from('profiles')
      .select('user_id,username,avatar_path,supporter_tier,bio,agency')
      .eq('user_id', currentUserId)
      .maybeSingle()

    if (!profileRow) return
    const mapped = mapProfileRow(profileRow as Record<string, unknown>, currentUserId)
    setProfile(mapped)
  }

  const canCustomizeName = profile?.supporterTier === 'tier10'
  const activeProfileTier: SupporterTier = profile?.supporterTier || 'free'
  const activeProfileName = profile?.username || 'Officer'
  const showHomeButton = !isHomePage
  const incrementUserStats = (updater: (stats: UserStats) => UserStats) => {
    setProfileDetails((previous) => ({
      ...previous,
      stats: updater(previous.stats),
    }))
  }
  const triggerCelebration = (title: string, subtitle: string) => {
    setCelebration({ title, subtitle, burst: Date.now() })
    window.setTimeout(() => {
      setCelebration((current) => (current?.title === title ? null : current))
    }, 2200)
  }
  const avatarFor = (rawValue?: string) => {
    const value = String(rawValue || '').trim()
    return value.length > 0 ? value : defaultAvatarUrl
  }
  const handleAvatarImageError = (event: SyntheticEvent<HTMLImageElement>) => {
    const image = event.currentTarget
    const stage = image.dataset.fallbackApplied || '0'
    if (stage === '0') {
      image.dataset.fallbackApplied = '1'
      image.src = defaultAvatarUrl
      return
    }
    if (stage === '1') {
      image.dataset.fallbackApplied = '2'
      image.src = defaultAvatarPngUrl
    }
  }
  const openAvatarCropper = (file: File | null) => {
    if (!file) return
    const sourceUrl = URL.createObjectURL(file)
    if (avatarCropSourceUrl) URL.revokeObjectURL(avatarCropSourceUrl)
    setAvatarCropSourceUrl(sourceUrl)
    setAvatarCropSourceName(file.name)
    setAvatarCropZoom(1)
    setAvatarCropX(0)
    setAvatarCropY(0)
    setAvatarCropOpen(true)
  }
  const cancelAvatarCrop = () => {
    if (avatarCropSourceUrl) URL.revokeObjectURL(avatarCropSourceUrl)
    setAvatarCropSourceUrl('')
    setAvatarCropSourceName('')
    setAvatarCropOpen(false)
  }
  const applyAvatarCrop = async () => {
    if (!avatarCropSourceUrl) return
    try {
      const cropped = await createCroppedAvatarFile(avatarCropSourceUrl, avatarCropZoom, avatarCropX, avatarCropY, avatarCropSourceName)
      if (profileAvatarPreviewUrl) URL.revokeObjectURL(profileAvatarPreviewUrl)
      const previewUrl = URL.createObjectURL(cropped)
      setProfileAvatar(cropped)
      setProfileAvatarPreviewUrl(previewUrl)
      cancelAvatarCrop()
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : 'Could not crop image.')
    }
  }
  const openHomeProfile = (entry: HomeLeaderboardEntry, metric: string, isTop: boolean) => {
    setSelectedLeaderboardEntry({
      id: `home-${metric}-${entry.userId}`,
      userId: entry.userId,
      game: metric,
      playerName: entry.playerName,
      avatarUrl: entry.avatarUrl,
      supporterTier: entry.supporterTier,
      bio: entry.bio,
      agency: entry.agency,
      nameStyle: entry.nameStyle,
      isOwner: entry.isOwner,
      matchDuration: null,
      matchFilter: null,
      score: entry.value,
      round: 0,
      createdAt: Date.now(),
    })
    setSelectedLeaderboardIsTop(isTop)
  }

  useEffect(() => {
    if (!currentUserId) return
    if (activeTab !== 'study') return
    if (isProfilePage || isStatsPage || isHomePage) return
    const interval = window.setInterval(() => {
      if (document.visibilityState !== 'visible') return
      incrementUserStats((stats) => ({ ...stats, studySeconds: stats.studySeconds + 5 }))
    }, 5000)
    return () => window.clearInterval(interval)
  }, [currentUserId, activeTab, isProfilePage, isStatsPage, isHomePage])
  const saveCurrentNamePreset = () => {
    const name = newPresetName.trim()
    if (!name) return
    setProfileDetails((previous) => ({
      ...previous,
      namePresets: [{ id: crypto.randomUUID(), name: name.slice(0, 24), style: { ...previous.nameStyle } }, ...previous.namePresets].slice(0, 8),
    }))
    setNewPresetName('')
  }

  const applyNamePreset = (preset: NameStylePreset) => {
    setProfileDetails((previous) => ({ ...previous, nameStyle: { ...preset.style } }))
  }

  const deleteNamePreset = (presetId: string) => {
    setProfileDetails((previous) => ({ ...previous, namePresets: previous.namePresets.filter((preset) => preset.id !== presetId) }))
  }

  const masteredSections = useMemo(
    () =>
      sections.filter((section) => {
        const item = performance[performanceKey(section.codeSet, section.sectionNumber)]
        return Boolean(item && item.correctCount >= 10)
      }),
    [sections, performance],
  )
  const masteredWordsCount = useMemo(
    () =>
      masteredSections.reduce((total, section) => {
        const words = section.title.trim().split(/\s+/).filter(Boolean).length
        return total + words
      }, 0),
    [masteredSections],
  )
  const penalMasteredCount = useMemo(
    () => masteredSections.filter((section) => section.codeSet === 'penal').length,
    [masteredSections],
  )
  const studyHours = Math.floor(profileDetails.stats.studySeconds / 3600)
  const mostPlayedGame = useMemo(() => {
    const entries = Object.entries(profileDetails.stats.gamePlays) as Array<[keyof UserStats['gamePlays'], number]>
    return entries.sort((left, right) => right[1] - left[1])[0]
  }, [profileDetails.stats.gamePlays])
  const mostStudiedMode = useMemo(() => {
    const entries = Object.entries(profileDetails.stats.studyModeCounts) as Array<[CodeFilter, number]>
    return entries.sort((left, right) => right[1] - left[1])[0]
  }, [profileDetails.stats.studyModeCounts])

  return (
    <div className={`app-shell ${isHomePage ? 'home-page' : ''}`}>
      {!isSupabaseConfigured ? (
        <div className="onboarding-overlay">
          <div className="onboarding-card">
            <h1>LEO Study</h1>
            <p className="bad">Supabase is not configured.</p>
            <p className="muted">Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in `.env`.</p>
          </div>
        </div>
      ) : null}

      {!authReady ? (
        <div className="onboarding-overlay">
          <div className="onboarding-card">
            <p className="eyebrow">Welcome to</p>
            <h1>LEO Study</h1>
            <p className="muted">Checking session...</p>
          </div>
        </div>
      ) : null}

      {authReady && !currentUserId && isSignInPage ? (
        <div className="onboarding-overlay">
          <div className="onboarding-card">
            <p className="eyebrow">Welcome to</p>
            <h1>LEO Study</h1>
            <label>
              Email
              <input value={authEmail} onChange={(event) => setAuthEmail(event.target.value)} />
            </label>
            <label>
              Password
              <div className="password-row">
                <input
                  type={showSignInPassword ? 'text' : 'password'}
                  value={authPassword}
                  onChange={(event) => setAuthPassword(event.target.value)}
                />
                <button type="button" className="password-eye" onClick={() => setShowSignInPassword((value) => !value)} aria-label="Toggle password visibility">
                  {showSignInPassword ? (
                    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <path d="M3 3l18 18" />
                      <path d="M10.6 10.7A3 3 0 0013.3 13.4" />
                      <path d="M9.5 4.6A11.3 11.3 0 0112 4.3c6.7 0 10.5 7.7 10.5 7.7a16.9 16.9 0 01-4 5.2" />
                      <path d="M6.1 6.2A16.8 16.8 0 001.5 12s3.8 7.7 10.5 7.7a11 11 0 004.2-.8" />
                    </svg>
                  ) : (
                    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <path d="M1.5 12S5.3 4.3 12 4.3 22.5 12 22.5 12 18.7 19.7 12 19.7 1.5 12 1.5 12z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                  )}
                </button>
              </div>
            </label>
            <button className="primary" onClick={submitSignIn} disabled={authLoading}>
              Sign In
            </button>
            <button className="secondary" onClick={submitGoogle} disabled={authLoading}>
              <span className="google-mark" aria-hidden>
                <svg viewBox="0 0 24 24" width="16" height="16">
                  <path fill="#EA4335" d="M12 10.2v3.9h5.4c-.24 1.26-.96 2.33-2.04 3.04l3.3 2.56c1.92-1.77 3.03-4.38 3.03-7.49 0-.71-.06-1.4-.18-2.06H12z" />
                  <path fill="#34A853" d="M12 22c2.7 0 4.97-.9 6.63-2.44l-3.3-2.56c-.9.61-2.06.97-3.33.97-2.56 0-4.73-1.73-5.5-4.05l-3.4 2.63C4.75 19.82 8.12 22 12 22z" />
                  <path fill="#4A90E2" d="M6.5 13.92c-.2-.6-.32-1.24-.32-1.92s.12-1.32.32-1.92l-3.4-2.63A9.99 9.99 0 0 0 2 12c0 1.62.39 3.15 1.1 4.55l3.4-2.63z" />
                  <path fill="#FBBC05" d="M12 6.03c1.47 0 2.8.5 3.85 1.48l2.89-2.9C16.96 2.95 14.7 2 12 2 8.12 2 4.75 4.18 3.1 7.45l3.4 2.63c.77-2.32 2.94-4.05 5.5-4.05z" />
                </svg>
              </span>
              Continue with Google
            </button>
            <p className="muted tiny">Need an account? <Link to="/signup">Create one</Link></p>
            {authError ? <p className="bad">{authError}</p> : null}
            {authSuccess ? <p className="good">{authSuccess}</p> : null}
          </div>
        </div>
      ) : null}

      {authReady && !currentUserId && isSignUpPage ? (
        <div className="onboarding-overlay">
          <div className="onboarding-card">
            <p className="eyebrow">Create account</p>
            <h1>LEO Study</h1>
            <label>
              Email
              <input value={authEmail} onChange={(event) => setAuthEmail(event.target.value)} />
            </label>
            <label>
              Password
              <div className="password-row">
                <input
                  type={showSignUpPassword ? 'text' : 'password'}
                  value={authPassword}
                  onChange={(event) => setAuthPassword(event.target.value)}
                />
                <button type="button" className="password-eye" onClick={() => setShowSignUpPassword((value) => !value)} aria-label="Toggle password visibility">
                  {showSignUpPassword ? (
                    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <path d="M3 3l18 18" />
                      <path d="M10.6 10.7A3 3 0 0013.3 13.4" />
                      <path d="M9.5 4.6A11.3 11.3 0 0112 4.3c6.7 0 10.5 7.7 10.5 7.7a16.9 16.9 0 01-4 5.2" />
                      <path d="M6.1 6.2A16.8 16.8 0 001.5 12s3.8 7.7 10.5 7.7a11 11 0 004.2-.8" />
                    </svg>
                  ) : (
                    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <path d="M1.5 12S5.3 4.3 12 4.3 22.5 12 22.5 12 18.7 19.7 12 19.7 1.5 12 1.5 12z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                  )}
                </button>
              </div>
            </label>
            <label>
              Verify Password
              <div className="password-row">
                <input
                  type={showSignUpPasswordConfirm ? 'text' : 'password'}
                  value={authPasswordConfirm}
                  onChange={(event) => setAuthPasswordConfirm(event.target.value)}
                />
                <button
                  type="button"
                  className="password-eye"
                  onClick={() => setShowSignUpPasswordConfirm((value) => !value)}
                  aria-label="Toggle verify password visibility"
                >
                  {showSignUpPasswordConfirm ? (
                    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <path d="M3 3l18 18" />
                      <path d="M10.6 10.7A3 3 0 0013.3 13.4" />
                      <path d="M9.5 4.6A11.3 11.3 0 0112 4.3c6.7 0 10.5 7.7 10.5 7.7a16.9 16.9 0 01-4 5.2" />
                      <path d="M6.1 6.2A16.8 16.8 0 001.5 12s3.8 7.7 10.5 7.7a11 11 0 004.2-.8" />
                    </svg>
                  ) : (
                    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <path d="M1.5 12S5.3 4.3 12 4.3 22.5 12 22.5 12 18.7 19.7 12 19.7 1.5 12 1.5 12z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                  )}
                </button>
              </div>
            </label>
            {authPasswordConfirm.length > 0 && authPassword !== authPasswordConfirm ? <p className="bad">Passwords do not match.</p> : null}
            <button className="primary" onClick={submitSignUp} disabled={authLoading || authPassword.length === 0 || authPassword !== authPasswordConfirm}>
              Create Account
            </button>
            <button className="secondary" onClick={submitGoogle} disabled={authLoading}>
              <span className="google-mark" aria-hidden>
                <svg viewBox="0 0 24 24" width="16" height="16">
                  <path fill="#EA4335" d="M12 10.2v3.9h5.4c-.24 1.26-.96 2.33-2.04 3.04l3.3 2.56c1.92-1.77 3.03-4.38 3.03-7.49 0-.71-.06-1.4-.18-2.06H12z" />
                  <path fill="#34A853" d="M12 22c2.7 0 4.97-.9 6.63-2.44l-3.3-2.56c-.9.61-2.06.97-3.33.97-2.56 0-4.73-1.73-5.5-4.05l-3.4 2.63C4.75 19.82 8.12 22 12 22z" />
                  <path fill="#4A90E2" d="M6.5 13.92c-.2-.6-.32-1.24-.32-1.92s.12-1.32.32-1.92l-3.4-2.63A9.99 9.99 0 0 0 2 12c0 1.62.39 3.15 1.1 4.55l3.4-2.63z" />
                  <path fill="#FBBC05" d="M12 6.03c1.47 0 2.8.5 3.85 1.48l2.89-2.9C16.96 2.95 14.7 2 12 2 8.12 2 4.75 4.18 3.1 7.45l3.4 2.63c.77-2.32 2.94-4.05 5.5-4.05z" />
                </svg>
              </span>
              Continue with Google
            </button>
            <p className="muted tiny">Already have an account? <Link to="/signin">Sign in</Link></p>
            {authError ? <p className="bad">{authError}</p> : null}
            {authSuccess ? <p className="good">{authSuccess}</p> : null}
          </div>
        </div>
      ) : null}

      {authReady && !currentUserId && !isSignInPage && !isSignUpPage ? <Navigate to="/signup" replace /> : null}
      {authReady && currentUserId && (isSignInPage || isSignUpPage) ? <Navigate to="/home" replace /> : null}
      {authReady && currentUserId && !isKnownAuthedPage ? <Navigate to="/home" replace /> : null}
      {needsProfileSetup ? (
        <div className="onboarding-overlay">
          <div className="onboarding-card">
            <p className="eyebrow">One more step</p>
            <h1>Set up your profile</h1>
            <label>
              Username
              <input value={profileUsername} onChange={(event) => setProfileUsername(event.target.value)} />
            </label>
            <label>
              Profile picture
              <input
                type="file"
                accept="image/*"
                onChange={(event) => openAvatarCropper(event.target.files?.[0] || null)}
              />
            </label>
            <label>
              Agency (Optional)
              <input
                value={profileDetails.agency}
                onChange={(event) => setProfileDetails((previous) => ({ ...previous, agency: event.target.value }))}
              />
            </label>
            <label>
              About Me (Optional)
              <textarea
                rows={3}
                value={profileDetails.bio}
                onChange={(event) => setProfileDetails((previous) => ({ ...previous, bio: event.target.value }))}
              />
            </label>
            <button className="primary" onClick={submitProfile} disabled={authLoading || profileUsername.trim().length < 1}>
              Save Profile
            </button>
            {authError ? <p className="bad">{authError}</p> : null}
          </div>
        </div>
      ) : null}

      {authReady && currentUserId ? (
        <>
      {!isHomePage ? (
      <header className="top-header">
        <div className="header-left">
          {showHomeButton ? (
            <button
              className="secondary header-home-button"
              onClick={() => {
                setActiveTab('home')
                navigate('/home')
              }}
            >
              <AppIcon name="home" className="button-icon" />
              {isSupportPage ? 'Back' : 'Home'}
            </button>
          ) : null}
          {!isHomePage ? (
            <h1>{isProfilePage ? 'Profile' : isStatsPage ? 'Stats' : isSupportPage ? 'Support Creator' : activeTab === 'study' ? 'Study' : activeTab === 'library' ? 'Library' : activeTab === 'games' ? 'Games' : 'Scenarios'}</h1>
          ) : null}
        </div>
        {profile ? (
          <div className="profile-shortcut-wrap" ref={profileMenuRef}>
            <button className="profile-shortcut" onClick={() => setProfileMenuOpen((value) => !value)} aria-label="Open profile menu">
              <img src={avatarFor(profileAvatarPreviewUrl || profile.avatarUrl)} alt={profile.username} className="profile-shortcut-image" onError={handleAvatarImageError} />
            </button>
            <span className={`profile-shortcut-name ${displayNameClass(profile.supporterTier, true)}`} style={displayNameStyle(profileDetails.nameStyle, profile.supporterTier)}>
              {profile.username || 'Profile'}
            </span>
            {profileMenuOpen ? (
              <div className="profile-menu">
                <button
                  className="profile-menu-item"
                  onClick={() => {
                    setProfileMenuOpen(false)
                    navigate('/profile')
                  }}
                >
                  Settings
                </button>
                <button
                  className="profile-menu-item"
                  onClick={() => {
                    setProfileMenuOpen(false)
                    navigate('/stats')
                  }}
                >
                  Stats
                </button>
                <button className="profile-menu-item danger-item" onClick={signOut}>
                  Sign Out
                </button>
              </div>
            ) : null}
          </div>
        ) : null}
      </header>
      ) : null}

      <main className="content-area">
        {!isProfilePage && !isStatsPage && isHomePage && (
          <section className="home-section">
            <div className="card home-hero">
              <div className="home-hero-head">
                <div>
                  <p className="eyebrow">Welcome</p>
                  <h2 className={displayNameClass(activeProfileTier, true)} style={displayNameStyle(profileDetails.nameStyle, activeProfileTier)}>
                    {activeProfileName}
                  </h2>
                  <p className="muted">Pick your focus and keep building momentum.</p>
                </div>
                {profile ? (
                  <div className="profile-shortcut-wrap home-hero-profile" ref={profileMenuRef}>
                    <button className="profile-shortcut" onClick={() => setProfileMenuOpen((value) => !value)} aria-label="Open profile menu">
                      <img src={avatarFor(profileAvatarPreviewUrl || profile.avatarUrl)} alt={profile.username} className="profile-shortcut-image" onError={handleAvatarImageError} />
                    </button>
                    {profileMenuOpen ? (
                      <div className="profile-menu">
                        <button
                          className="profile-menu-item"
                          onClick={() => {
                            setProfileMenuOpen(false)
                            navigate('/profile')
                          }}
                        >
                          Settings
                        </button>
                        <button
                          className="profile-menu-item"
                          onClick={() => {
                            setProfileMenuOpen(false)
                            navigate('/stats')
                          }}
                        >
                          Stats
                        </button>
                        <button className="profile-menu-item danger-item" onClick={signOut}>
                          Sign Out
                        </button>
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
              <div className="home-actions">
                <button className="primary" onClick={() => { setActiveTab('study'); navigate('/study') }}>
                  <AppIcon name="study" className="button-icon" />
                  Go Study
                </button>
                <button className="secondary" onClick={() => { setActiveTab('games'); navigate('/games') }}>
                  <AppIcon name="games" className="button-icon" />
                  Play Games
                </button>
                <button className="secondary" onClick={() => { setActiveTab('scenarios'); navigate('/scenarios') }}>
                  <AppIcon name="scenarios" className="button-icon" />
                  Run Scenarios
                </button>
                <button className="secondary" onClick={() => navigate('/support')}>
                  <AppIcon name="support" className="button-icon" />
                  Support Creator
                </button>
              </div>
            </div>

            <div className="home-leaderboard-grid">
              <div className="card">
                <h3>Most Study Hours</h3>
                {homeStudyTimeLeaders.length === 0 ? <p className="muted">No data yet.</p> : homeStudyTimeLeaders.map((entry, index) => (
                  <button
                    key={`home-hours-${entry.userId}-${index}`}
                    type="button"
                    className="leader-row leader-row-button"
                    onClick={() => openHomeProfile(entry, 'Study Hours', index === 0)}
                  >
                    <span>#{index + 1}</span>
                    <span className="leader-player">
                      <span className="leader-avatar-wrap">
                        {index === 0 ? <span className="leader-crown" aria-label="Top Player">👑</span> : null}
                        <span className="leader-avatar-frame">
                          <img src={avatarFor(entry.avatarUrl)} alt={entry.playerName} className="leader-avatar" onError={handleAvatarImageError} />
                        </span>
                      </span>
                      <span className={displayNameClass(entry.supporterTier, true)} style={displayNameStyle(entry.nameStyle, entry.supporterTier)}>
                        {entry.playerName}
                      </span>
                    </span>
                    <span>Study</span>
                    <span>{formatStudyTime(entry.value)}</span>
                  </button>
                ))}
              </div>

              <div className="card">
                <div className="card-menu-head">
                  <h3>Best Matching Score</h3>
                  <button className="icon-menu-button" onClick={() => setHomeMatchingConfigOpen((value) => !value)} aria-label="Configure matching leaderboard">⋯</button>
                </div>
                {homeMatchingConfigOpen ? (
                  <div className="home-score-config">
                    <label>Time</label>
                    <div className="mini-chip-row">
                      {(['all', 15, 30, 60] as DurationFilter[]).map((value) => (
                        <button
                          key={`home-match-time-${value}`}
                          className={homeMatchingDurationFilter === value ? 'chip chip-active' : 'chip'}
                          onClick={() => setHomeMatchingDurationFilter(value)}
                        >
                          {value === 'all' ? 'All' : `${value}s`}
                        </button>
                      ))}
                    </div>
                    <label>Code Set</label>
                    <div className="mini-chip-row">
                      {(['all', 'penal', 'hs', 'vehicle'] as CodeFilter[]).map((value) => (
                        <button
                          key={`home-match-code-${value}`}
                          className={homeMatchingCodeFilter === value ? 'chip chip-active' : 'chip'}
                          onClick={() => setHomeMatchingCodeFilter(value)}
                        >
                          {value === 'all' ? 'All' : codeSetLabel[value]}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}
                {homeMatchingLeaders.length === 0 ? <p className="muted">No scores yet.</p> : homeMatchingLeaders.map((entry, index) => (
                  <button
                    key={`home-match-${entry.id}`}
                    type="button"
                    className="leader-row leader-row-button"
                    onClick={() => {
                      setSelectedLeaderboardEntry(entry)
                      setSelectedLeaderboardIsTop(index === 0)
                    }}
                  >
                    <span>#{index + 1}</span>
                    <span className="leader-player">
                      <span className="leader-avatar-wrap">
                        {index === 0 ? <span className="leader-crown" aria-label="Top Player">👑</span> : null}
                        <span className="leader-avatar-frame">
                          <img src={avatarFor(entry.avatarUrl)} alt={entry.playerName} className="leader-avatar" onError={handleAvatarImageError} />
                        </span>
                      </span>
                      <span className={displayNameClass(entry.supporterTier, true)} style={displayNameStyle(entry.nameStyle, entry.supporterTier)}>
                        {entry.playerName}
                      </span>
                    </span>
                    <span>Matching</span>
                    <span>{entry.score}</span>
                  </button>
                ))}
              </div>

              <div className="card">
                <div className="card-menu-head">
                  <h3>Best Speed Test Score</h3>
                  <button className="icon-menu-button" onClick={() => setHomeSpeedConfigOpen((value) => !value)} aria-label="Configure speed leaderboard">⋯</button>
                </div>
                {homeSpeedConfigOpen ? (
                  <div className="home-score-config">
                    <label>Time</label>
                    <div className="mini-chip-row">
                      {(['all', 15, 30, 60] as DurationFilter[]).map((value) => (
                        <button
                          key={`home-speed-time-${value}`}
                          className={homeSpeedDurationFilter === value ? 'chip chip-active' : 'chip'}
                          onClick={() => setHomeSpeedDurationFilter(value)}
                        >
                          {value === 'all' ? 'All' : `${value}s`}
                        </button>
                      ))}
                    </div>
                    <label>Code Set</label>
                    <div className="mini-chip-row">
                      {(['all', 'penal', 'hs', 'vehicle'] as CodeFilter[]).map((value) => (
                        <button
                          key={`home-speed-code-${value}`}
                          className={homeSpeedCodeFilter === value ? 'chip chip-active' : 'chip'}
                          onClick={() => setHomeSpeedCodeFilter(value)}
                        >
                          {value === 'all' ? 'All' : codeSetLabel[value]}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}
                {homeSpeedLeaders.length === 0 ? <p className="muted">No scores yet.</p> : homeSpeedLeaders.map((entry, index) => (
                  <button
                    key={`home-speed-${entry.id}`}
                    type="button"
                    className="leader-row leader-row-button"
                    onClick={() => {
                      setSelectedLeaderboardEntry(entry)
                      setSelectedLeaderboardIsTop(index === 0)
                    }}
                  >
                    <span>#{index + 1}</span>
                    <span className="leader-player">
                      <span className="leader-avatar-wrap">
                        {index === 0 ? <span className="leader-crown" aria-label="Top Player">👑</span> : null}
                        <span className="leader-avatar-frame">
                          <img src={avatarFor(entry.avatarUrl)} alt={entry.playerName} className="leader-avatar" onError={handleAvatarImageError} />
                        </span>
                      </span>
                      <span className={displayNameClass(entry.supporterTier, true)} style={displayNameStyle(entry.nameStyle, entry.supporterTier)}>
                        {entry.playerName}
                      </span>
                    </span>
                    <span>Speed</span>
                    <span>{entry.score}</span>
                  </button>
                ))}
              </div>

              <div className="card">
                <h3>Most Mastered Codes</h3>
                {homeMostMasteredLeaders.length === 0 ? <p className="muted">No data yet.</p> : homeMostMasteredLeaders.map((entry, index) => (
                  <button
                    key={`home-mastered-${entry.userId}-${index}`}
                    type="button"
                    className="leader-row leader-row-button"
                    onClick={() => openHomeProfile(entry, 'Mastered Codes', index === 0)}
                  >
                    <span>#{index + 1}</span>
                    <span className="leader-player">
                      <span className="leader-avatar-wrap">
                        {index === 0 ? <span className="leader-crown" aria-label="Top Player">👑</span> : null}
                        <span className="leader-avatar-frame">
                          <img src={avatarFor(entry.avatarUrl)} alt={entry.playerName} className="leader-avatar" onError={handleAvatarImageError} />
                        </span>
                      </span>
                      <span className={displayNameClass(entry.supporterTier, true)} style={displayNameStyle(entry.nameStyle, entry.supporterTier)}>
                        {entry.playerName}
                      </span>
                    </span>
                    <span>Codes</span>
                    <span>{entry.value}</span>
                  </button>
                ))}
              </div>
            </div>
          </section>
        )}

        {!isProfilePage && !isStatsPage && isSupportPage && profile ? (
          <section className="support-section">
            <div className="card support-intro">
              <p className="eyebrow">Support LEO Study</p>
              <h2>Choose a Supporter Tier</h2>
              <p className="muted">Support helps us keep building features, question banks, and new training tools.</p>
              <p className="muted">Current tier: {tierLabel[activeProfileTier]}</p>
            </div>

            <div className="support-grid">
              <article className={tierRank(activeProfileTier) >= tierRank('tier2') ? 'card support-card tier-locked' : 'card support-card'}>
                <h3>$2 Supporter</h3>
                <ul>
                  <li>Support the project and roadmap</li>
                  <li>Supporter badge on your account</li>
                  <li>More perks planned soon</li>
                </ul>
                <button className="primary" onClick={() => startTierCheckout('tier2')} disabled={tierRank(activeProfileTier) >= tierRank('tier2')}>
                  {tierRank(activeProfileTier) >= tierRank('tier2') ? 'Included' : 'Upgrade'}
                </button>
              </article>

              <article className={tierRank(activeProfileTier) >= tierRank('tier5') ? 'card support-card tier-locked' : 'card support-card'}>
                <h3>$5 Supporter+</h3>
                <ul>
                  <li>Everything in $2 tier</li>
                  <li>Priority access to upcoming features</li>
                  <li>More perks planned soon</li>
                </ul>
                <button className="primary" onClick={() => startTierCheckout('tier5')} disabled={tierRank(activeProfileTier) >= tierRank('tier5')}>
                  {tierRank(activeProfileTier) >= tierRank('tier5') ? 'Included' : 'Upgrade'}
                </button>
              </article>

              <article className={tierRank(activeProfileTier) >= tierRank('tier10') ? 'card support-card tier-locked' : 'card support-card'}>
                <h3>$10 Pro Supporter</h3>
                <ul>
                  <li>Everything in $2 and $5 tiers</li>
                  <li>Name customization (color, font, glow)</li>
                  <li>More perks planned soon</li>
                </ul>
                <button className="primary" onClick={() => startTierCheckout('tier10')} disabled={tierRank(activeProfileTier) >= tierRank('tier10')}>
                  {tierRank(activeProfileTier) >= tierRank('tier10') ? 'Current Tier' : 'Upgrade'}
                </button>
              </article>
            </div>
          </section>
        ) : null}

        {!isProfilePage && !isStatsPage && !isHomePage && !isSupportPage && isLibraryPage && (
          <section>
            <div className="segmented">
              {(['penal', 'hs', 'vehicle'] as CodeSet[]).map((filter) => (
                <button
                  key={filter}
                  className={libraryFilter === filter ? 'seg active' : 'seg'}
                  onClick={() => setLibraryFilter(filter)}
                >
                  {codeSetLabel[filter]}
                </button>
              ))}
            </div>
            <div className="list">
              {filteredSections.map((section) => {
                const status = mastery(performance[performanceKey(section.codeSet, section.sectionNumber)])
                return (
                  <article key={section.id} className="section-row">
                    <div>
                      <h3>{section.sectionNumber}</h3>
                      <p>{section.title}</p>
                    </div>
                    {status ? <span className={`badge ${status === 'Mastered' ? 'badge-mastered' : 'badge-work'}`}>{status}</span> : null}
                  </article>
                )
              })}
            </div>
          </section>
        )}

        {!isProfilePage && !isStatsPage && !isHomePage && !isSupportPage && isStudyPage && (
          <section className="study-section">
            <div className="segmented">
              {(['all', 'penal', 'hs', 'vehicle'] as CodeFilter[]).map((filter) => (
                <button key={filter} className={studyFilter === filter ? 'seg active' : 'seg'} onClick={() => setStudyFilter(filter)}>
                  {filter === 'all' ? 'All' : codeSetLabel[filter]}
                </button>
              ))}
            </div>
            <p className="muted stats">{(studyFilter === 'all' ? sections : sections.filter((item) => item.codeSet === studyFilter)).length} flashcards</p>

            <h2>Quick Quiz</h2>
            <div className="quiz-wrap">
              <div className={`quiz-fire-host level-${fireLevel}`} ref={quizFireHostRef} aria-hidden>
                {fireOption ? (
                  <FireFlame key={`quiz-fire-${fireLevel}-${quizFireWidth}`} option={fireOption} />
                ) : (
                  <div className="quiz-fire-anchor-line" />
                )}
                {fireLevel > 0 ? (
                  <div className="quiz-fire-particles">
                    {fireParticles.map((particle) => (
                      <span
                        key={`quiz-fire-particle-${particle.id}`}
                        className="quiz-fire-particle"
                        style={{
                          left: particle.left,
                          width: `${particle.size}px`,
                          height: `${Math.round(particle.size * 1.5)}px`,
                          animationDelay: particle.delay,
                          animationDuration: particle.duration,
                          ['--particle-drift' as string]: particle.drift,
                        }}
                      />
                    ))}
                  </div>
                ) : null}
              </div>
              {fireLevel > 0 ? (
                <div className="quiz-fire-line-glow" aria-hidden />
              ) : null}
              <div className="card quiz-card">
                <div className="quiz-top">
                  <span>Best: {bestStreak}</span>
                  <span>Streak: {streak}</span>
                </div>
                {!currentQuestion ? (
                  <p>No questions available.</p>
                ) : (
                  <>
                    <h3>{currentQuestion.prompt}</h3>
                    <div className="choices">
                      {currentQuestion.choices.map((choice, index) => {
                        const chosen = selectedChoice === index
                        const correct = selectedChoice !== null && index === currentQuestion.correctIndex
                        return (
                          <button
                            key={`${choice}-${index}`}
                            className={`choice ${chosen ? 'choice-selected' : ''} ${correct ? 'choice-correct' : ''}`}
                            onClick={() => answerQuestion(index)}
                          >
                            {choice}
                          </button>
                        )
                      })}
                    </div>
                    {selectedChoice !== null ? (
                      <>
                        <p className={feedback.startsWith('Correct') ? 'good' : 'bad'}>{feedback}</p>
                        <p className="muted">{currentQuestion.explanation}</p>
                        <button className="primary" onClick={() => setNextQuizQuestion()}>
                          Next Question
                        </button>
                      </>
                    ) : null}
                  </>
                )}
              </div>
            </div>

            <h2>Flashcards</h2>
            <div className="card flashcard-block">
              {filteredFlashcards.length === 0 ? (
                <p>No flashcards.</p>
              ) : (
                <>
                  <button className={flipped ? 'flashcard flipped' : 'flashcard'} onClick={() => setFlipped((value) => !value)}>
                    <div className="face front">{orderedFlashcards[flashcardIndex]?.front}</div>
                    <div className="face back">{orderedFlashcards[flashcardIndex]?.back}</div>
                  </button>
                  <div className="actions-row flashcard-nav">
                <button
                  className="secondary flashcard-nav-btn"
                  onClick={() => {
                    setFlipped(false)
                    setFlashcardIndex((current) => (current === 0 ? orderedFlashcards.length - 1 : current - 1))
                    incrementUserStats((stats) => ({ ...stats, flashcardsReviewed: stats.flashcardsReviewed + 1 }))
                  }}
                >
                  Previous
                </button>
                <button
                  className="secondary flashcard-nav-btn"
                  onClick={() => {
                    setFlipped(false)
                    setFlashcardIndex((current) => {
                      if (current < orderedFlashcards.length - 1) return current + 1
                      const lastCardId = orderedFlashcards[current]?.id
                      let reshuffled = shuffle(filteredFlashcards.map((card) => card.id))
                      if (reshuffled.length > 1 && reshuffled[0] === lastCardId) {
                        ;[reshuffled[0], reshuffled[1]] = [reshuffled[1], reshuffled[0]]
                      }
                      setFlashcardOrder(reshuffled)
                      return 0
                    })
                    incrementUserStats((stats) => ({ ...stats, flashcardsReviewed: stats.flashcardsReviewed + 1 }))
                  }}
                >
                  Next
                </button>
                  </div>
                </>
              )}
            </div>
          </section>
        )}

        {!isProfilePage && !isStatsPage && !isHomePage && !isSupportPage && isGamesPage && (
          <section className="games-section">
            <div className="game-scores">
              <button
                type="button"
                className={gamesMode === 'matching' ? 'card compact game-mode-card game-mode-active' : 'card compact game-mode-card'}
                onClick={() => setGamesMode('matching')}
              >
                <span className="game-mode-title"><AppIcon name="games" className="button-icon" /> Matching</span>
                <span className="muted tiny">Match code sections fast</span>
              </button>
              <button
                type="button"
                className={gamesMode === 'speed' ? 'card compact game-mode-card game-mode-active' : 'card compact game-mode-card'}
                onClick={() => setGamesMode('speed')}
              >
                <span className="game-mode-title"><AppIcon name="study" className="button-icon" /> Speed Test</span>
                <span className="muted tiny">Answer as many as possible</span>
              </button>
              <article className="card compact muted-box">Gravity (Disabled)</article>
            </div>

            {gamesMode === 'matching' ? (
              <>
            <h2>Matching</h2>
            {!matchRunning && !matchDone ? (
              <div className="card game-launch-card">
                <button className="primary game-start-button" onClick={() => setShowMatchSetupModal(true)}>
                  <AppIcon name="games" className="button-icon" />
                  Start Matching
                </button>
              </div>
            ) : null}

            {(matchRunning || matchDone) ? (
              <div className="match-session-overlay">
                <div className={matchDone && !matchRunning ? 'match-session-shell match-session-shell-done' : 'match-session-shell'}>
                  {matchRunning ? (
                    <>
                  <div className="match-session-top">
                    <span>Time: {matchRemaining}s</span>
                    <span>Round: {matchRound}</span>
                    <span>Score: {matchScore}</span>
                  </div>
                  <div className="match-session-controls">
                    <button
                      className="secondary match-exit-button"
                      onClick={() => {
                        const confirmed = window.confirm('Exit current matching game? This round will end.')
                        if (confirmed) exitMatchingSession()
                      }}
                    >
                      Exit Match
                    </button>
                  </div>
                    </>
                  ) : null}
                  {matchRunning ? (
                    <div className="match-grid match-grid-session">
                      {matchCards.map((card) => {
                        const selected = selectedCards.includes(card.id)
                        const matched = matchedPairIds.includes(card.pairId)
                        return (
                          <button
                            key={card.id}
                            className={`match-card ${selected ? 'match-selected' : ''} ${matched ? 'match-done' : ''} ${wrongCardIds.includes(card.id) ? 'match-wrong' : ''}`}
                            disabled={matched || selected || selectedCards.length >= 2}
                            onClick={() => setSelectedCards((previous) => [...previous, card.id])}
                          >
                            <small>{card.kind === 'code' ? 'Penal code' : 'Definition'}</small>
                            <strong>{card.text}</strong>
                          </button>
                        )
                      })}
                    </div>
                  ) : null}
                  {matchDone && !matchRunning ? (
                    <div className="card session-card">
                      <h3>Session Complete</h3>
                      <div className="match-session-top match-session-top-finished">
                        <span>Time: {matchRemaining}s</span>
                        <span>Round: {matchRound}</span>
                        <span>Score: {matchScore}</span>
                      </div>
                      <p>Your score: {matchScore}</p>
                      <p>High score: {Math.max(highScores.matching, matchScore)}</p>
                      <p>Round reached: {matchRound}</p>
                      <div className="actions-row">
                        <button className="primary" onClick={startMatching}>
                          Retry
                        </button>
                        <button className="secondary" onClick={exitMatchingSession}>
                          Exit
                        </button>
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>
            ) : null}

            {!matchRunning && !matchDone ? (
            <>
            <h2>Matching Leaderboard</h2>
            <div className="card">
              {leaderboardError ? <p className="bad">{leaderboardError}</p> : null}
              <label>
                Time
                <div className="segmented">
                  {[15, 30, 60].map((duration) => (
                    <button
                      key={duration}
                      className={leaderboardDurationFilter === duration ? 'seg active' : 'seg'}
                      onClick={() => setLeaderboardDurationFilter(duration)}
                    >
                      {duration}s
                    </button>
                  ))}
                </div>
              </label>
              <label>
                Code Set
                <div className="segmented">
                  {(['all', 'penal', 'hs', 'vehicle'] as CodeFilter[]).map((filter) => (
                    <button
                      key={filter}
                      className={leaderboardCodeFilter === filter ? 'seg active' : 'seg'}
                      onClick={() => setLeaderboardCodeFilter(filter)}
                    >
                      {filter === 'all' ? 'All' : codeSetLabel[filter]}
                    </button>
                  ))}
                </div>
              </label>
              {matchingLeaderboard.length === 0 ? (
                <p className="muted">No scores submitted yet.</p>
              ) : (
                matchingLeaderboard.map((entry, index) => (
                  <button
                    key={entry.id}
                    type="button"
                    className="leader-row leader-row-button game-leader-row"
                    onClick={() => {
                      setSelectedLeaderboardEntry(entry)
                      setSelectedLeaderboardIsTop(index === 0)
                    }}
                  >
                    <span>#{index + 1}</span>
                    <span className="leader-player">
                      <span className="leader-avatar-wrap">
                        {index === 0 ? <span className="leader-crown" aria-label="Top Player">👑</span> : null}
                        <span className="leader-avatar-frame">
                          <img src={avatarFor(entry.avatarUrl)} alt={entry.playerName} className="leader-avatar" onError={handleAvatarImageError} />
                        </span>
                      </span>
                      <span className={displayNameClass(entry.supporterTier, true)} style={displayNameStyle(entry.nameStyle, entry.supporterTier)}>
                        {entry.playerName}
                      </span>
                    </span>
                    <span>{entry.score}</span>
                  </button>
                ))
              )}
            </div>
            </>
            ) : null}
              </>
            ) : null}

            {gamesMode === 'speed' ? (
              <>
            <h2>Speed Test</h2>
            {!speedRunning && !speedDone ? (
              <div className="card game-launch-card">
                <button className="primary game-start-button" onClick={() => setShowSpeedSetupModal(true)} disabled={speedQuestionBank.length === 0}>
                  <AppIcon name="study" className="button-icon" />
                  Start Speed Test
                </button>
                {speedQuestionBank.length === 0 ? <p className="muted">No speed test questions loaded.</p> : null}
              </div>
            ) : null}

            {(speedRunning || speedDone) ? (
              <div className="speed-session-overlay">
                <div className={speedDone && !speedRunning ? 'speed-session-shell speed-session-shell-done' : 'speed-session-shell'}>
                  {speedRunning ? (
                    <>
                      <div className="speed-session-controls">
                        <button
                          className="secondary speed-exit-button"
                          onClick={() => {
                            const confirmed = window.confirm('Exit current speed test? This session will end.')
                            if (confirmed) exitSpeedSession()
                          }}
                        >
                          Exit Test
                        </button>
                      </div>
                      <div className="speed-session-top">
                        <span>Time: {speedRemaining}s</span>
                        <span>Score: {speedScore}</span>
                        <span>Answered: {speedAnsweredCount}</span>
                      </div>
                    </>
                  ) : null}
                  {speedRunning && speedCurrentQuestion ? (
                    <div className="card quiz-card speed-session-card">
                      <h3>{speedCurrentQuestion.prompt}</h3>
                      <div className="choices">
                        {speedCurrentQuestion.choices.map((choice, index) => (
                          <button
                            key={`speed-choice-${speedCurrentQuestion.id}-${index}`}
                            className="choice"
                            onClick={() => answerSpeedQuestion(index)}
                          >
                            {choice}
                          </button>
                        ))}
                      </div>
                      {speedFeedback ? <p className={speedFeedback.startsWith('Correct') ? 'good' : 'bad'}>{speedFeedback}</p> : null}
                    </div>
                  ) : null}

                  {speedDone && !speedRunning ? (
                    <div className="card session-card">
                      <h3>Session Complete</h3>
                      <div className="speed-session-top speed-session-top-finished">
                        <span>Time: {speedRemaining}s</span>
                        <span>Score: {speedScore}</span>
                        <span>Answered: {speedAnsweredCount}</span>
                      </div>
                      <p>Your score: {speedScore}</p>
                      <p>Questions answered: {speedAnsweredCount}</p>
                      <div className="actions-row">
                        <button className="primary" onClick={startSpeedTest}>Replay</button>
                        <button className="secondary" onClick={exitSpeedSession}>Exit</button>
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>
            ) : null}

            {!speedRunning && !speedDone ? (
            <>
            <h2>Speed Test Leaderboard</h2>
            <div className="card">
              {leaderboardError ? <p className="bad">{leaderboardError}</p> : null}
              <label>
                Time
                <div className="segmented">
                  {[15, 30, 60].map((duration) => (
                    <button
                      key={`speed-leader-time-${duration}`}
                      className={speedLeaderboardDurationFilter === duration ? 'seg active' : 'seg'}
                      onClick={() => setSpeedLeaderboardDurationFilter(duration)}
                    >
                      {duration}s
                    </button>
                  ))}
                </div>
              </label>
              <label>
                Code Set
                <div className="segmented">
                  {(['all', 'penal', 'hs', 'vehicle'] as CodeFilter[]).map((filter) => (
                    <button
                      key={`speed-leader-filter-${filter}`}
                      className={speedLeaderboardCodeFilter === filter ? 'seg active' : 'seg'}
                      onClick={() => setSpeedLeaderboardCodeFilter(filter)}
                    >
                      {filter === 'all' ? 'All' : codeSetLabel[filter]}
                    </button>
                  ))}
                </div>
              </label>
              {speedLeaderboard.length === 0 ? (
                <p className="muted">No speed test scores submitted yet.</p>
              ) : (
                speedLeaderboard.map((entry, index) => (
                  <button
                    key={`speed-${entry.id}`}
                    type="button"
                    className="leader-row leader-row-button game-leader-row"
                    onClick={() => {
                      setSelectedLeaderboardEntry(entry)
                      setSelectedLeaderboardIsTop(index === 0)
                    }}
                  >
                    <span>#{index + 1}</span>
                    <span className="leader-player">
                      <span className="leader-avatar-wrap">
                        {index === 0 ? <span className="leader-crown" aria-label="Top Player">👑</span> : null}
                        <span className="leader-avatar-frame">
                          <img src={avatarFor(entry.avatarUrl)} alt={entry.playerName} className="leader-avatar" onError={handleAvatarImageError} />
                        </span>
                      </span>
                      <span className={displayNameClass(entry.supporterTier, true)} style={displayNameStyle(entry.nameStyle, entry.supporterTier)}>
                        {entry.playerName}
                      </span>
                    </span>
                    <span>{entry.score}</span>
                  </button>
                ))
              )}
            </div>
            </>
            ) : null}
              </>
            ) : null}
          </section>
        )}

        {!isProfilePage && !isStatsPage && !isHomePage && !isSupportPage && isScenariosPage && (
          <section>
            <h2>Scenario Drills</h2>
            <div className="card">
              {scenarioCurrentQuestion ? (
                <>
                  <h3>{scenarioCurrentQuestion.prompt}</h3>
                  <div className="actions-row scenario-actions">
                    {scenarioCurrentQuestion.choices.map((choice, index) => (
                      <button
                        key={`scenario-choice-${scenarioCurrentQuestion.id}-${index}`}
                        className={index === 0 ? 'primary scenario-answer-btn' : 'secondary scenario-answer-btn'}
                        onClick={() => answerScenario(index)}
                        disabled={Boolean(scenarioResult)}
                      >
                        {choice}
                      </button>
                    ))}
                  </div>
                  {scenarioResult ? <p className={scenarioResult.startsWith('Correct') ? 'good' : 'bad'}>{scenarioResult}</p> : null}
                  {scenarioResult ? (
                    <div className="card compact">
                      <p><strong>Answer:</strong> {scenarioCurrentQuestion.choices[scenarioCurrentQuestion.correctIndex]}</p>
                      <p className="muted">{scenarioCurrentQuestion.explanation}</p>
                    </div>
                  ) : null}
                  <button className="secondary scenario-next" onClick={() => nextScenarioQuestion(undefined, scenarioCurrentQuestion.id)}>
                    Next Scenario
                  </button>
                </>
              ) : (
                <p className="muted">No scenario questions loaded.</p>
              )}
            </div>
          </section>
        )}

        {isStatsPage && profile ? (
          <section>
            <div className="card profile-page-card">
              <h3>Study Stats</h3>
              <p><strong>Total study time:</strong> {studyHours} hour{studyHours === 1 ? '' : 's'}</p>
              <p><strong>Words mastered:</strong> {masteredWordsCount}</p>
              <p><strong>Penal codes mastered:</strong> {penalMasteredCount}</p>
              <p><strong>Flashcards reviewed:</strong> {profileDetails.stats.flashcardsReviewed}</p>
              <p><strong>Scenarios completed:</strong> {profileDetails.stats.scenariosReviewed}</p>
              <p>
                <strong>Most played game:</strong>{' '}
                {mostPlayedGame && mostPlayedGame[1] > 0 ? `${mostPlayedGame[0] === 'speed' ? 'Speed Test' : 'Matching'} (${mostPlayedGame[1]} plays)` : 'No games yet'}
              </p>
              <p>
                <strong>Most studied set:</strong>{' '}
                {mostStudiedMode && mostStudiedMode[1] > 0
                  ? `${mostStudiedMode[0] === 'all' ? 'All' : codeSetLabel[mostStudiedMode[0] as CodeSet]} (${mostStudiedMode[1]} quiz answers)`
                  : 'No study data yet'}
              </p>
            </div>
          </section>
        ) : null}

        {isProfilePage && profile && (
          <section>
            <div className="card profile-page-card">
              <div className="avatar-frame">
                <img src={avatarFor(profileAvatarPreviewUrl || profile.avatarUrl)} alt={profile.username} className="avatar" onError={handleAvatarImageError} />
              </div>
              <label>
                Username
                <input value={profileUsername} onChange={(event) => setProfileUsername(event.target.value)} />
              </label>
              <label>
                Profile picture
                <input
                  type="file"
                  accept="image/*"
                  onChange={(event) => openAvatarCropper(event.target.files?.[0] || null)}
                />
              </label>
              <label>
                About me
                <textarea
                  rows={4}
                  value={profileDetails.bio}
                  onChange={(event) => setProfileDetails((previous) => ({ ...previous, bio: event.target.value }))}
                />
              </label>
              <label>
                Agency
                <input
                  value={profileDetails.agency}
                  onChange={(event) => setProfileDetails((previous) => ({ ...previous, agency: event.target.value }))}
                />
              </label>
              <h3>Name Customization</h3>
              {canCustomizeName ? (
                <div className="card compact">
                  <label>Name color</label>
                  <div className="name-color-controls">
                    <input
                      className="name-color-picker"
                      type="color"
                      value={profileDetails.nameStyle.color}
                      onChange={(event) =>
                        setProfileDetails((previous) => ({
                          ...previous,
                          nameStyle: { ...previous.nameStyle, color: event.target.value },
                        }))
                      }
                    />
                    <div className="name-color-swatches">
                      {nameColorPalette.map((color) => (
                        <button
                          key={color}
                          type="button"
                          className={profileDetails.nameStyle.color === color ? 'color-swatch active' : 'color-swatch'}
                          style={{ background: color }}
                          onClick={() =>
                            setProfileDetails((previous) => ({
                              ...previous,
                              nameStyle: { ...previous.nameStyle, color },
                            }))
                          }
                          aria-label={`Use ${color}`}
                        />
                      ))}
                    </div>
                  </div>
                  <label>
                    Font
                    <select
                      value={profileDetails.nameStyle.fontFamily}
                      onChange={(event) =>
                        setProfileDetails((previous) => ({
                          ...previous,
                          nameStyle: { ...previous.nameStyle, fontFamily: event.target.value },
                        }))
                      }
                    >
                      {profileFontOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="actions-row">
                    <button
                      className={profileDetails.nameStyle.fontWeight === 700 ? 'primary' : 'secondary'}
                      onClick={() =>
                        setProfileDetails((previous) => ({
                          ...previous,
                          nameStyle: { ...previous.nameStyle, fontWeight: previous.nameStyle.fontWeight === 700 ? 600 : 700 },
                        }))
                      }
                    >
                      Bold
                    </button>
                    <button
                      className={profileDetails.nameStyle.fontStyle === 'italic' ? 'primary' : 'secondary'}
                      onClick={() =>
                        setProfileDetails((previous) => ({
                          ...previous,
                          nameStyle: { ...previous.nameStyle, fontStyle: previous.nameStyle.fontStyle === 'italic' ? 'normal' : 'italic' },
                        }))
                      }
                    >
                      Italic
                    </button>
                  </div>
                  <label className="switch-row">
                    <input
                      type="checkbox"
                      checked={profileDetails.nameStyle.glowEnabled}
                      onChange={(event) =>
                        setProfileDetails((previous) => ({
                          ...previous,
                          nameStyle: { ...previous.nameStyle, glowEnabled: event.target.checked },
                        }))
                      }
                    />
                    Glow enabled
                  </label>
                  <label>
                    Glow intensity: {profileDetails.nameStyle.glowIntensity}
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={profileDetails.nameStyle.glowIntensity}
                      onChange={(event) =>
                        setProfileDetails((previous) => ({
                          ...previous,
                          nameStyle: { ...previous.nameStyle, glowIntensity: Number(event.target.value) },
                        }))
                      }
                    />
                  </label>
                  <label>
                    Preset name
                    <div className="preset-row">
                      <input
                        value={newPresetName}
                        placeholder="Ex: Neon Blue"
                        onChange={(event) => setNewPresetName(event.target.value)}
                      />
                      <button className="secondary" type="button" onClick={saveCurrentNamePreset} disabled={newPresetName.trim().length === 0}>
                        Save Preset
                      </button>
                    </div>
                  </label>
                  {profileDetails.namePresets.length > 0 ? (
                    <div className="preset-list">
                      {profileDetails.namePresets.map((preset) => (
                        <div key={preset.id} className="preset-pill">
                          <button type="button" className="secondary" onClick={() => applyNamePreset(preset)}>
                            {preset.name}
                          </button>
                          <button type="button" className="danger" onClick={() => deleteNamePreset(preset.id)}>
                            ✕
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : null}
                  <p className="muted">
                    Preview:{' '}
                    <span
                      className="tier-name"
                      style={displayNameStyle(profileDetails.nameStyle, profile.supporterTier)}
                    >
                      {profileUsername.trim() || profile.username || 'Your Name'}
                    </span>
                  </p>
                </div>
              ) : (
                <p className="muted">Name customization is unlocked for $10 Pro Supporter.</p>
              )}
              {authSuccess ? <p className="saved-pill">{authSuccess}</p> : null}
              {authError ? <p className="bad">{authError}</p> : null}
              <h3>Support Tier</h3>
              <div className="tier-upgrade-grid">
                {(['tier2', 'tier5', 'tier10'] as Exclude<SupporterTier, 'free'>[]).map((tier) => (
                  <div
                    key={tier}
                    className={tierRank(profile.supporterTier) >= tierRank(tier) ? 'tier-upgrade-card tier-locked' : 'tier-upgrade-card'}
                  >
                    <p className="tier-upgrade-title">{tierLabel[tier]}</p>
                    <button
                      className="primary"
                      onClick={() => startTierCheckout(tier)}
                      disabled={tierRank(profile.supporterTier) >= tierRank(tier)}
                    >
                      {tierRank(profile.supporterTier) > tierRank(tier)
                        ? 'Included'
                        : tierRank(profile.supporterTier) === tierRank(tier)
                          ? 'Current Tier'
                          : 'Upgrade with Stripe'}
                    </button>
                  </div>
                ))}
              </div>
              <p className="muted">Current tier: {tierLabel[profile.supporterTier]}</p>
              <p className="muted">Email: {currentUserEmail || 'Unknown'}</p>
              <h3>Account Security</h3>
              <button className="secondary" onClick={linkGoogleAccount} disabled={authLoading || currentUserProvider.toLowerCase() === 'google'}>
                {currentUserProvider.toLowerCase() === 'google' ? 'Google Linked' : 'Link Google Account'}
              </button>
              <label>
                New password
                <div className="password-row">
                  <input
                    type={showAccountPassword ? 'text' : 'password'}
                    value={accountNewPassword}
                    onChange={(event) => setAccountNewPassword(event.target.value)}
                  />
                  <button type="button" className="password-eye" onClick={() => setShowAccountPassword((value) => !value)} aria-label="Toggle new password visibility">
                    {showAccountPassword ? (
                      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                        <path d="M3 3l18 18" />
                        <path d="M10.6 10.7A3 3 0 0013.3 13.4" />
                        <path d="M9.5 4.6A11.3 11.3 0 0112 4.3c6.7 0 10.5 7.7 10.5 7.7a16.9 16.9 0 01-4 5.2" />
                        <path d="M6.1 6.2A16.8 16.8 0 001.5 12s3.8 7.7 10.5 7.7a11 11 0 004.2-.8" />
                      </svg>
                    ) : (
                      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                        <path d="M1.5 12S5.3 4.3 12 4.3 22.5 12 22.5 12 18.7 19.7 12 19.7 1.5 12 1.5 12z" />
                        <circle cx="12" cy="12" r="3" />
                      </svg>
                    )}
                  </button>
                </div>
              </label>
              <label>
                Verify new password
                <input
                  type={showAccountPassword ? 'text' : 'password'}
                  value={accountConfirmPassword}
                  onChange={(event) => setAccountConfirmPassword(event.target.value)}
                />
              </label>
              <button className="secondary" onClick={updateAccountPassword} disabled={authLoading || accountNewPassword.length === 0 || accountConfirmPassword.length === 0}>
                Change Password
              </button>
              <button className="secondary" onClick={refreshSupporterTier}>
                Refresh Tier
              </button>
              <button className="secondary" onClick={signOut}>
                Sign Out
              </button>
              <button className="danger" onClick={resetEverything}>
                Reset Progress and Data
              </button>
              <button className="primary" onClick={submitProfile} disabled={authLoading || profileUsername.trim().length < 1}>
                Save All Changes
              </button>
            </div>
          </section>
        )}
      </main>

      {selectedLeaderboardEntry ? (
        <div
          className="profile-modal-overlay"
          onClick={() => {
            setSelectedLeaderboardEntry(null)
            setSelectedLeaderboardIsTop(false)
          }}
        >
          <div className="card profile-modal-card" onClick={(event) => event.stopPropagation()}>
            <div className="quiz-top">
              <h3>Player Profile</h3>
              <button
                className="secondary"
                onClick={() => {
                  setSelectedLeaderboardEntry(null)
                  setSelectedLeaderboardIsTop(false)
                }}
              >
                Close
              </button>
            </div>
            <div className="leader-player">
              <span className="leader-avatar-wrap">
                {selectedLeaderboardIsTop ? <span className="leader-crown leader-crown-modal" aria-label="Top Player">👑</span> : null}
                <span className="leader-avatar-frame modal-avatar">
                  <img src={avatarFor(selectedLeaderboardEntry.avatarUrl)} alt={selectedLeaderboardEntry.playerName} className="leader-avatar" onError={handleAvatarImageError} />
                </span>
              </span>
              <div>
                <h3 className={displayNameClass(selectedLeaderboardEntry.supporterTier, true)} style={displayNameStyle(selectedLeaderboardEntry.nameStyle, selectedLeaderboardEntry.supporterTier)}>
                  {selectedLeaderboardEntry.playerName}
                </h3>
                <p className="muted">Tier: {tierLabel[selectedLeaderboardEntry.supporterTier]}</p>
                {selectedLeaderboardEntry.isOwner ? <p className="owner-pill">Owner</p> : null}
              </div>
            </div>
            <p><strong>Agency:</strong> {selectedLeaderboardEntry.agency || 'Not provided'}</p>
            <p><strong>About Me:</strong> {selectedLeaderboardEntry.bio || 'Not provided'}</p>
            <p className="muted">
              {selectedLeaderboardEntry.round > 0
                ? `Best ${selectedLeaderboardEntry.game} score: ${selectedLeaderboardEntry.score} • Round ${selectedLeaderboardEntry.round}`
                : `${selectedLeaderboardEntry.game}: ${selectedLeaderboardEntry.game === 'Study Hours' ? formatStudyTime(selectedLeaderboardEntry.score) : selectedLeaderboardEntry.score}`}
            </p>
          </div>
        </div>
      ) : null}

      {celebration ? (
        <div className="celebration-overlay" aria-live="polite">
          <div className="celebration-card">
            <h3>{celebration.title}</h3>
            <p>{celebration.subtitle}</p>
          </div>
          <div className="celebration-burst" key={`burst-${celebration.burst}`}>
            {Array.from({ length: 52 }).map((_, index) => (
              <span key={`confetti-${celebration.burst}-${index}`} className="confetti-dot" style={{ ['--i' as string]: `${index}` }} />
            ))}
          </div>
        </div>
      ) : null}

      {avatarCropOpen ? (
        <div className="profile-modal-overlay" onClick={cancelAvatarCrop}>
          <div className="card avatar-crop-card" onClick={(event) => event.stopPropagation()}>
            <h3>Crop Profile Picture</h3>
            <div className="avatar-crop-frame">
              <img
                src={avatarCropSourceUrl}
                alt="Crop preview"
                className="avatar-crop-image"
                style={{
                  transform: `translate(calc(-50% + ${avatarCropX}px), calc(-50% + ${avatarCropY}px)) scale(${avatarCropZoom})`,
                }}
              />
            </div>
            <div className="avatar-crop-controls">
              <label>
                Zoom: {avatarCropZoom.toFixed(2)}x
                <input type="range" min={1} max={3} step={0.01} value={avatarCropZoom} onChange={(event) => setAvatarCropZoom(Number(event.target.value))} />
              </label>
              <label>
                Horizontal
                <input type="range" min={-140} max={140} step={1} value={avatarCropX} onChange={(event) => setAvatarCropX(Number(event.target.value))} />
              </label>
              <label>
                Vertical
                <input type="range" min={-140} max={140} step={1} value={avatarCropY} onChange={(event) => setAvatarCropY(Number(event.target.value))} />
              </label>
            </div>
            <div className="actions-row">
              <button className="secondary" onClick={cancelAvatarCrop}>Cancel</button>
              <button className="primary" onClick={applyAvatarCrop}>Use This Crop</button>
            </div>
          </div>
        </div>
      ) : null}

      {showMatchSetupModal ? (
        <div className="profile-modal-overlay" onClick={() => setShowMatchSetupModal(false)}>
          <div className="card game-settings-modal" onClick={(event) => event.stopPropagation()}>
            <h3>Matching Settings</h3>
            <label className="game-control">
              Code Set
              <div className="segmented">
                {(['all', 'penal', 'hs', 'vehicle'] as CodeFilter[]).map((filter) => (
                  <button key={`match-setup-${filter}`} className={matchFilter === filter ? 'seg active' : 'seg'} onClick={() => setMatchFilter(filter)}>
                    {filter === 'all' ? 'All' : codeSetLabel[filter]}
                  </button>
                ))}
              </div>
            </label>
            <label className="game-control">
              Time
              <div className="segmented">
                {[15, 30, 60].map((time) => (
                  <button key={`match-setup-time-${time}`} className={matchDuration === time ? 'seg active' : 'seg'} onClick={() => setMatchDuration(time)}>
                    {time}s
                  </button>
                ))}
              </div>
            </label>
            <div className="actions-row">
              <button className="secondary" onClick={() => setShowMatchSetupModal(false)}>Cancel</button>
              <button className="primary" onClick={beginMatchingFromSetup}>Start</button>
            </div>
          </div>
        </div>
      ) : null}

      {showSpeedSetupModal ? (
        <div className="profile-modal-overlay" onClick={() => setShowSpeedSetupModal(false)}>
          <div className="card game-settings-modal" onClick={(event) => event.stopPropagation()}>
            <h3>Speed Test Settings</h3>
            <label className="game-control">
              Code Set
              <div className="segmented">
                {(['all', 'penal', 'hs', 'vehicle'] as CodeFilter[]).map((filter) => (
                  <button key={`speed-setup-${filter}`} className={speedFilter === filter ? 'seg active' : 'seg'} onClick={() => setSpeedFilter(filter)}>
                    {filter === 'all' ? 'All' : codeSetLabel[filter]}
                  </button>
                ))}
              </div>
            </label>
            <label className="game-control">
              Time
              <div className="segmented">
                {[15, 30, 60].map((time) => (
                  <button key={`speed-setup-time-${time}`} className={speedDuration === time ? 'seg active' : 'seg'} onClick={() => setSpeedDuration(time)}>
                    {time}s
                  </button>
                ))}
              </div>
            </label>
            <div className="actions-row">
              <button className="secondary" onClick={() => setShowSpeedSetupModal(false)}>Cancel</button>
              <button className="primary" onClick={beginSpeedFromSetup} disabled={speedQuestionBank.length === 0}>Start</button>
            </div>
          </div>
        </div>
      ) : null}

      <nav className="tab-bar">
        {[
          { key: 'study', label: 'Study' },
          { key: 'games', label: 'Games' },
          { key: 'home', label: 'Home' },
          { key: 'scenarios', label: 'Scenarios' },
          { key: 'library', label: 'Library' },
        ].map((tab) => (
          <button
            key={tab.key}
            className={(tab.key === 'home' ? isHomePage : !isHomePage && activeTab === tab.key) ? 'tab active' : 'tab'}
            onClick={() => {
              setActiveTab(tab.key as AppTab)
              const pathByTab: Record<AppTab, string> = {
                home: '/home',
                study: '/study',
                games: '/games',
                scenarios: '/scenarios',
                library: '/library',
              }
              navigate(pathByTab[tab.key as AppTab])
            }}
          >
            <AppIcon
              name={tab.key === 'home' ? 'home' : tab.key === 'study' ? 'study' : tab.key === 'games' ? 'games' : tab.key === 'scenarios' ? 'scenarios' : 'library'}
              className="tab-icon"
            />
            <span className="tab-label">{tab.label}</span>
          </button>
        ))}
      </nav>
        </>
      ) : null}
    </div>
  )
}

export default App
