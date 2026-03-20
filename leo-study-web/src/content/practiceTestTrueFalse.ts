type QuestionLike = {
  id: string
  ldNumber: string
  objective: string
  prompt: string
  choices: string[]
  correctIndex: number
  explanation: string
  format?: 'multiple_choice' | 'true_false'
}

type ScenarioLike<TQuestion extends QuestionLike = QuestionLike> = {
  id: string
  ldNumbers: string[]
  questions: TQuestion[]
}

type Candidate<TQuestion extends QuestionLike> = {
  question: TQuestion
  prompt: string
  explanation: string
  score: number
  correctIndex: number
}

const penaltyPatterns = [/^only\b/i, /\balways\b/i, /\bnever\b/i, /\bpurely\b/i, /\bnothing\b/i]
const promptPenaltyPatterns = [/at what level/i, /which section number/i, /what code section/i]
const stopWords = new Set([
  'a',
  'an',
  'and',
  'are',
  'as',
  'at',
  'be',
  'because',
  'by',
  'for',
  'from',
  'in',
  'into',
  'is',
  'it',
  'of',
  'on',
  'or',
  'that',
  'the',
  'their',
  'this',
  'to',
  'under',
  'while',
  'with',
])

function normalizeChoiceText(choice: string) {
  const trimmed = choice.trim().replace(/\s+/g, ' ')
  if (!trimmed) return ''
  const withPunctuation = /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`
  return withPunctuation.charAt(0).toUpperCase() + withPunctuation.slice(1)
}

function tokenize(text: string) {
  return text
    .toLowerCase()
    .match(/[a-z0-9]+/g)
    ?.filter((token) => !stopWords.has(token)) ?? []
}

function calculateOverlapScore(left: string, right: string) {
  const leftTokens = tokenize(left)
  const rightTokens = new Set(tokenize(right))
  if (leftTokens.length === 0 || rightTokens.size === 0) return 0
  const matches = leftTokens.reduce((total, token) => total + (rightTokens.has(token) ? 1 : 0), 0)
  return matches / Math.max(leftTokens.length, rightTokens.size)
}

function hasPromptPenalty(prompt: string) {
  return promptPenaltyPatterns.some((pattern) => pattern.test(prompt))
}

function buildTrueCandidate<TQuestion extends QuestionLike>(question: TQuestion): Candidate<TQuestion> | null {
  const correctChoice = question.choices[question.correctIndex]
  const normalizedChoice = normalizeChoiceText(correctChoice)
  if (!normalizedChoice) return null

  const promptPenalty = hasPromptPenalty(question.prompt) ? 20 : 0
  const score = normalizedChoice.length - promptPenalty
  if (score <= 0) return null

  return {
    question,
    prompt: `True or False: ${normalizedChoice}`,
    explanation: `True. ${question.explanation}`,
    score,
    correctIndex: 0,
  }
}

function buildFalseCandidate<TQuestion extends QuestionLike>(question: TQuestion): Candidate<TQuestion> | null {
  const correctChoice = question.choices[question.correctIndex]
  const bestWrongChoice = question.choices
    .map((choice, index) => ({ choice, index }))
    .filter((entry) => entry.index !== question.correctIndex)
    .map((entry) => {
      const normalizedChoice = normalizeChoiceText(entry.choice)
      const overlapScore = calculateOverlapScore(correctChoice, entry.choice)
      const penalty = penaltyPatterns.reduce((total, pattern) => total + (pattern.test(entry.choice) ? 14 : 0), 0)
      return {
        choice: normalizedChoice,
        score: overlapScore * 100 + normalizedChoice.length * 0.18 - penalty,
      }
    })
    .sort((left, right) => right.score - left.score)[0]

  if (!bestWrongChoice || !bestWrongChoice.choice) return null

  return {
    question,
    prompt: `True or False: ${bestWrongChoice.choice}`,
    explanation: `False. ${question.explanation}`,
    score: bestWrongChoice.score,
    correctIndex: 1,
  }
}

function selectCandidate<TQuestion extends QuestionLike>(
  candidates: Candidate<TQuestion>[],
  usedQuestionIds: Set<string>,
) {
  return candidates.find((candidate) => !usedQuestionIds.has(candidate.question.id)) ?? candidates[0] ?? null
}

export function appendTrueFalseFollowUps<TScenario extends ScenarioLike>(scenarios: TScenario[]): TScenario[] {
  return scenarios.map((scenario) => {
    const trueCandidates = scenario.questions
      .map((question) => buildTrueCandidate(question))
      .filter((candidate): candidate is Candidate<TScenario['questions'][number]> => candidate !== null)
      .sort((left, right) => right.score - left.score)
    const falseCandidates = scenario.questions
      .map((question) => buildFalseCandidate(question))
      .filter((candidate): candidate is Candidate<TScenario['questions'][number]> => candidate !== null)
      .sort((left, right) => right.score - left.score)

    const usedQuestionIds = new Set<string>()
    const extras: TScenario['questions'] = [] as unknown as TScenario['questions']
    const targetCount = scenario.ldNumbers.length > 1 ? 3 : 2

    const primaryTrueCandidate = selectCandidate(trueCandidates, usedQuestionIds)
    if (primaryTrueCandidate) {
      usedQuestionIds.add(primaryTrueCandidate.question.id)
      extras.push({
        id: `${scenario.id}-tf-1`,
        ldNumber: primaryTrueCandidate.question.ldNumber,
        objective: `${primaryTrueCandidate.question.objective} • True / False`,
        prompt: primaryTrueCandidate.prompt,
        choices: ['True', 'False'],
        correctIndex: primaryTrueCandidate.correctIndex,
        explanation: primaryTrueCandidate.explanation,
        format: 'true_false',
      } as TScenario['questions'][number])
    }

    const primaryFalseCandidate = selectCandidate(falseCandidates, usedQuestionIds)
    if (primaryFalseCandidate) {
      usedQuestionIds.add(primaryFalseCandidate.question.id)
      extras.push({
        id: `${scenario.id}-tf-2`,
        ldNumber: primaryFalseCandidate.question.ldNumber,
        objective: `${primaryFalseCandidate.question.objective} • True / False`,
        prompt: primaryFalseCandidate.prompt,
        choices: ['True', 'False'],
        correctIndex: primaryFalseCandidate.correctIndex,
        explanation: primaryFalseCandidate.explanation,
        format: 'true_false',
      } as TScenario['questions'][number])
    }

    if (targetCount === 3) {
      const remainingCandidates = [...trueCandidates, ...falseCandidates]
        .filter((candidate) => !usedQuestionIds.has(candidate.question.id))
        .sort((left, right) => right.score - left.score)
      const tertiaryCandidate = remainingCandidates[0] ?? null

      if (tertiaryCandidate) {
        extras.push({
          id: `${scenario.id}-tf-3`,
          ldNumber: tertiaryCandidate.question.ldNumber,
          objective: `${tertiaryCandidate.question.objective} • True / False`,
          prompt: tertiaryCandidate.prompt,
          choices: ['True', 'False'],
          correctIndex: tertiaryCandidate.correctIndex,
          explanation: tertiaryCandidate.explanation,
          format: 'true_false',
        } as TScenario['questions'][number])
      }
    }

    return {
      ...scenario,
      questions: [...scenario.questions, ...extras],
    }
  })
}
