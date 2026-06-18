const MAX_DELTA = 1000
const MIN_DELTA = -500
const MIN_SHOT_MS = 85
const DEFAULT_ROPE = 900
const DEFAULT_OVERTIME_SECONDS = 45
const SUDDEN_MULTIPLIER = 0.45
const SUDDEN_MIN = 260
const CORS = {
  'content-type': 'application/json; charset=utf-8',
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
  'access-control-allow-headers': 'content-type, authorization',
}

const json = (data, init = {}) => new Response(JSON.stringify(data), { ...init, headers: { ...CORS, ...(init.headers || {}) } })
const clamp = (value, min, max, fallback = 0) => Number.isFinite(Number(value)) ? Math.max(min, Math.min(max, Number(value))) : fallback
const clean = (value, fallback = '') => String(value || fallback).trim().replace(/[^a-zA-Z0-9_:@.\-]/g, '').slice(0, 96)
const cleanDisplay = (value, fallback = '') => String(value || fallback).trim().replace(/[^a-zA-Z0-9_:@.\-&()/# ]/g, '').replace(/\s+/g, ' ').slice(0, 96)
const parse = (value) => { try { const parsed = JSON.parse(String(value)); return parsed && typeof parsed === 'object' ? parsed : null } catch { return null } }
const send = (socket, payload) => { try { socket.send(JSON.stringify(payload)); return true } catch { return false } }

export class RopeBlasterRoom {
  constructor(state, env) {
    this.state = state
    this.env = env
    this.sessions = new Set()
    this.players = new Map()
    this.seq = 0
    this.startedAt = 0
    this.settings = { mode: 'timed', durationSeconds: 30, ropeLimit: DEFAULT_ROPE, powerupsEnabled: false, overtimeEnabled: true, overtimeAfterSeconds: DEFAULT_OVERTIME_SECONDS }
  }

  async fetch(request) {
    const url = new URL(request.url)
    if (request.method === 'OPTIONS') return json({ ok: true })
    if (request.headers.get('Upgrade') !== 'websocket') return json({ ok: true, room: roomIdFromUrl(url), sessions: this.sessions.size, state: this.statePayload('http') })

    const roomId = roomIdFromUrl(url)
    const userId = clean(url.searchParams.get('userId'))
    if (!roomId || !userId) return json({ error: 'roomId and userId are required' }, { status: 400 })

    const pair = new WebSocketPair()
    const [client, server] = Object.values(pair)
    server.accept()

    const session = { socket: server, userId, roomId, displayName: clean(url.searchParams.get('name'), 'Player') }
    this.sessions.add(session)
    this.ensurePlayer(userId, session.displayName)
    server.addEventListener('message', (event) => this.onMessage(session, event.data))
    server.addEventListener('close', () => this.close(session))
    server.addEventListener('error', () => this.close(session))
    send(server, { type: 'hello', roomId, userId, serverNow: Date.now(), state: this.statePayload('hello') })
    this.broadcast({ type: 'presence', reason: 'join', userId, connected: this.sessions.size, serverNow: Date.now(), sequence: this.seq }, session)
    return new Response(null, { status: 101, webSocket: client })
  }

  onMessage(session, raw) {
    const msg = parse(raw)
    if (!msg) return send(session.socket, { type: 'error', code: 'bad_json', serverNow: Date.now() })
    const now = Date.now()

    if (msg.type === 'ping') return send(session.socket, { type: 'pong', clientSentAt: Number(msg.clientSentAt) || null, serverNow: now, sequence: this.seq })

    if (msg.type === 'join' || msg.type === 'sync') {
      this.applySettings(msg.settings)
      const startedAt = Number(msg.startedAt)
      if (Number.isFinite(startedAt) && startedAt > 0 && (!this.startedAt || startedAt < this.startedAt)) this.startedAt = startedAt
      this.ensurePlayer(session.userId, clean(msg.displayName, session.displayName))
      return send(session.socket, this.statePayload('sync'))
    }

    if (msg.type === 'shot') return this.applyShot(session, msg, now)
    return send(session.socket, { type: 'error', code: 'unknown_type', serverNow: now })
  }

  applySettings(settings = {}) {
    this.settings = {
      mode: settings.mode === 'death' ? 'death' : 'timed',
      durationSeconds: clamp(settings.durationSeconds, 15, 300, this.settings.durationSeconds),
      ropeLimit: clamp(settings.ropeLimit, 300, 3000, this.settings.ropeLimit),
      powerupsEnabled: Boolean(settings.powerupsEnabled),
      overtimeEnabled: settings.overtimeEnabled !== false,
      overtimeAfterSeconds: clamp(settings.overtimeAfterSeconds, 45, 90, this.settings.overtimeAfterSeconds),
    }
  }

  ensurePlayer(userId, displayName = 'Player') {
    const id = clean(userId)
    if (!this.players.has(id)) this.players.set(id, { userId: id, displayName: clean(displayName, 'Player'), score: 0, currentRound: 1, totalTimeMs: 0, fastestRoundMs: 0, lastShotAt: 0, lastSentAt: 0, shots: 0 })
    else if (displayName) this.players.get(id).displayName = clean(displayName, this.players.get(id).displayName)
    return this.players.get(id)
  }

  applyShot(session, msg, now) {
    const player = this.ensurePlayer(session.userId, session.displayName)
    const sentAt = Number(msg.sentAt) || now
    const round = Math.max(1, Math.round(Number(msg.round) || player.currentRound || 1))
    const currentRound = Math.max(round + 1, Math.round(Number(msg.currentRound) || round + 1))
    if (now - player.lastShotAt < MIN_SHOT_MS) return send(session.socket, { type: 'rate_limited', retryAfterMs: MIN_SHOT_MS - (now - player.lastShotAt), serverNow: now, sequence: this.seq })
    if (sentAt <= player.lastSentAt && round <= player.currentRound - 1) return send(session.socket, { type: 'ignored', reason: 'stale_shot', serverNow: now, sequence: this.seq })

    const elapsedMs = clamp(msg.elapsedMs, 0, 300000, 0)
    const delta = clamp(msg.delta, MIN_DELTA, MAX_DELTA, 0)
    player.score += delta
    player.currentRound = Math.max(player.currentRound, currentRound)
    player.totalTimeMs += elapsedMs
    player.fastestRoundMs = elapsedMs > 0 ? (player.fastestRoundMs > 0 ? Math.min(player.fastestRoundMs, elapsedMs) : elapsedMs) : player.fastestRoundMs
    player.lastShotAt = now
    player.lastSentAt = Math.max(player.lastSentAt, sentAt)
    player.shots += 1
    this.seq += 1
    this.broadcast(this.statePayload('shot', {
      userId: player.userId,
      delta,
      round,
      currentRound: player.currentRound,
      correct: Boolean(msg.correct),
      eventDelayMs: Math.max(0, now - sentAt),
      clientSentAt: sentAt,
      powerupKey: clean(msg.powerupKey),
      powerupEffect: clean(msg.powerupEffect),
      disguiseCode: cleanDisplay(msg.disguiseCode),
      targetIndex: Number.isFinite(Number(msg.targetIndex)) ? Math.max(0, Math.min(12, Math.round(Number(msg.targetIndex)))) : null,
      targetLabel: cleanDisplay(msg.targetLabel),
    }))
  }

  statePayload(reason, lastEvent = null) {
    const now = Date.now()
    const players = Array.from(this.players.values()).map(({ userId, displayName, score, currentRound, totalTimeMs, fastestRoundMs, shots }) => ({ userId, displayName, score, currentRound, totalTimeMs, fastestRoundMs, shots }))
    const scores = players.map((p) => p.score)
    const gap = scores.length ? Math.max(...scores) - Math.min(...scores) : 0
    const suddenDeath = Boolean(this.settings.overtimeEnabled && this.startedAt && now - this.startedAt >= this.settings.overtimeAfterSeconds * 1000)
    const effectiveRopeLimit = suddenDeath ? Math.max(SUDDEN_MIN, Math.round(this.settings.ropeLimit * SUDDEN_MULTIPLIER)) : this.settings.ropeLimit
    return { type: 'state', reason, serverNow: now, sequence: this.seq, startedAt: this.startedAt || null, settings: this.settings, suddenDeath, ropeLimit: this.settings.ropeLimit, effectiveRopeLimit, ropeRemainingPercent: Math.max(0, Math.round(100 - gap / Math.max(1, effectiveRopeLimit) * 100)), ko: gap >= effectiveRopeLimit, connected: this.sessions.size, players, lastEvent }
  }

  broadcast(payload, except = null) {
    const dead = []
    for (const session of this.sessions) if (session !== except && !send(session.socket, payload)) dead.push(session)
    dead.forEach((session) => this.close(session, false))
  }

  close(session, notify = true) {
    if (!this.sessions.delete(session)) return
    if (notify) this.broadcast({ type: 'presence', reason: 'leave', userId: session.userId, connected: this.sessions.size, serverNow: Date.now(), sequence: this.seq })
  }
}

function roomIdFromUrl(url) {
  const parts = url.pathname.split('/').filter(Boolean)
  return parts[0] === 'room' && parts[1] ? clean(decodeURIComponent(parts[1])) : clean(url.searchParams.get('roomId'))
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url)
    if (request.method === 'OPTIONS') return json({ ok: true })
    if (url.pathname === '/health') return json({ ok: true, service: 'leo-rope-blaster', serverNow: Date.now() })
    if (url.pathname === '/latency') return json({ ok: true, serverNow: Date.now(), edge: request.cf?.colo || null })
    const roomId = roomIdFromUrl(url)
    if (!roomId) return json({ ok: true, service: 'leo-rope-blaster', usage: '/room/:roomId websocket' })
    return env.ROPE_BLASTER_ROOMS.get(env.ROPE_BLASTER_ROOMS.idFromName(roomId)).fetch(request)
  },
}
