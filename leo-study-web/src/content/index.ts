import customRaw from './custom.json'
import hsRaw from './hs.json'
import pcRaw from './pc.json'
import scenariosRaw from './scenarios.json'
import scenariosTmas2Raw from './scenarios-tmas2.json'
import vcRaw from './vc.json'

export type ContentCategory = string
export type ScenarioTrainingSection = 'tmas1' | 'tmas2'

export type ContentBankItem = {
  id: string
  category: ContentCategory
  title: string
  question: string
  answer?: string
  tags?: string[]
  difficulty?: string
  codeSection?: string
  explanation?: string
  sourceUrl?: string
}

export type ScenarioBankItem = {
  id: string
  category: ContentCategory
  title: string
  scenario: string
  questions: string[]
  tmasSet?: ScenarioTrainingSection
  subQuestions?: ScenarioBankSubQuestion[]
  expectedAnswer?: string
  keyPoints?: string[]
  tags?: string[]
  difficulty?: string
  codeSection?: string
  explanation?: string
  sourceUrl?: string
}

export type ScenarioBankSubQuestion = {
  id: string
  prompt: string
  choices: string[]
  expectedAnswer: string
  explanation?: string
}

export type LocalContentBundle = {
  codeItems: ContentBankItem[]
  scenarioItems: ScenarioBankItem[]
  warnings: string[]
}

const categoryAliases: Record<string, string> = {
  penal: 'pc',
  pc: 'pc',
  'penal code': 'pc',
  hs: 'hs',
  'h&s': 'hs',
  health: 'hs',
  'health & safety': 'hs',
  'health and safety': 'hs',
  vc: 'vc',
  vehicle: 'vc',
  'vehicle code': 'vc',
  scenario: 'scenario',
}

function normalizeCategory(value: unknown) {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
  return categoryAliases[normalized] || normalized
}

function asString(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function asStringArray(value: unknown) {
  if (!Array.isArray(value)) return []
  return value
    .map((item) => asString(item))
    .filter(Boolean)
}

function normalizeScenarioTrainingSection(value: unknown): ScenarioTrainingSection {
  return String(value || '').trim().toLowerCase() === 'tmas2' ? 'tmas2' : 'tmas1'
}

function parseScenarioSubQuestions(value: unknown) {
  if (!Array.isArray(value)) return []

  const items: ScenarioBankSubQuestion[] = []

  for (const [index, entry] of value.entries()) {
    if (!entry || typeof entry !== 'object') continue

    const record = entry as Record<string, unknown>
    const id = asString(record.id)
    const prompt = asString(record.prompt)
    const choices = asStringArray(record.choices)
    const expectedAnswer = asString(record.expectedAnswer || record.expected_answer)

    if (!id || !prompt || choices.length < 2 || !expectedAnswer || !choices.includes(expectedAnswer)) {
      console.warn(`[content] scenario sub-question[${index}] is invalid and was skipped.`)
      continue
    }

    items.push({
      id,
      prompt,
      choices,
      expectedAnswer,
      explanation: asString(record.explanation) || undefined,
    })
  }

  return items
}

function parseCodeItems(raw: unknown, sourceName: string, warnings: string[]): ContentBankItem[] {
  if (!Array.isArray(raw)) {
    warnings.push(`[content] ${sourceName}: expected array, got ${typeof raw}`)
    return []
  }

  const items: ContentBankItem[] = []

  for (const [index, entry] of raw.entries()) {
    if (!entry || typeof entry !== 'object') {
      warnings.push(`[content] ${sourceName}[${index}]: expected object`)
      continue
    }

    const value = entry as Record<string, unknown>
    const id = asString(value.id)
    const category = normalizeCategory(value.category)
    const title = asString(value.title)
    const question = asString(value.question)

    if (!id || !category || !title || !question) {
      warnings.push(`[content] ${sourceName}[${index}]: missing required fields (id/category/title/question)`)
      continue
    }

    items.push({
      id,
      category,
      title,
      question,
      answer: asString(value.answer) || undefined,
      tags: asStringArray(value.tags),
      difficulty: asString(value.difficulty) || undefined,
      codeSection: asString(value.codeSection) || undefined,
      explanation: asString(value.explanation) || undefined,
      sourceUrl: asString(value.sourceUrl) || undefined,
    })
  }

  return items
}

function parseScenarioItems(raw: unknown, sourceName: string, warnings: string[]): ScenarioBankItem[] {
  if (!Array.isArray(raw)) {
    warnings.push(`[content] ${sourceName}: expected array, got ${typeof raw}`)
    return []
  }

  const items: ScenarioBankItem[] = []

  for (const [index, entry] of raw.entries()) {
    if (!entry || typeof entry !== 'object') {
      warnings.push(`[content] ${sourceName}[${index}]: expected object`)
      continue
    }

    const value = entry as Record<string, unknown>
    const id = asString(value.id)
    const category = normalizeCategory(value.category || 'scenario')
    const title = asString(value.title)
    const scenario = asString(value.scenario)
    const questions = asStringArray(value.questions)
    const subQuestions = parseScenarioSubQuestions(value.subQuestions || value.sub_questions)
    const tmasSet = normalizeScenarioTrainingSection(value.tmasSet || value.tmas_set)

    if (!id || !category || !title || !scenario || (questions.length === 0 && subQuestions.length === 0)) {
      warnings.push(`[content] ${sourceName}[${index}]: missing required fields (id/category/title/scenario/questions[] or subQuestions[])`)
      continue
    }

    items.push({
      id,
      category,
      title,
      scenario,
      questions,
      tmasSet,
      subQuestions: subQuestions.length ? subQuestions : undefined,
      expectedAnswer: asString(value.expectedAnswer) || undefined,
      keyPoints: asStringArray(value.keyPoints),
      tags: asStringArray(value.tags),
      difficulty: asString(value.difficulty) || undefined,
      codeSection: asString(value.codeSection) || undefined,
      explanation: asString(value.explanation) || undefined,
      sourceUrl: asString(value.sourceUrl) || undefined,
    })
  }

  return items
}

export function loadLocalContentBundle(): LocalContentBundle {
  const warnings: string[] = []

  const codeItems = [
    ...parseCodeItems(pcRaw, 'pc.json', warnings),
    ...parseCodeItems(hsRaw, 'hs.json', warnings),
    ...parseCodeItems(vcRaw, 'vc.json', warnings),
    ...parseCodeItems(customRaw, 'custom.json', warnings),
  ]

  const scenarioItems = parseScenarioItems(scenariosRaw, 'scenarios.json', warnings)
    .concat(parseScenarioItems(scenariosTmas2Raw, 'scenarios-tmas2.json', warnings))

  return { codeItems, scenarioItems, warnings }
}

export const localContentFiles = {
  pc: pcRaw,
  hs: hsRaw,
  vc: vcRaw,
  custom: customRaw,
  scenarios: scenariosRaw,
  scenariosTmas2: scenariosTmas2Raw,
}
