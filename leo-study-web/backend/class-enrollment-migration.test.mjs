import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const migrationSql = readFileSync(
  new URL('../supabase/migrations/20260802030059_add_classes_181_182_and_isolate_leaderboards.sql', import.meta.url),
  'utf8',
)

test('seeds only the current onboarding classes and retires Class 180 enrollment', () => {
  assert.match(migrationSql, /values \('Class 181'\), \('Class 182'\)/)
  assert.match(migrationSql, /lower\(trim\(class_name\)\) = 'class 180'/)
  assert.match(migrationSql, /set visibility = 'unlisted'/)
  assert.match(migrationSql, /Class 180 is closed to new enrollment/)
  assert.doesNotMatch(migrationSql, /\b(?:delete|truncate)\s+from\s+public\.(?:leaderboard|weekly_leaderboard|class_memberships)\b/i)
})

test('guards every user enrollment RPC with the 181 and 182 allowlist', () => {
  for (const functionName of [
    'join_class_directly',
    'request_to_join_class',
    'lookup_class_invite',
    'accept_class_invite',
    'approve_class_join_request',
  ]) {
    const functionStart = migrationSql.indexOf(`create or replace function public.${functionName}`)
    assert.notEqual(functionStart, -1, `${functionName} should be replaced`)
    const nextFunction = migrationSql.indexOf('create or replace function public.', functionStart + 1)
    const functionSql = migrationSql.slice(functionStart, nextFunction === -1 ? undefined : nextFunction)
    assert.match(functionSql, /public\.is_current_enrollment_class/)
  }
})

test('limits weekly and all-time leaderboard reads and writes to the active class', () => {
  assert.match(migrationSql, /create policy leaderboard_read_active_class/)
  assert.match(migrationSql, /create policy weekly_leaderboard_read_active_class/)
  assert.match(migrationSql, /create policy duel_player_stats_read_active_class/)
  assert.match(migrationSql, /class_id = public\.get_active_class_id\(\(select auth\.uid\(\)\)\)/)
})
