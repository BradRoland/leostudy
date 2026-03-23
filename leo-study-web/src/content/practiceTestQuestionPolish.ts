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

function quoteChoice(choice: string) {
  return `“${choice.trim().replace(/[.?!]+$/, '')}”`
}

function normalizePrompt(prompt: string) {
  const trimmed = prompt.trim()
  const replacements: Array<{ pattern: RegExp; value: string }> = [
    {
      pattern: /^What is the strongest arrest authority in this scenario\?$/i,
      value: 'Under these facts, what arrest authority is most defensible?',
    },
    {
      pattern: /^What is the strongest search authority in this scenario\?$/i,
      value: 'Under these facts, what search authority is most defensible?',
    },
    {
      pattern: /^Under that authority, what is the proper scope limitation\?$/i,
      value: 'Once officers rely on that authority, what is the correct scope limit?',
    },
    {
      pattern: /^At the first lawful restraint point in this scenario, what is the best legal classification of the officer contact\?$/i,
      value: 'At that first restraint point, how should the officer contact be classified?',
    },
    {
      pattern: /^At the first decision point, which response best reflects LD 20 force principles\?$/i,
      value: 'At the first force decision point, which response is most defensible under LD 20?',
    },
    {
      pattern: /^If force becomes necessary on these facts, which option is most defensible under LD 20\?$/i,
      value: 'If force becomes necessary here, which option is most defensible under LD 20?',
    },
    {
      pattern: /^After the force event is over and the scene is stabilized, what immediate duty remains\?$/i,
      value: 'Once the force event ends and the scene is stable, what immediate duty still remains?',
    },
    {
      pattern: /^Which next step best keeps the investigation lawful as the scene develops\?$/i,
      value: 'As the scene develops, which next step best keeps the investigation lawful?',
    },
  ]

  const matched = replacements.find((entry) => entry.pattern.test(trimmed))
  return matched ? matched.value : trimmed
}

