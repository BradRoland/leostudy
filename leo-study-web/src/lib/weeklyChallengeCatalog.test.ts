import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

type WeeklyChallenge = {
  id: string
  title: string
  description: string
  position: number
  metric: string
  target: number
  xp: number
  game_mode: string | null
  code_filter: string | null
  min_accuracy: number
  min_answers: number
  practice_path: string
  category: string
  balanced_correct: number
}

const catalog = JSON.parse(
  readFileSync(new URL('../data/weeklyChallengeCatalog.json', import.meta.url), 'utf8'),
) as WeeklyChallenge[]

const practiceRoutes = new Map([
  [null, '/study/test'],
  ['study_test', '/study/test'],
  ['matching', '/games/matching'],
  ['speed', '/games/speed'],
  ['blaster', '/games/blaster'],
])

test('weekly pool contains 100 distinct goals across free practice modes, code sets, and study habits', () => {
  assert.equal(catalog.length, 100)
  assert.equal(new Set(catalog.map((goal) => goal.id)).size, 100)
  assert.equal(new Set(catalog.map((goal) => goal.title.toLowerCase())).size, 100)
  assert.equal(new Set(catalog.map((goal) => JSON.stringify([
    goal.metric, goal.target, goal.game_mode, goal.code_filter,
    goal.min_accuracy, goal.min_answers, goal.balanced_correct,
  ]))).size, 100, 'renaming a duplicate goal does not create a new challenge')
  assert.deepEqual(catalog.map((goal) => goal.position), Array.from({ length: 100 }, (_, index) => index))
  assert.deepEqual(new Set(catalog.map((goal) => goal.game_mode)), new Set(practiceRoutes.keys()))
  assert.deepEqual(new Set(catalog.map((goal) => goal.code_filter)), new Set([null, 'penal', 'hs', 'vehicle']))
  assert.deepEqual(new Set(catalog.map((goal) => goal.metric)), new Set([
    'correct', 'sessions', 'accurate', 'perfect', 'answers', 'days',
    'modes', 'filters', 'comeback', 'improve', 'accurate_correct', 'balanced',
  ]))
  assert.ok(catalog.filter((goal) => goal.metric === 'days').length >= 5)
})

test('weekly targets are achievable and each goal leads to an eligible free practice route', () => {
  const targetBounds: Record<string, [number, number]> = {
    correct: [60, 150], answers: [100, 200], sessions: [5, 12],
    accurate: [2, 5], perfect: [2, 5], days: [3, 5], modes: [2, 4],
    filters: [2, 3], comeback: [1, 1], improve: [1, 1],
    accurate_correct: [60, 150], balanced: [2, 3],
  }
  for (const goal of catalog) {
    assert.match(goal.id, /^weekly_[a-z0-9_]+$/)
    assert.equal(goal.practice_path, practiceRoutes.get(goal.game_mode), goal.id)
    assert.equal(goal.min_answers, 5, goal.id)
    assert.ok(Number.isInteger(goal.xp) && goal.xp >= 180 && goal.xp <= 420, goal.id)
    assert.ok(Number.isInteger(goal.target), goal.id)
    const [minimum, maximum] = targetBounds[goal.metric]
    assert.ok(goal.target >= minimum && goal.target <= maximum, goal.id)
    assert.equal(goal.balanced_correct, goal.metric === 'balanced' ? 30 : 10, goal.id)
    assert.equal(goal.min_accuracy, ['accurate', 'accurate_correct'].includes(goal.metric) ? 80 : 0, goal.id)
  }
})

test('goal descriptions disclose the time window, qualifying sessions, and special counting rules', () => {
  const codeNames = new Map([
    ['penal', 'Penal Code'], ['hs', 'Health & Safety Code'], ['vehicle', 'Vehicle Code'],
  ])
  for (const goal of catalog) {
    assert.ok(goal.description.length >= 75, goal.id)
    assert.match(goal.description, /this week/, goal.id)
    assert.match(goal.description, /at least five answers/, goal.id)
    assert.ok(goal.category.length > 0 && goal.title.length <= 40, goal.id)
    if (goal.code_filter) {
      assert.ok(goal.description.includes(`${codeNames.get(goal.code_filter)} selected`), goal.id)
    }
    if (goal.metric === 'days') {
      assert.match(goal.description, /different UTC days/, goal.id)
      assert.match(goal.description, /do not need to be consecutive/, goal.id)
    }
    if (['filters', 'balanced'].includes(goal.metric)) {
      assert.match(goal.description, /Mixed All Codes sessions do not count/, goal.id)
    }
    if (['comeback', 'improve'].includes(goal.metric)) {
      assert.match(goal.description, /later|earlier/, goal.id)
      assert.match(goal.description, /same mode and code set/, goal.id)
    }
    if (goal.metric === 'balanced') {
      assert.match(goal.description, /at least 30 correct answers in each/, goal.id)
    }
  }
})

test('weekly database catalog matches the reviewed source exactly', () => {
  const sql = readFileSync(new URL('../../supabase/migrations/20260907192902_rotating_weekly_challenge_catalog.sql', import.meta.url), 'utf8')
  assert.deepEqual(JSON.parse(sql.split('$catalog$')[1]), catalog)
})
