import studyGuideTmas1Raw from './study-guide-tmas1.txt?raw'

export type StudyGuideModuleId = 'tmas1' | 'tmas2' | 'tmas3'

export type StudyGuideSection = {
  id: string
  title: string
  content: string
}

export type StudyGuideDomain = {
  id: string
  ldNumber: string
  sourceLdNumber: string
  title: string
  durationLabel: string
  summary: string
  sourceNote?: string
  sections: StudyGuideSection[]
  sectionCount: number
  wordCount: number
}

export type StudyGuideModule = {
  id: StudyGuideModuleId
  title: string
  description: string
  sourceLabel: string
  sourceNote: string
  hasContent: boolean
  domainCount: number
  sectionCount: number
  domains: StudyGuideDomain[]
}

const ldHeaderPattern = /^\s*LD\s*0?(\d{1,2})\s*[–-]\s*(.+)$/gm
const repeatedHeaderPattern =
  /Module I Exam: LD.?s 5, 6, 7, 8, 9, 10, 11, 12, 15, 16, 20, 25,\s*\n?26, 28, 37, 39, 40, 43\s*/g

function cleanInline(value: string) {
  return value
    .replace(/\u200b/g, '')
    .replace(/\xa0/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .trim()
}

function cleanMultiline(value: string) {
  return value
    .replace(/\u200b/g, '')
    .replace(/\xa0/g, ' ')
    .split('\n')
    .map((line) => cleanInline(line))
    .filter(Boolean)
    .join('\n')
    .trim()
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function summarizeText(value: string, maxLength = 220) {
  const normalized = value.replace(/\s+/g, ' ').trim()
  if (normalized.length <= maxLength) return normalized
  return `${normalized.slice(0, maxLength - 1).trimEnd()}…`
}

function normalizeStudyGuideText(raw: string) {
  return raw
    .replace(/\f/g, '\n')
    .replace(repeatedHeaderPattern, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function isHeadingBlock(block: string) {
  const lines = block.split('\n').map((line) => line.trim()).filter(Boolean)
  if (lines.length === 0 || lines.length > 3) return false

  const joined = lines.join(' ')
  if (joined.length > 110) return false
  if (/^[\-\u2022o]/.test(joined)) return false
  if (/^\d+\./.test(joined)) return false

  const firstCharacter = joined[0]
  if (firstCharacter && firstCharacter === firstCharacter.toLowerCase()) return false

  return true
}

function splitDomainSections(domainId: string, body: string) {
  const rawBlocks = body
    .split(/\n\s*\n/)
    .map((block) => cleanMultiline(block))
    .filter(Boolean)
    .filter((block) => block.replace(/[\-\u2022o\s]/g, '').length >= 3)

  const sections: StudyGuideSection[] = []
  let currentTitle = ''
  let currentParts: string[] = []

  const flushSection = () => {
    if (!currentTitle && currentParts.length === 0) return

    const id = `${domainId}-section-${sections.length + 1}`
    const title = currentTitle || `Study Block ${sections.length + 1}`
    const content = currentParts.join('\n\n').trim()

    sections.push({ id, title, content })
    currentTitle = ''
    currentParts = []
  }

  rawBlocks.forEach((block) => {
    if (isHeadingBlock(block)) {
      flushSection()
      currentTitle = block
      return
    }

    if (!currentTitle && currentParts.length === 0) {
      currentTitle = `Study Block ${sections.length + 1}`
    }
    currentParts.push(block)
  })

  flushSection()

  return sections
}

function parseLearningDomains(raw: string): StudyGuideDomain[] {
  const normalized = normalizeStudyGuideText(raw)
  const headers = Array.from(normalized.matchAll(ldHeaderPattern))

  return headers
    .map((match, index) => {
      const rawLdNumber = cleanInline(match[1] || '')
      const rawTitle = cleanInline(match[2] || '')
      const start = match.index !== undefined ? match.index + match[0].length : 0
      const end = headers[index + 1]?.index ?? normalized.length
      const body = normalized.slice(start, end).trim()

      const durationMatch = rawTitle.match(/(\d+\s*hrs?)$/i)
      const durationLabel = durationMatch ? cleanInline(durationMatch[1]) : ''
      const titleWithoutDuration = cleanInline(rawTitle.replace(/\s+\d+\s*hrs?$/i, ''))
      const isInferredLd43 = rawLdNumber === '40' && /terrorism awareness/i.test(titleWithoutDuration)
      const ldNumber = isInferredLd43 ? '43' : rawLdNumber
      const title = titleWithoutDuration
      const id = `ld-${slugify(`${ldNumber}-${title}`)}`
      const sections = splitDomainSections(id, body)
      const summarySource = sections
        .slice(0, 3)
        .map((section) => [section.title, section.content].filter(Boolean).join(' '))
        .join(' ')

      return {
        id,
        ldNumber,
        sourceLdNumber: rawLdNumber,
        title,
        durationLabel,
        summary: summarizeText(summarySource),
        sourceNote: isInferredLd43
          ? 'Displayed as LD 43 because the uploaded Module I header lists LD 43, while this page header appears mislabeled as LD 40.'
          : undefined,
        sections,
        sectionCount: sections.length,
        wordCount: body.split(/\s+/).filter(Boolean).length,
      }
    })
    .sort((left, right) => Number(left.ldNumber) - Number(right.ldNumber))
}

function createEmptyModule(id: Extract<StudyGuideModuleId, 'tmas2' | 'tmas3'>, title: string): StudyGuideModule {
  return {
    id,
    title,
    description: `This guide shell is ready for ${title} content by learning domain or full-module review.`,
    sourceLabel: 'Awaiting guide source',
    sourceNote: 'The current uploaded PDF only contained Module I / TMAS 1 material. Upload the TMAS 2 or TMAS 3 guide PDF to populate this module.',
    hasContent: false,
    domainCount: 0,
    sectionCount: 0,
    domains: [],
  }
}

const tmas1Domains = parseLearningDomains(studyGuideTmas1Raw)

export const studyGuideModules: StudyGuideModule[] = [
  {
    id: 'tmas1',
    title: 'TMAS 1',
    description: 'Full PDF-backed guide broken down by learning domain, with every loaded block searchable and reviewable.',
    sourceLabel: 'Loaded from uploaded study guide PDF',
    sourceNote:
      'This source file contains Module I / TMAS 1 content only. TMAS 2 and TMAS 3 tabs are included now so the guide experience is ready for the next uploads.',
    hasContent: true,
    domainCount: tmas1Domains.length,
    sectionCount: tmas1Domains.reduce((total, domain) => total + domain.sectionCount, 0),
    domains: tmas1Domains,
  },
  createEmptyModule('tmas2', 'TMAS 2'),
  createEmptyModule('tmas3', 'TMAS 3'),
]
