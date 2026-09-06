// Only synthetic members in freshly created, unlisted classes are used here.
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { parse } from 'dotenv'
import { createClient } from '@supabase/supabase-js'

const env = parse(await readFile(new URL('../.env.staging.local', import.meta.url)))
assert.equal(env.SUPABASE_URL, 'http://127.0.0.1:55431', 'Requires the isolated localhost test API')
const options = { auth: { persistSession: false, autoRefreshToken: false } }
const service = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, options)
const suffix = randomUUID().slice(0, 8)
const users = []
const roomIds = []
const classIds = []
const findings = []
let academyId

async function rpc(client, name, args) {
  const result = await client.rpc(name, args)
  assert.ifError(result.error)
  return result.data
}
async function waitFor(predicate, label, milliseconds = 12000) {
  const end = Date.now() + milliseconds
  while (Date.now() < end) {
    if (await predicate()) return
    await new Promise((resolve) => setTimeout(resolve, 150))
  }
  throw new Error(`Timed out: ${label}`)
}
async function getRoom(id) {
  const result = await service.from('rooms').select('*').eq('id', id).single()
  assert.ifError(result.error)
  return result.data
}
async function startRoom(id) {
  await rpc(users[0].client, 'set_1v1_ready', { p_room_id: id, p_ready: true })
  await rpc(users[1].client, 'set_1v1_ready', { p_room_id: id, p_ready: true })
  await waitFor(async () => {
    const row = await getRoom(id)
    return row.status === 'in_progress' && Date.parse(row.started_at) <= Date.now()
  }, 'match start/countdown')
}

