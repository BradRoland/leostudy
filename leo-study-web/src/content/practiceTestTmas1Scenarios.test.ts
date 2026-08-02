import assert from 'node:assert/strict'
import test from 'node:test'
import { buildTmas1Scenarios, TMAS1_LD_NUMBERS } from './practiceTestTmas1Scenarios.ts'
import type { PracticeTestQuestion, PracticeTestScenario } from './practiceTests'

function makeQuestion(id: string, ldNumber: string, format: PracticeTestQuestion['format'] = 'multiple_choice'): PracticeTestQuestion {
  return {
    id,
    ldNumber,
    ttsRefs: [`${ldNumber}.1A`],
    objective: 'TMAS 2 tested objective',
    prompt: 'Which TMAS 2 answer is best?',
    choices: format === 'true_false' ? ['True', 'False'] : ['One', 'Two', 'Three', 'Four'],
    correctIndex: 0,
    explanation: 'TMAS 2 explanation.',
    format,
  }
}

test('builds an independent TMAS 1 bank containing only the five Comprehensive Exam 1 LDs', () => {
  const source: PracticeTestScenario[] = [
    {
      id: 'tmas2-source-1',
      title: 'TMAS 2 mixed scenario',
      stem: 'A TMAS 2 scenario stem.',
      ldNumbers: ['5', '6', '15'],
      questions: [makeQuestion('q1', '5'), makeQuestion('q2', '6'), makeQuestion('q3', '15', 'true_false')],
    },
    {
      id: 'tmas2-source-2',
      title: 'Untested LD only',
      stem: 'This scenario should be removed.',
      ldNumbers: ['7'],
      questions: [makeQuestion('q4', '7')],
    },
  ]

  const result = buildTmas1Scenarios(source)

  assert.equal(result.length, 1)
  assert.equal(result[0]?.id, 'tmas1-practice-01')
  assert.deepEqual(result[0]?.ldNumbers, ['5', '15'])
  assert.deepEqual(result[0]?.questions.map((question) => question.ldNumber), ['5', '15'])
  assert.deepEqual(result[0]?.questions.map((question) => question.id), ['tmas1-practice-01-q1', 'tmas1-practice-01-q2'])
  assert.equal(result[0]?.questions[1]?.format, 'true_false')
  assert.equal(result[0]?.questions.every((question) => question.ttsRefs.length > 0), true)
  assert.equal(result[0]?.title.includes('TMAS 2'), false)
  assert.equal(result[0]?.stem.includes('TMAS 2'), false)
  assert.deepEqual(TMAS1_LD_NUMBERS, ['5', '15', '16', '20', '39'])
})
