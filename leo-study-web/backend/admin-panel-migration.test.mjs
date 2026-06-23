import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const migrationSql = [
  readFileSync(
  new URL('../supabase/migrations/20260622184500_owner_admin_panel.sql', import.meta.url),
  'utf8',
  ),
  readFileSync(
    new URL('../supabase/migrations/20260623113704_owner_edit_class_details.sql', import.meta.url),
    'utf8',
  ),
].join('\n')

test('owner admin panel migration exposes required owner RPCs', () => {
  for (const functionName of [
    'owner_create_class',
    'owner_update_class',
    'owner_list_class_members',
    'owner_set_class_member_role',
    'owner_remove_class_member',
    'owner_timeout_class_member',
  ]) {
    assert.match(migrationSql, new RegExp(`create or replace function public\\.${functionName}\\b`))
    assert.match(migrationSql, new RegExp(`grant execute on function public\\.${functionName}`))
  }
})

test('owner admin panel migration records audit events for class and member actions', () => {
  for (const eventType of ['owner_create_class', 'owner_update_class', 'owner_set_member_role', 'owner_remove_member', 'owner_timeout_member']) {
    assert.match(migrationSql, new RegExp(eventType))
  }
})
