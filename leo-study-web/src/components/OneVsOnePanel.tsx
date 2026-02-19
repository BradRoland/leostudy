import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'

type DuelGameType = 'quiz' | 'matching'
type DuelCategory = 'all' | 'pc' | 'vc' | 'hs' | 'scenarios'
type DuelRoomStatus = 'waiting' | 'in_progress' | 'completed' | 'cancelled'

type DuelRoomRow = {
  id: string
  host_user_id: string
  game_type: DuelGameType
  category: DuelCategory
  is_public: boolean
  join_code: string | null
  rounds: number
  question_set: unknown
  status: DuelRoomStatus
  current_round: number
  winner_user_id: string | null
  created_at: string
}

type DuelRoomPlayerRow = {
  id: string
  room_id: string
  user_id: string
  slot_no: number
  is_ready: boolean
  score: number
  total_time_ms: number
  current_round: number
  last_seen: string
}

type DuelRoomResultRow = {
  id: string
  room_id: string
  user_id: string
  score: number
  total_time_ms: number
  placement: number
  is_winner: boolean
}

type LobbyRoomItem = {
  id: string
  game_type: DuelGameType
  category: DuelCategory
  created_at: string
  host_user_id: string
  player_count: number
}

type QuizRoundPayload = {
  round: number
  prompt: string
  choices: string[]
  correctIndex: number
  explanation?: string
  sourceLabel?: string
}

type MatchingPairPayload = {
  pairId: string
  left: string
  right: string
}

type MatchingRoundPayload = {
  round: number
  pairs: MatchingPairPayload[]
}

type MatchingOption = {
  pairId: string
  text: string
}

const duelCategoryOptions: Array<{ value: DuelCategory; label: string; quizOnly?: boolean }> = [
  { value: 'all', label: 'ALL' },
  { value: 'pc', label: 'PC' },
  { value: 'vc', label: 'VC' },
  { value: 'hs', label: 'HS' },
  { value: 'scenarios', label: 'SCENARIOS', quizOnly: true },
]

function shuffle<T>(items: T[]) {
  const copy = [...items]
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(Math.random() * (index + 1))
    ;[copy[index], copy[swap]] = [copy[swap], copy[index]]
  }
  return copy
}

function formatElapsed(ms: number) {
  const safe = Math.max(0, Number.isFinite(ms) ? ms : 0)
  const seconds = Math.round(safe / 1000)
  return `${seconds}s`
}

function isQuizRound(value: unknown): value is QuizRoundPayload {
  if (!value || typeof value !== 'object') return false
  const row = value as Partial<QuizRoundPayload>
  return typeof row.round === 'number' && typeof row.prompt === 'string' && Array.isArray(row.choices) && typeof row.correctIndex === 'number'
}

function isMatchingRound(value: unknown): value is MatchingRoundPayload {
  if (!value || typeof value !== 'object') return false
  const row = value as Partial<MatchingRoundPayload>
  return typeof row.round === 'number' && Array.isArray(row.pairs)
}

