import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const migrationSql = readFileSync(
  new URL('../supabase/migrations/20260802040234_copy_departments_and_promote_first_member.sql', import.meta.url),
  'utf8',
)

test('copies the full Class 180 department catalog into Classes 181 and 182', () => {
  assert.match(migrationSql, /lower\(trim\(class_name\)\) = 'class 180'/)
  assert.match(migrationSql, /lower\(trim\(class_name\)\) in \('class 181', 'class 182'\)/)
  assert.match(migrationSql, /source_departments\.department_type/)
  assert.match(migrationSql, /source_departments\.city/)
  assert.match(migrationSql, /source_departments\.county/)
  assert.match(migrationSql, /on conflict \(class_id, lower\(name\)\) do update/)
})

test('serializes first joins and promotes exactly the first active member', () => {
  assert.match(migrationSql, /for update/)
  assert.match(migrationSql, /before insert or update of status, is_active/)
  assert.match(migrationSql, /existing_membership\.id is distinct from new\.id/)
  assert.match(migrationSql, /new\.role := 'class_admin'/)
  assert.match(migrationSql, /revoke all on function public\.promote_first_current_class_member\(\) from public, anon, authenticated/)
})

test('backfills the earliest current member when a class has no admin yet', () => {
  assert.match(migrationSql, /row_number\(\) over/)
  assert.match(migrationSql, /order by membership\.joined_at, membership\.created_at, membership\.id/)
  assert.match(migrationSql, /existing_admin\.role = 'class_admin'/)
  assert.match(migrationSql, /candidate\.join_order = 1/)
  assert.match(migrationSql, /first_member_promoted/)
})
