import type { PracticeTestScenario } from './practiceTests'

export const TMAS1_LD_NUMBERS = ['5', '15', '16', '20', '39'] as const

const tmas1LdNumberSet = new Set<string>(TMAS1_LD_NUMBERS)

function replaceModuleName(value: string) {
  return value.replace(/TMAS\s*2/gi, 'TMAS 1')
}

export function buildTmas1Scenarios(sourceScenarios: PracticeTestScenario[]): PracticeTestScenario[] {
  const tmas1Scenarios: PracticeTestScenario[] = []

  sourceScenarios.forEach((sourceScenario) => {
    const matchingQuestions = sourceScenario.questions.filter((question) => tmas1LdNumberSet.has(question.ldNumber))
    if (matchingQuestions.length === 0) return

    const scenarioId = `tmas1-practice-${String(tmas1Scenarios.length + 1).padStart(2, '0')}`
    const questions = matchingQuestions.map((question, index) => ({
      ...question,
      id: `${scenarioId}-q${index + 1}`,
      objective: replaceModuleName(question.objective),
      prompt: replaceModuleName(question.prompt),
      explanation: replaceModuleName(question.explanation),
    }))
    const ldNumbers = Array.from(new Set(questions.map((question) => question.ldNumber)))
      .sort((left, right) => Number(left) - Number(right))

    tmas1Scenarios.push({
      ...sourceScenario,
      id: scenarioId,
      title: replaceModuleName(sourceScenario.title),
      stem: replaceModuleName(sourceScenario.stem),
      ldNumbers,
      questions,
    })
  })

  return tmas1Scenarios
}