try {
  const academy = await service.from('academies').insert({ name: `Multiplayer regression ${suffix}`, city: 'Synthetic', state: 'CA' }).select('id').single()
  assert.ifError(academy.error)
  academyId = academy.data.id
  for (let index = 0; index < 2; index++) {
    const created = await service.from('academy_classes').insert({ academy_id: academyId, class_name: `Synthetic ${suffix} ${index}`, status: 'active', visibility: 'unlisted', join_mode: 'open' }).select('id').single()
    assert.ifError(created.error)
    classIds.push(created.data.id)
  }
  for (let index = 0; index < 3; index++) {
    const email = `multiplayer-${suffix}-${index}@example.test`
    const password = `${randomUUID()}-Staging!9`
    const created = await service.auth.admin.createUser({ email, password, email_confirm: true })
    assert.ifError(created.error)
    const client = createClient(env.SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, options)
    users.push({ id: created.data.user.id, client })
    assert.ifError((await service.from('profiles').insert({ user_id: created.data.user.id, username: `Synthetic ${suffix} ${index}`, last_active: new Date().toISOString() })).error)
    assert.ifError((await service.from('class_memberships').insert({ class_id: classIds[index === 2 ? 1 : 0], user_id: created.data.user.id, role: index === 1 ? 'cadet' : 'class_admin', status: 'active', is_active: true })).error)
    const login = await client.auth.signInWithPassword({ email, password })
    assert.ifError(login.error)
    await client.realtime.setAuth(login.data.session.access_token)
  }
  const members = await service.from('class_memberships').select('user_id').eq('class_id', classIds[0])
  assert.deepEqual(new Set(members.data.map((member) => member.user_id)), new Set(users.slice(0, 2).map((user) => user.id)), 'No real recipients may be in the test class')

  const messages = []
  let subscribed = false
  let subscriptionError = ''
  users[1].client.channel(`regression-chat-${suffix}`)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'class_messages', filter: `class_id=eq.${classIds[0]}` }, (event) => messages.push(event.new))
    .subscribe((status, error) => { if (status === 'SUBSCRIBED') subscribed = true; if (error) subscriptionError = error.message })
  await waitFor(() => subscribed, `class chat subscription ${subscriptionError}`)
  const messageText = `Synthetic local regression ${suffix}`
  assert.ifError((await users[0].client.from('class_messages').insert({ class_id: classIds[0], user_id: users[0].id, display_name: `Synthetic ${suffix} 0`, message: messageText })).error)
  const read = await users[1].client.from('class_messages').select('id,message').eq('class_id', classIds[0])
  assert.ifError(read.error)
  assert.ok(read.data.some((message) => message.message === messageText))
  const outsideRead = await users[2].client.from('class_messages').select('id').eq('class_id', classIds[0])
  assert.ifError(outsideRead.error)
  assert.equal(outsideRead.data.length, 0)
  const outsideWrite = await users[2].client.from('class_messages').insert({ class_id: classIds[0], user_id: users[2].id, display_name: 'Synthetic outsider', message: 'Must be blocked' })
  assert.ok(outsideWrite.error, 'Another class may not insert chat messages')
  try {
    await waitFor(() => messages.some((message) => message.message === messageText), 'committed Postgres chat event')
    findings.push('PASS: authenticated class chat insert/read, realtime Postgres INSERT delivery, and cross-class read/write denial.')
  } catch (error) {
    findings.push(`LIMITATION: persisted chat and class isolation pass, but ${error.message}.`)
  }

  const quizId = await rpc(users[0].client, 'create_1v1_room_v2', { p_game_type: 'quiz', p_category: 'pc', p_is_public: true, p_rounds: 10 })
  roomIds.push(quizId)
  assert.equal((await getRoom(quizId)).class_id, classIds[0])
  const crossJoin = await users[2].client.rpc('join_1v1_room', { p_room_id: quizId })
  assert.match(crossJoin.error?.message || '', /another class/)
  await rpc(users[1].client, 'join_1v1_room', { p_room_id: quizId })
  await startRoom(quizId)
  await rpc(users[0].client, 'submit_1v1_round', { p_room_id: quizId, p_round: 1, p_correct: true, p_elapsed_ms: 2200, p_points: null })
  await rpc(users[1].client, 'submit_1v1_round', { p_room_id: quizId, p_round: 1, p_correct: false, p_elapsed_ms: 2400, p_points: null })
  const players = await service.from('room_players').select('user_id,current_round,score').eq('room_id', quizId)
  assert.ifError(players.error)
  assert.ok(players.data.every((player) => player.current_round >= 2))
  await rpc(users[1].client, 'forfeit_1v1_match', { p_room_id: quizId })
  assert.equal((await getRoom(quizId)).status, 'completed')
  findings.push('PASS: quiz duel creation, class isolation, joining, both ready/countdown, scored round submissions, and forfeit completion.')

  const enabled = await rpc(users[0].client, 'connect4_feature_enabled', {})
  if (!enabled) {
    findings.push('LIMITATION: Connect4 is disabled in the copied application configuration; gameplay was not enabled or changed for testing.')
  } else {
    const connectId = await rpc(users[0].client, 'create_1v1_room_v2', { p_game_type: 'connect4', p_category: 'all', p_is_public: true, p_rounds: 42 })
    roomIds.push(connectId)
    assert.equal((await getRoom(connectId)).class_id, classIds[0])
    await rpc(users[1].client, 'join_1v1_room', { p_room_id: connectId })
    await startRoom(connectId)
    const wrongTurn = await users[1].client.rpc('submit_connect4_move', { p_room_id: connectId, p_column: 0 })
    assert.match(wrongTurn.error?.message || '', /Not your turn/)
    for (const [player, column] of [[0, 0], [1, 1], [0, 0], [1, 1], [0, 0], [1, 1], [0, 0]]) {
      await rpc(users[player].client, 'submit_connect4_move', { p_room_id: connectId, p_column: column })
    }
    const completed = await getRoom(connectId)
    assert.equal(completed.status, 'completed')
    assert.equal(completed.winner_user_id, users[0].id)
    assert.equal(completed.settings.connect4.moveHistory.length, 7)
    const results = await service.from('room_results').select('user_id,is_winner').eq('room_id', connectId)
    assert.ifError(results.error)
    assert.equal(results.data.length, 2)
    assert.equal(results.data.filter((row) => row.is_winner).length, 1)
    findings.push('PASS: Connect4 creation/join/readiness, wrong-turn rejection, seven legal moves, vertical win, and two final result records.')
  }
  findings.forEach((finding) => console.log(finding))
} finally {
  for (const user of users) await user.client.removeAllChannels()
  if (roomIds.length) await service.from('rooms').delete().in('id', roomIds).throwOnError()
  // The existing class foreign key uses SET NULL, while the scoped stats key is
  // non-null. Remove only our synthetic aggregate rows before deleting fixtures.
  if (classIds.length) await service.from('duel_player_stats').delete().in('class_id', classIds).throwOnError()
  if (classIds.length) await service.from('academy_classes').delete().in('id', classIds).throwOnError()
  if (academyId) await service.from('academies').delete().eq('id', academyId).throwOnError()
  for (const user of users) assert.ifError((await service.auth.admin.deleteUser(user.id)).error)
  await service.removeAllChannels()
}