export function OneVsOnePanel(props: { currentUserId: string; currentUsername: string }) {
  const { currentUserId, currentUsername } = props

  const [selectedGameType, setSelectedGameType] = useState<DuelGameType>('quiz')
  const [selectedCategory, setSelectedCategory] = useState<DuelCategory>('all')
  const [isPublicRoom, setIsPublicRoom] = useState(true)

  const [publicRooms, setPublicRooms] = useState<LobbyRoomItem[]>([])
  const [joinCodeInput, setJoinCodeInput] = useState('')
  const [roomId, setRoomId] = useState<string | null>(null)

  const [room, setRoom] = useState<DuelRoomRow | null>(null)
  const [players, setPlayers] = useState<DuelRoomPlayerRow[]>([])
  const [results, setResults] = useState<DuelRoomResultRow[]>([])
  const [usernameByUserId, setUsernameByUserId] = useState<Record<string, string>>({})
  const [presenceUserIds, setPresenceUserIds] = useState<string[]>([])

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const [roundStartedAt, setRoundStartedAt] = useState<number>(0)
  const [submittingRound, setSubmittingRound] = useState(false)
  const [quizChoice, setQuizChoice] = useState<number | null>(null)
  const [quizLocked, setQuizLocked] = useState(false)

  const [matchLeftOptions, setMatchLeftOptions] = useState<MatchingOption[]>([])
  const [matchRightOptions, setMatchRightOptions] = useState<MatchingOption[]>([])
  const [selectedLeftPairId, setSelectedLeftPairId] = useState<string | null>(null)
  const [selectedRightPairId, setSelectedRightPairId] = useState<string | null>(null)
  const [matchedPairIds, setMatchedPairIds] = useState<string[]>([])
  const [matchingMistakes, setMatchingMistakes] = useState(0)
  const [matchingRoundPoints, setMatchingRoundPoints] = useState(0)
  const [matchingSubmitted, setMatchingSubmitted] = useState(false)

  const isSignedIn = currentUserId.trim().length > 0

  const loadPublicRooms = useCallback(async () => {
    if (!supabase || !isSignedIn) return
    const { data, error: rpcError } = await supabase.rpc('list_public_1v1_rooms')
    if (rpcError) {
      setError(rpcError.message || 'Could not load public rooms.')
      return
    }
    const mapped = (Array.isArray(data) ? data : []).map((row) => ({
      id: String((row as Record<string, unknown>).id || ''),
      game_type: String((row as Record<string, unknown>).game_type || 'quiz') as DuelGameType,
      category: String((row as Record<string, unknown>).category || 'all') as DuelCategory,
      created_at: String((row as Record<string, unknown>).created_at || ''),
      host_user_id: String((row as Record<string, unknown>).host_user_id || ''),
      player_count: Number((row as Record<string, unknown>).player_count || 0),
    }))
      .filter((row) => row.id)
    setPublicRooms(mapped)
  }, [isSignedIn])

  const refreshRoomSnapshot = useCallback(async () => {
    if (!supabase || !roomId || !isSignedIn) return

    const [{ data: roomRow, error: roomError }, { data: playerRows, error: playersError }, { data: resultRows, error: resultsError }] = await Promise.all([
      supabase.from('rooms').select('*').eq('id', roomId).maybeSingle(),
      supabase.from('room_players').select('*').eq('room_id', roomId).order('slot_no', { ascending: true }),
      supabase.from('room_results').select('*').eq('room_id', roomId).order('placement', { ascending: true }),
    ])

    if (roomError) {
      setError(roomError.message || 'Could not load room.')
      return
    }
    if (playersError) {
      setError(playersError.message || 'Could not load players.')
      return
    }
    if (resultsError) {
      setError(resultsError.message || 'Could not load results.')
      return
    }

    if (!roomRow) {
      setRoom(null)
      setPlayers([])
      setResults([])
      return
    }

    const mappedRoom: DuelRoomRow = {
      id: String((roomRow as Record<string, unknown>).id || ''),
      host_user_id: String((roomRow as Record<string, unknown>).host_user_id || ''),
      game_type: String((roomRow as Record<string, unknown>).game_type || 'quiz') as DuelGameType,
      category: String((roomRow as Record<string, unknown>).category || 'all') as DuelCategory,
      is_public: Boolean((roomRow as Record<string, unknown>).is_public),
      join_code: (roomRow as Record<string, unknown>).join_code ? String((roomRow as Record<string, unknown>).join_code) : null,
      rounds: Number((roomRow as Record<string, unknown>).rounds || 5),
      question_set: (roomRow as Record<string, unknown>).question_set,
      status: String((roomRow as Record<string, unknown>).status || 'waiting') as DuelRoomStatus,
      current_round: Number((roomRow as Record<string, unknown>).current_round || 1),
      winner_user_id: (roomRow as Record<string, unknown>).winner_user_id ? String((roomRow as Record<string, unknown>).winner_user_id) : null,
      created_at: String((roomRow as Record<string, unknown>).created_at || ''),
    }

    const mappedPlayers: DuelRoomPlayerRow[] = (Array.isArray(playerRows) ? playerRows : []).map((row) => ({
      id: String((row as Record<string, unknown>).id || ''),
      room_id: String((row as Record<string, unknown>).room_id || ''),
      user_id: String((row as Record<string, unknown>).user_id || ''),
      slot_no: Number((row as Record<string, unknown>).slot_no || 1),
      is_ready: Boolean((row as Record<string, unknown>).is_ready),
      score: Number((row as Record<string, unknown>).score || 0),
      total_time_ms: Number((row as Record<string, unknown>).total_time_ms || 0),
      current_round: Number((row as Record<string, unknown>).current_round || 1),
      last_seen: String((row as Record<string, unknown>).last_seen || ''),
    }))

    const mappedResults: DuelRoomResultRow[] = (Array.isArray(resultRows) ? resultRows : []).map((row) => ({
      id: String((row as Record<string, unknown>).id || ''),
      room_id: String((row as Record<string, unknown>).room_id || ''),
      user_id: String((row as Record<string, unknown>).user_id || ''),
      score: Number((row as Record<string, unknown>).score || 0),
      total_time_ms: Number((row as Record<string, unknown>).total_time_ms || 0),
      placement: Number((row as Record<string, unknown>).placement || 2),
      is_winner: Boolean((row as Record<string, unknown>).is_winner),
    }))

    setRoom(mappedRoom)
    setPlayers(mappedPlayers)
    setResults(mappedResults)

    const userIds = mappedPlayers.map((player) => player.user_id)
    if (userIds.length > 0) {
      const { data: profileRows } = await supabase
        .from('profiles')
        .select('user_id,username')
        .in('user_id', userIds)

      const nameMap: Record<string, string> = {}
      ;(Array.isArray(profileRows) ? profileRows : []).forEach((row) => {
        const value = row as Record<string, unknown>
        const userId = String(value.user_id || '')
        const username = String(value.username || '').trim()
        if (userId) nameMap[userId] = username || `User ${userId.slice(0, 8)}`
      })
      setUsernameByUserId(nameMap)
    }
  }, [isSignedIn, roomId])

  useEffect(() => {
    if (!isSignedIn) return
    void loadPublicRooms()
    const timer = window.setInterval(() => {
      void loadPublicRooms()
    }, 12000)
    return () => window.clearInterval(timer)
  }, [isSignedIn, loadPublicRooms])

  useEffect(() => {
    const client = supabase
    if (!client || !roomId || !isSignedIn) return
    void refreshRoomSnapshot()

    const channel = client
      .channel(`room-${roomId}`, {
        config: {
          presence: {
            key: currentUserId,
          },
        },
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'rooms', filter: `id=eq.${roomId}` }, () => {
        void refreshRoomSnapshot()
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'room_players', filter: `room_id=eq.${roomId}` }, () => {
        void refreshRoomSnapshot()
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'room_results', filter: `room_id=eq.${roomId}` }, () => {
        void refreshRoomSnapshot()
      })
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState()
        const ids = Object.keys(state)
        setPresenceUserIds(ids)
      })

    channel.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        void channel.track({
          user_id: currentUserId,
          online_at: new Date().toISOString(),
        })
      }
    })

    return () => {
      void client.removeChannel(channel)
      setPresenceUserIds([])
    }
  }, [currentUserId, isSignedIn, refreshRoomSnapshot, roomId])

  useEffect(() => {
    const client = supabase
    if (!client || !roomId || !isSignedIn) return
    const timer = window.setInterval(() => {
      void client
        .from('room_players')
        .update({ last_seen: new Date().toISOString() })
        .eq('room_id', roomId)
        .eq('user_id', currentUserId)
    }, 10000)
    return () => window.clearInterval(timer)
  }, [currentUserId, isSignedIn, roomId])

  const roundList = useMemo(() => {
    if (!room || !Array.isArray(room.question_set)) return []
    return room.question_set
  }, [room])

  const myPlayer = useMemo(() => players.find((player) => player.user_id === currentUserId) || null, [players, currentUserId])
  const opponentPlayer = useMemo(() => players.find((player) => player.user_id !== currentUserId) || null, [players, currentUserId])

  const currentRoundNumber = useMemo(() => {
    if (!room || !myPlayer) return 1
    return Math.max(1, Math.min(room.rounds, myPlayer.current_round))
  }, [myPlayer, room])

  const roundIndex = Math.max(0, currentRoundNumber - 1)
  const currentRound = roundList[roundIndex]

  const canStartRound = Boolean(room && myPlayer && room.status === 'in_progress' && myPlayer.current_round <= room.rounds)

  useEffect(() => {
    if (!room || !myPlayer || !canStartRound) return
    setRoundStartedAt(Date.now())
    setQuizChoice(null)
    setQuizLocked(false)
    setSelectedLeftPairId(null)
    setSelectedRightPairId(null)
    setMatchedPairIds([])
    setMatchingMistakes(0)
    setMatchingRoundPoints(0)
    setMatchingSubmitted(false)

    if (room.game_type === 'matching' && isMatchingRound(currentRound)) {
      const left = shuffle(currentRound.pairs.map((pair) => ({ pairId: pair.pairId, text: pair.left })))
      const right = shuffle(currentRound.pairs.map((pair) => ({ pairId: pair.pairId, text: pair.right })))
      setMatchLeftOptions(left)
      setMatchRightOptions(right)
    }
  }, [canStartRound, currentRound, myPlayer, room])

  const createRoom = async () => {
    if (!supabase || !isSignedIn) return
    setLoading(true)
    setError('')
    setNotice('')
    const { data, error: rpcError } = await supabase.rpc('create_1v1_room', {
      p_game_type: selectedGameType,
      p_category: selectedCategory,
      p_is_public: isPublicRoom,
    })
    setLoading(false)
    if (rpcError) {
      setError(rpcError.message || 'Could not create room.')
      return
    }
    const nextRoomId = String(data || '')
    if (!nextRoomId) {
      setError('Room was created but no id was returned.')
      return
    }
    setRoomId(nextRoomId)
    setNotice('Room created. Waiting for opponent.')
  }

  const joinByCode = async () => {
    if (!supabase || !isSignedIn) return
    const code = joinCodeInput.trim()
    if (!/^[0-9]{6}$/.test(code)) {
      setError('Enter a valid 6-digit room code.')
      return
    }
    setLoading(true)
    setError('')
    const { data, error: rpcError } = await supabase.rpc('join_1v1_room', { p_join_code: code })
    setLoading(false)
    if (rpcError) {
      setError(rpcError.message || 'Could not join room.')
      return
    }
    setRoomId(String(data || ''))
    setJoinCodeInput('')
    setNotice('Joined room.')
  }

  const joinPublicRoom = async (targetRoomId: string) => {
    if (!supabase || !isSignedIn) return
    setLoading(true)
    setError('')
    const { data, error: rpcError } = await supabase.rpc('join_1v1_room', { p_room_id: targetRoomId })
    setLoading(false)
    if (rpcError) {
      setError(rpcError.message || 'Could not join room.')
      return
    }
    setRoomId(String(data || ''))
    setNotice('Joined room.')
  }

  const setReady = async (ready: boolean) => {
    if (!supabase || !roomId) return
    setError('')
    const { error: rpcError } = await supabase.rpc('set_1v1_ready', { p_room_id: roomId, p_ready: ready })
    if (rpcError) {
      setError(rpcError.message || 'Could not update ready status.')
    }
  }

  const submitRound = async (params: { round: number; correct: boolean; elapsedMs: number; points?: number }) => {
    if (!supabase || !roomId || submittingRound) return
    setSubmittingRound(true)
    setError('')
    const { error: rpcError } = await supabase.rpc('submit_1v1_round', {
      p_room_id: roomId,
      p_round: params.round,
      p_correct: params.correct,
      p_elapsed_ms: params.elapsedMs,
      p_points: typeof params.points === 'number' ? params.points : null,
    })
    setSubmittingRound(false)
    if (rpcError) {
      setError(rpcError.message || 'Could not submit round.')
      return
    }
    await refreshRoomSnapshot()
  }

  const submitQuizRound = async () => {
    if (!room || !isQuizRound(currentRound) || quizChoice === null || quizLocked) return
    const correct = quizChoice === currentRound.correctIndex
    setQuizLocked(true)
    const elapsedMs = Math.max(0, Date.now() - roundStartedAt)
    await submitRound({ round: currentRound.round, correct, elapsedMs })
  }

  const submitMatchingRound = async () => {
    if (!room || !isMatchingRound(currentRound) || matchingSubmitted) return
    const allMatched = matchedPairIds.length === currentRound.pairs.length
    setMatchingSubmitted(true)
    const elapsedMs = Math.max(0, Date.now() - roundStartedAt)
    await submitRound({
      round: currentRound.round,
      correct: allMatched,
      elapsedMs,
      points: Math.max(0, matchingRoundPoints),
    })
  }

  const handleMatchingPick = (side: 'left' | 'right', pairId: string) => {
    if (!isMatchingRound(currentRound) || matchingSubmitted) return
    if (side === 'left') {
      if (matchedPairIds.includes(pairId)) return
      setSelectedLeftPairId(pairId)
      return
    }
    if (matchedPairIds.includes(pairId)) return
    setSelectedRightPairId(pairId)
  }

  useEffect(() => {
    if (!selectedLeftPairId || !selectedRightPairId || matchingSubmitted) return
    if (selectedLeftPairId === selectedRightPairId) {
      if (!matchedPairIds.includes(selectedLeftPairId)) {
        setMatchedPairIds((previous) => [...previous, selectedLeftPairId])
        setMatchingRoundPoints((previous) => previous + 35)
      }
    } else {
      setMatchingMistakes((previous) => previous + 1)
      setMatchingRoundPoints((previous) => Math.max(0, previous - 10))
    }
    setSelectedLeftPairId(null)
    setSelectedRightPairId(null)
  }, [selectedLeftPairId, selectedRightPairId, matchedPairIds, matchingSubmitted])

  const leaveRoom = () => {
    setRoomId(null)
    setRoom(null)
    setPlayers([])
    setResults([])
    setPresenceUserIds([])
    setRoundStartedAt(0)
    setQuizChoice(null)
    setQuizLocked(false)
    setSelectedLeftPairId(null)
    setSelectedRightPairId(null)
    setMatchedPairIds([])
    setMatchingMistakes(0)
    setMatchingRoundPoints(0)
    setMatchingSubmitted(false)
    setError('')
    setNotice('')
  }

  const roomPlayerRowsSorted = useMemo(() => {
    if (results.length > 0) {
      return [...results].sort((left, right) => left.placement - right.placement)
    }
    return [...players].sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score
      if (left.total_time_ms !== right.total_time_ms) return left.total_time_ms - right.total_time_ms
      return left.slot_no - right.slot_no
    })
  }, [players, results])

  if (!isSignedIn) {
    return (
      <div className="card onevone-card">
        <h2>1v1</h2>
        <p className="muted">Sign in to create or join realtime rooms.</p>
      </div>
    )
  }

  const lobbyReadyCount = players.filter((player) => player.is_ready).length
  const inRoom = Boolean(room && roomId)

  return (
    <div className="onevone-wrap">
      {!inRoom ? (
        <>
          <h2>1v1 Multiplayer</h2>
          <div className="card onevone-card">
            <h3>Create Room</h3>
            <div className="onevone-grid two-col">
              <label>
                Game Mode
                <div className="segmented compact-segmented">
                  <button
                    type="button"
                    className={selectedGameType === 'quiz' ? 'seg active compact-seg' : 'seg compact-seg'}
                    onClick={() => {
                      setSelectedGameType('quiz')
                    }}
                  >
                    1v1 Quiz
                  </button>
                  <button
                    type="button"
                    className={selectedGameType === 'matching' ? 'seg active compact-seg' : 'seg compact-seg'}
                    onClick={() => {
                      setSelectedGameType('matching')
                      if (selectedCategory === 'scenarios') setSelectedCategory('all')
                    }}
                  >
                    1v1 Matching
                  </button>
                </div>
              </label>
              <label>
                Visibility
                <div className="segmented compact-segmented">
                  <button type="button" className={isPublicRoom ? 'seg active compact-seg' : 'seg compact-seg'} onClick={() => setIsPublicRoom(true)}>
                    Public
                  </button>
                  <button type="button" className={!isPublicRoom ? 'seg active compact-seg' : 'seg compact-seg'} onClick={() => setIsPublicRoom(false)}>
                    Private (Code)
                  </button>
                </div>
              </label>
            </div>

            <label>
              Category
              <div className="segmented compact-segmented onevone-cats">
                {duelCategoryOptions
                  .filter((option) => !(selectedGameType === 'matching' && option.quizOnly))
                  .map((option) => (
                    <button
                      key={`duel-category-${option.value}`}
                      type="button"
                      className={selectedCategory === option.value ? 'seg active compact-seg' : 'seg compact-seg'}
                      onClick={() => setSelectedCategory(option.value)}
                    >
                      {option.label}
                    </button>
                  ))}
              </div>
            </label>

            <div className="actions-row">
              <button className="primary" onClick={createRoom} disabled={loading || !supabase}>
                Create Room
              </button>
            </div>
          </div>

          <div className="card onevone-card">
            <h3>Join Private Room</h3>
            <div className="onevone-join-row">
              <input
                value={joinCodeInput}
                maxLength={6}
                inputMode="numeric"
                pattern="[0-9]*"
                onChange={(event) => setJoinCodeInput(event.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="6-digit code"
              />
              <button className="primary" onClick={joinByCode} disabled={loading || !supabase}>
                Join
              </button>
            </div>
          </div>

          <div className="card onevone-card">
            <div className="onevone-list-head">
              <h3>Public Rooms</h3>
              <button className="secondary" onClick={() => void loadPublicRooms()} disabled={loading || !supabase}>
                Refresh
              </button>
            </div>
            {publicRooms.length === 0 ? <p className="muted">No public rooms waiting right now.</p> : null}
            <div className="onevone-public-list">
              {publicRooms.map((item) => (
                <div key={item.id} className="onevone-public-item">
                  <div>
                    <strong>{item.game_type === 'quiz' ? '1v1 Quiz' : '1v1 Matching'}</strong>
                    <p className="muted tiny">Category: {item.category.toUpperCase()} • Players: {item.player_count}/2</p>
                  </div>
                  <button className="primary" onClick={() => void joinPublicRoom(item.id)} disabled={loading || item.player_count >= 2}>
                    Join
                  </button>
                </div>
              ))}
            </div>
          </div>
        </>
      ) : null}

      {inRoom && room ? (
        <>
          <h2>{room.game_type === 'quiz' ? '1v1 Quiz' : '1v1 Matching'} Room</h2>

          {room.status === 'waiting' ? (
            <div className="card onevone-card">
              <div className="onevone-lobby-head">
                <div>
                  <p className="muted tiny">Room ID</p>
                  <strong>{room.id.slice(0, 8)}</strong>
                </div>
                {!room.is_public ? (
                  <div>
                    <p className="muted tiny">Private Code</p>
                    <strong>{room.join_code || '------'}</strong>
                  </div>
                ) : null}
                <div>
                  <p className="muted tiny">Ready</p>
                  <strong>{lobbyReadyCount}/2</strong>
                </div>
              </div>

              <div className="onevone-slots">
                {[1, 2].map((slot) => {
                  const player = players.find((entry) => entry.slot_no === slot)
                  const isOnline = player ? presenceUserIds.includes(player.user_id) : false
                  const name = player ? usernameByUserId[player.user_id] || `User ${player.user_id.slice(0, 8)}` : 'Waiting...'
                  return (
                    <article key={`duel-slot-${slot}`} className="onevone-slot">
                      <p className="muted tiny">Player {slot}</p>
                      <strong>{name}</strong>
                      {player ? <p className={player.is_ready ? 'good' : 'muted'}>{player.is_ready ? 'Ready' : 'Not ready'}</p> : null}
                      {player ? <p className="muted tiny">{isOnline ? 'Online' : 'Offline'}</p> : null}
                    </article>
                  )
                })}
              </div>

              <div className="actions-row">
                <button className="primary" onClick={() => void setReady(true)} disabled={!myPlayer}>
                  Ready
                </button>
                <button className="secondary" onClick={() => void setReady(false)} disabled={!myPlayer}>
                  Unready
                </button>
                <button className="secondary" onClick={leaveRoom}>Leave</button>
              </div>
              <p className="muted tiny">Match starts automatically when both players are ready.</p>
            </div>
          ) : null}

          {room.status === 'in_progress' ? (
            <div className="card onevone-card">
              <div className="onevone-hud">
                <span>Round {currentRoundNumber}/{room.rounds}</span>
                <span>{currentUsername || 'You'}: {myPlayer?.score ?? 0} pts</span>
                <span>Opponent: {opponentPlayer?.score ?? 0} pts</span>
              </div>

              {!canStartRound ? (
                <p className="muted">Waiting for round sync...</p>
              ) : null}

              {canStartRound && room.game_type === 'quiz' && isQuizRound(currentRound) ? (
                <div className="onevone-round">
                  <h3>{currentRound.prompt}</h3>
                  {currentRound.sourceLabel ? <p className="muted tiny">{currentRound.sourceLabel}</p> : null}
                  <div className="choices">
                    {currentRound.choices.map((choice, index) => (
                      <button
                        key={`duel-quiz-choice-${currentRound.round}-${index}`}
                        className={quizChoice === index ? 'choice active' : 'choice'}
                        onClick={() => setQuizChoice(index)}
                        disabled={quizLocked || submittingRound}
                      >
                        {choice}
                      </button>
                    ))}
                  </div>
                  <div className="actions-row">
                    <button className="primary" onClick={() => void submitQuizRound()} disabled={quizChoice === null || quizLocked || submittingRound}>
                      Submit Round
                    </button>
                  </div>
                </div>
              ) : null}

              {canStartRound && room.game_type === 'matching' && isMatchingRound(currentRound) ? (
                <div className="onevone-round">
                  <p className="muted">Match each section to its title.</p>
                  <div className="onevone-match-grid">
                    <div>
                      <p className="muted tiny">Sections</p>
                      <div className="onevone-match-list">
                        {matchLeftOptions.map((item) => (
                          <button
                            key={`match-left-${currentRound.round}-${item.pairId}`}
                            className={selectedLeftPairId === item.pairId ? 'secondary active' : 'secondary'}
                            onClick={() => handleMatchingPick('left', item.pairId)}
                            disabled={matchedPairIds.includes(item.pairId) || matchingSubmitted || submittingRound}
                          >
                            {item.text}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <p className="muted tiny">Titles</p>
                      <div className="onevone-match-list">
                        {matchRightOptions.map((item) => (
                          <button
                            key={`match-right-${currentRound.round}-${item.pairId}`}
                            className={selectedRightPairId === item.pairId ? 'secondary active' : 'secondary'}
                            onClick={() => handleMatchingPick('right', item.pairId)}
                            disabled={matchedPairIds.includes(item.pairId) || matchingSubmitted || submittingRound}
                          >
                            {item.text}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                  <div className="onevone-hud">
                    <span>Matched: {matchedPairIds.length}/{currentRound.pairs.length}</span>
                    <span>Mistakes: {matchingMistakes}</span>
                    <span>Round Points: {matchingRoundPoints}</span>
                  </div>
                  <div className="actions-row">
                    <button
                      className="primary"
                      onClick={() => void submitMatchingRound()}
                      disabled={matchingSubmitted || submittingRound || matchedPairIds.length < currentRound.pairs.length}
                    >
                      Submit Round
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}

          {room.status === 'completed' ? (
            <div className="card onevone-card">
              <h3>Match Results</h3>
              <p className="muted">Winner is determined by highest score, then fastest total time.</p>
              <div className="onevone-results-list">
                {roomPlayerRowsSorted.map((entry) => {
                  const userId = entry.user_id
                  const name = usernameByUserId[userId] || `User ${userId.slice(0, 8)}`
                  const isWinner = 'is_winner' in entry
                    ? Boolean((entry as DuelRoomResultRow).is_winner)
                    : room.winner_user_id === userId
                  return (
                    <article key={`room-result-${userId}`} className={isWinner ? 'onevone-result-item winner' : 'onevone-result-item'}>
                      <strong>{name}</strong>
                      <span>{entry.score} pts</span>
                      <span>{formatElapsed(entry.total_time_ms)} total</span>
                      {isWinner ? <span className="good">Winner</span> : null}
                    </article>
                  )
                })}
              </div>
              <div className="actions-row">
                <button className="primary" onClick={leaveRoom}>Back to 1v1 Lobby</button>
              </div>
            </div>
          ) : null}
        </>
      ) : null}

      {error ? <p className="bad">{error}</p> : null}
      {!error && notice ? <p className="good">{notice}</p> : null}
    </div>
  )
}
