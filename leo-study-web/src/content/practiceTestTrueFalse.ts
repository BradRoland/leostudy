type QuestionLike = {
  id: string
  ldNumber: string
  ttsRefs?: string[]
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
  selectedChoice: string
  correctChoice: string
  prompt: string
  explanation: string
  score: number
  correctIndex: number
}

type StatementTemplate = {
  statement: string
  qualityBoost: number
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

function formatChoiceReference(choice: string) {
  return choice.trim().replace(/[.?!]+$/, '')
}

function quoteChoice(choice: string) {
  return `“${formatChoiceReference(choice)}”`
}

function buildStatementTemplate(question: QuestionLike, choice: string): StatementTemplate {
  const prompt = question.prompt.trim()
  const quotedChoice = quoteChoice(choice)

  const templates: Array<{ pattern: RegExp; qualityBoost: number; build: () => string }> = [
    {
      pattern: /(which|what) (fact|facts|fact set|combination of facts).*(best|most strongly|most directly) support/i,
      qualityBoost: 36,
      build: () => `${quotedChoice} is the fact pattern that best supports the tested issue here`,
    },
    {
      pattern: /what mental state/i,
      qualityBoost: 34,
      build: () => `${quotedChoice} is the mental state officers must be able to articulate here`,
    },
    {
      pattern: /(which|what) role best fits|classification best fits/i,
      qualityBoost: 34,
      build: () => `${quotedChoice} is the role or liability theory that best fits this conduct`,
    },
    {
      pattern: /primarily civil/i,
      qualityBoost: 34,
      build: () => `${quotedChoice} is the primarily civil issue in this scenario`,
    },
    {
      pattern: /(what|which).*(additional|separate).*(issue|offense|concern|theory|crime|classification)|most directly raises what additional|most relevant to what additional/i,
      qualityBoost: 35,
      build: () => `${quotedChoice} is the additional issue officers should evaluate here`,
    },
    {
      pattern: /(which|what).*(property crime|offense category|classification)|most directly supports which offense|most directly supports what offense|what offense should officers evaluate/i,
      qualityBoost: 34,
      build: () => `${quotedChoice} is the strongest tested conclusion under these facts`,
    },
    {
      pattern: /what is the strongest arrest authority/i,
      qualityBoost: 35,
      build: () => `${quotedChoice} is the strongest arrest authority here`,
    },
    {
      pattern: /what is the strongest search authority|what search authority most directly follows/i,
      qualityBoost: 35,
      build: () => `${quotedChoice} is the strongest search authority here`,
    },
    {
      pattern: /what is the proper scope limitation|what is the proper scope of the officers’ actions|under that authority, what is the proper scope limitation/i,
      qualityBoost: 34,
      build: () => `${quotedChoice} is the correct scope limitation here`,
    },
    {
      pattern: /which follow-up step would count as/i,
      qualityBoost: 33,
      build: () => `${quotedChoice} is the step that fits that definition`,
    },
    {
      pattern: /which next step best keeps the investigation lawful/i,
      qualityBoost: 34,
      build: () => `${quotedChoice} is the next step that best keeps the investigation lawful`,
    },
    {
      pattern: /which fact matters most in showing/i,
      qualityBoost: 33,
      build: () => `${quotedChoice} is the fact that matters most on that issue`,
    },
    {
      pattern: /what immediate duty remains/i,
      qualityBoost: 33,
      build: () => `${quotedChoice} is the immediate duty that still remains`,
    },
    {
      pattern: /which option is most defensible under ld 20|which response best reflects ld 20 force principles/i,
      qualityBoost: 34,
      build: () => `${quotedChoice} is the most defensible force option under these facts`,
    },
    {
      pattern: /what is the best legal classification of the officer contact/i,
      qualityBoost: 34,
      build: () => `${quotedChoice} is the best legal classification of the contact`,
    },
    {
      pattern: /what should officers do next|what should happen first|what is the best immediate investigative step|what is the best first-response approach|what response is most consistent|which tactic best reflects|which tactic best fits|which officer conduct best reflects|which action best preserves/i,
      qualityBoost: 33,
      build: () => `${quotedChoice} is the response that best fits the tested rule here`,
    },
    {
      pattern: /what rule applies|what is the correct rule|what is the best legal rule|what is the best rule|which statement is most accurate|what force principle is most accurate|what is the best legal conclusion|what is the strongest legal basis|what is the strongest legal significance|what is the strongest search-and-seizure significance/i,
      qualityBoost: 33,
      build: () => `${quotedChoice} is the strongest legal conclusion under these facts`,
    },
    {
      pattern: /which report detail is most important|which detail is most important|which documentation choice best|which documentation step best|what should officers carefully document|what should officers document|which facts are most important to articulate|which set of evidence best preserves|which evidence package best supports/i,
      qualityBoost: 34,
      build: () => `${quotedChoice} is the point officers should document or preserve`,
    },
    {
      pattern: /why are .* important|why is .* important|what is the best reason/i,
      qualityBoost: 31,
      build: () => `${quotedChoice} is the best explanation for why that fact matters`,
    },
    {
      pattern: /what is the legal effect of/i,
      qualityBoost: 31,
      build: () => `${quotedChoice} is the legal effect of those facts`,
    },
    {
      pattern: /when would miranda become required|what is the key legal requirement|what must occur before custodial interrogation/i,
      qualityBoost: 34,
      build: () => `${quotedChoice} is the legal requirement before officers proceed`,
    },
    {
      pattern: /what lawful option is most relevant|what is the officer’s correct role|how should officers treat .*statement/i,
      qualityBoost: 30,
      build: () => `${quotedChoice} is the most defensible legal approach here`,
    },
    {
      pattern: /best described as what|encounter at minimum|elevated the contact into a detention/i,
      qualityBoost: 30,
      build: () => `${quotedChoice} best describes the contact at that point`,
    },
    {
      pattern: /what legal standard is required|what standard/i,
      qualityBoost: 29,
      build: () => `${quotedChoice} is the governing legal standard here`,
    },
    {
      pattern: /what level/i,
      qualityBoost: 28,
      build: () => `${quotedChoice} is the tested classification level here`,
    },
    {
      pattern: /how should officers classify|how should officers evaluate|how should officers respond|how should officers handle/i,
      qualityBoost: 29,
      build: () => `${quotedChoice} is the best officer conclusion here`,
    },
  ]

  const matchedTemplate = templates.find((template) => template.pattern.test(prompt))
  if (matchedTemplate) {
    return {
      statement: matchedTemplate.build(),
      qualityBoost: matchedTemplate.qualityBoost,
    }
  }

  return {
    statement: `${quotedChoice} is the strongest tested conclusion here`,
    qualityBoost: 12,
  }
}

function buildTrueFalsePrompt(question: QuestionLike, choice: string) {
  const template = buildStatementTemplate(question, choice)
  return {
    prompt: `True or False: ${template.statement}.`,
    statement: template.statement,
    qualityBoost: template.qualityBoost,
  }
}

function buildTrueCandidate<TQuestion extends QuestionLike>(question: TQuestion): Candidate<TQuestion> | null {
  const correctChoice = question.choices[question.correctIndex]
  const normalizedChoice = normalizeChoiceText(correctChoice)
  if (!normalizedChoice) return null

  const promptPenalty = hasPromptPenalty(question.prompt) ? 20 : 0
  const promptData = buildTrueFalsePrompt(question, correctChoice)
  const score = normalizedChoice.length + promptData.qualityBoost - promptPenalty
  if (score <= 0) return null

  return {
    question,
    selectedChoice: correctChoice,
    correctChoice,
    prompt: promptData.prompt,
    explanation: `True. ${promptData.statement}. ${question.explanation}`,
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
        rawChoice: entry.choice,
        score: overlapScore * 100 + normalizedChoice.length * 0.18 - penalty,
      }
    })
    .sort((left, right) => right.score - left.score)[0]

  if (!bestWrongChoice || !bestWrongChoice.choice) return null

  const promptData = buildTrueFalsePrompt(question, bestWrongChoice.rawChoice)

  return {
    question,
    selectedChoice: bestWrongChoice.choice,
    correctChoice,
    prompt: promptData.prompt,
    explanation: `False. ${promptData.statement}. That answer sounds plausible, but it is not the strongest conclusion under these facts. The better answer is ${quoteChoice(correctChoice)}. ${question.explanation}`,
    score: bestWrongChoice.score + promptData.qualityBoost,
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
        ttsRefs: primaryTrueCandidate.question.ttsRefs ?? [],
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
        ttsRefs: primaryFalseCandidate.question.ttsRefs ?? [],
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
          ttsRefs: tertiaryCandidate.question.ttsRefs ?? [],
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