function buildExplanationLead(question: QuestionLike, correctChoice: string) {
  const prompt = question.prompt.trim()
  const quotedChoice = quoteChoice(correctChoice)

  const templates: Array<{ pattern: RegExp; build: () => string }> = [
    {
      pattern: /(which|what) (fact|facts|fact set|combination of facts).*(best|most strongly|most directly) support/i,
      build: () => `${quotedChoice} is the fact pattern that most directly supplies the legal support the question is asking for.`,
    },
    {
      pattern: /what mental state/i,
      build: () => `${quotedChoice} is the mental state officers would have to articulate under the tested TTS point.`,
    },
    {
      pattern: /(which|what) role best fits|classification best fits/i,
      build: () => `${quotedChoice} is the role or liability theory that best fits the conduct described.`,
    },
    {
      pattern: /primarily civil/i,
      build: () => `${quotedChoice} is the civil issue, while the other conduct in the scenario remains criminal.`,
    },
    {
      pattern: /(what|which).*(additional|separate).*(issue|offense|concern|theory|crime|classification)|most directly raises what additional|most relevant to what additional/i,
      build: () => `${quotedChoice} is the additional issue that officers should recognize from these facts.`,
    },
    {
      pattern: /(which|what).*(property crime|offense category|classification)|most directly supports which offense|most directly supports what offense|what offense should officers evaluate/i,
      build: () => `${quotedChoice} is the strongest offense conclusion under these facts.`,
    },
    {
      pattern: /what is the strongest arrest authority/i,
      build: () => `${quotedChoice} is the most defensible arrest authority once the facts are tied to the TTS standard.`,
    },
    {
      pattern: /what is the strongest search authority|what search authority most directly follows/i,
      build: () => `${quotedChoice} is the strongest search authority supported by the facts already in play.`,
    },
    {
      pattern: /what is the proper scope limitation|what is the proper scope of the officers’ actions|under that authority, what is the proper scope limitation/i,
      build: () => `${quotedChoice} correctly states how far officers may lawfully go once that doctrine applies.`,
    },
    {
      pattern: /which follow-up step would count as/i,
      build: () => `${quotedChoice} is the step that fits the definition being tested.`,
    },
    {
      pattern: /which next step best keeps the investigation lawful/i,
      build: () => `${quotedChoice} is the next step that keeps the investigation inside the proper legal lane.`,
    },
    {
      pattern: /which fact matters most in showing/i,
      build: () => `${quotedChoice} is the fact that most directly answers the issue being tested.`,
    },
    {
      pattern: /what immediate duty remains/i,
      build: () => `${quotedChoice} is the remaining duty officers still have once the immediate event is over.`,
    },
    {
      pattern: /what should officers do next|what should happen first|what is the best immediate investigative step|what is the best first-response approach|what response is most consistent|which tactic best reflects|which tactic best fits|which officer conduct best reflects|which action best preserves/i,
      build: () => `${quotedChoice} is the response that best fits the governing rule under these facts.`,
    },
    {
      pattern: /what rule applies|what is the correct rule|what is the best legal rule|what is the best rule|which statement is most accurate|what force principle is most accurate|what is the best legal conclusion|what is the strongest legal basis|what is the strongest legal significance|what is the strongest search-and-seizure significance/i,
      build: () => `${quotedChoice} is the strongest legal conclusion under the controlling doctrine.`,
    },
    {
      pattern: /which report detail is most important|which detail is most important|which documentation choice best|which documentation step best|what should officers carefully document|what should officers document|which facts are most important to articulate|which set of evidence best preserves|which evidence package best supports/i,
      build: () => `${quotedChoice} is the detail or evidence package that best protects the case for filing, review, and later testimony.`,
    },
    {
      pattern: /why are .* important|why is .* important|what is the best reason/i,
      build: () => `${quotedChoice} explains why that fact matters to the legal analysis.`,
    },
    {
      pattern: /what is the legal effect of/i,
      build: () => `${quotedChoice} is the legal effect created by those facts.`,
    },
    {
      pattern: /when would miranda become required|what is the key legal requirement|what must occur before custodial interrogation/i,
      build: () => `${quotedChoice} is the legal requirement officers must satisfy before moving forward.`,
    },
    {
      pattern: /what lawful option is most relevant|what is the officer’s correct role|how should officers treat .*statement/i,
      build: () => `${quotedChoice} is the most defensible legal approach on these facts.`,
    },
    {
      pattern: /best described as what|encounter at minimum|elevated the contact into a detention/i,
      build: () => `${quotedChoice} best describes the contact at that stage of the event.`,
    },
    {
      pattern: /what legal standard is required|what standard/i,
      build: () => `${quotedChoice} is the governing legal standard being tested.`,
    },
    {
      pattern: /what level/i,
      build: () => `${quotedChoice} is the classification level that best fits the tested offense.`,
    },
    {
      pattern: /how should officers classify|how should officers evaluate|how should officers respond|how should officers handle/i,
      build: () => `${quotedChoice} is the strongest officer conclusion under these facts.`,
    },
  ]

  const matched = templates.find((entry) => entry.pattern.test(prompt))
  return matched
    ? matched.build()
    : `${quotedChoice} is the strongest answer under these facts.`
}

function polishQuestion<TQuestion extends QuestionLike>(question: TQuestion): TQuestion {
  if (question.format === 'true_false') return question
  if (question.explanation.startsWith('Best answer: ')) {
    return {
      ...question,
      prompt: normalizePrompt(question.prompt),
    }
  }

  const correctChoice = question.choices[question.correctIndex] ?? ''
  const polishedExplanation = `Best answer: ${quoteChoice(correctChoice)}. ${buildExplanationLead(question, correctChoice)} ${question.explanation}`

  return {
    ...question,
    prompt: normalizePrompt(question.prompt),
    explanation: polishedExplanation,
  }
}

export function polishPracticeScenarios<TScenario extends ScenarioLike>(scenarios: TScenario[]): TScenario[] {
  return scenarios.map((scenario) => ({
    ...scenario,
    questions: scenario.questions.map((question) => polishQuestion(question)) as TScenario['questions'],
  }))
}
