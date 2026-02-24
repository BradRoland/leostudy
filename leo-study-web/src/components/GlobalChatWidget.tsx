import { useEffect, useRef, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'

type PublicMessage = {
  id: string
  user_id: string
  display_name: string
  agency: string | null
  message: string
  created_at: string
  is_deleted: boolean
}

type PublicMessageReaction = {
  id: string
  message_id: string
  user_id: string
  emoji: string
  created_at: string
}

type UserProfileStats = {
  user_id: string
  username: string
  avatarUrl: string
  agency: string
  bio: string
  leaderboardFirstSpotsAllTime: number
  leaderboardFirstSpotsWeekly: number
  // Study stats
  studySeconds: number
  studyDayStreak: number
  masteredCodes: number
  mostStudiedMode: string
  // Duel stats
  duelWins: number
  duelLosses: number
  duelCurrentWinStreak: number
}

type Props = {
  currentUserId: string
  currentUsername: string
  userAgency?: string
  isOwner?: boolean
  leaderboardFirstSpotCounts?: {
    allTime: Record<string, number>
    weekly: Record<string, number>
  }
  mode?: 'widget' | 'full'
}

const MAX_MESSAGES = 100
const MESSAGE_MAX_LENGTH = 280
const RATE_LIMIT_MS = 2000

function reactionsToMap(rows: PublicMessageReaction[]) {
  const map: Record<string, Record<string, string[]>> = {}
  for (const row of rows) {
    if (!map[row.message_id]) map[row.message_id] = {}
    if (!map[row.message_id][row.emoji]) map[row.message_id][row.emoji] = []
    if (!map[row.message_id][row.emoji].includes(row.user_id)) {
      map[row.message_id][row.emoji].push(row.user_id)
    }
  }
  return map
}

function addReactionToMap(
  prev: Record<string, Record<string, string[]>>,
  messageId: string,
  emoji: string,
  userId: string,
) {
  const messageReactions = prev[messageId] || {}
  const currentUsers = messageReactions[emoji] || []
  if (currentUsers.includes(userId)) return prev
  return {
    ...prev,
    [messageId]: {
      ...messageReactions,
      [emoji]: [...currentUsers, userId],
    },
  }
}

function removeReactionFromMap(
  prev: Record<string, Record<string, string[]>>,
  messageId: string,
  emoji: string,
  userId: string,
) {
  const messageReactions = prev[messageId] || {}
  const currentUsers = messageReactions[emoji] || []
  if (!currentUsers.includes(userId)) return prev
  const nextUsers = currentUsers.filter((value) => value !== userId)
  const nextMessageReactions: Record<string, string[]> = {
    ...messageReactions,
  }
  if (nextUsers.length > 0) {
    nextMessageReactions[emoji] = nextUsers
  } else {
    delete nextMessageReactions[emoji]
  }
  const nextMap = {
    ...prev,
  }
  if (Object.keys(nextMessageReactions).length > 0) {
    nextMap[messageId] = nextMessageReactions
  } else {
    delete nextMap[messageId]
  }
  return nextMap
}

export function GlobalChatWidget({
  currentUserId,
  currentUsername,
  userAgency,
  isOwner,
  leaderboardFirstSpotCounts,
  mode = 'widget',
}: Props) {
  const isFullMode = mode === 'full'
  const [isOpen, setIsOpen] = useState(() => {
    if (isFullMode) return true
    if (typeof window === 'undefined') return false
    const stored = localStorage.getItem('globalChatOpen')
    return stored ? stored === 'true' : false
  })
  const [messages, setMessages] = useState<PublicMessage[]>([])
  const [inputValue, setInputValue] = useState('')
  const [sending, setSending] = useState(false)
  const [unreadCount, setUnreadCount] = useState(0)
  // Track if user has seen latest message
  const [hasNewMessages, setHasNewMessages] = useState(false)
  const [reportModalOpen, setReportModalOpen] = useState<string | null>(null)
  const [reportReason, setReportReason] = useState('')
  const [selectedProfile, setSelectedProfile] = useState<UserProfileStats | null>(null)
  const [profileLoading, setProfileLoading] = useState(false)
  const [reactionPicker, setReactionPicker] = useState<{ messageId: string; left: number; top: number } | null>(null)
  const [messageReactions, setMessageReactions] = useState<Record<string, Record<string, string[]>>>({})
  
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const messagesRef = useRef<PublicMessage[]>([])
  const lastSentRef = useRef(0)
  const isNearBottomRef = useRef(true)
  const subscribedRef = useRef(false)
  const fullModeAutoScrolledRef = useRef(false)
  const reactionActionGuardRef = useRef<Record<string, number>>({})
  const reactionSyncInFlightRef = useRef(false)
  const supabaseClient = supabase
  const isOpenRef = useRef(isOpen)

  const isAuthenticated = Boolean(currentUserId && supabaseClient)
  const popularReactionEmojis = ['👍', '❤️', '🔥', '😂', '👏', '💯', '🎉', '😎']
  const allReactionEmojis = [
    '😀', '😁', '😂', '🤣', '😊', '😍', '😎', '🤔', '😮', '🙌', '👏', '👍', '👎', '👌', '💪', '🔥',
    '💯', '🎯', '🎉', '🚓', '📚', '✅', '⚡', '🧠', '🫡', '👀', '🙏', '🤝', '🥳', '😤', '😬', '😅',
    '😴', '😡', '🤯', '❤️', '💙', '💚', '🧡', '💛', '⭐', '🏆', '🥇', '🚀', '💥', '🎮', '📝', '📈',
  ]
  const quickInsertEmojis = ['👍', '🔥', '🚓', '📚', '✅', '💯', '😂', '😎']

  useEffect(() => {
    messagesRef.current = messages
  }, [messages])

  const loadReactionsForMessageIds = useCallback(async (messageIds: string[]) => {
    if (!supabaseClient) return {}
    if (messageIds.length === 0) return {}
    const { data, error } = await supabaseClient
      .from('public_message_reactions')
      .select('id,message_id,user_id,emoji,created_at')
      .in('message_id', messageIds)
      .order('created_at', { ascending: false })
    if (error || !data) {
      if (error) {
        console.error('Failed to load message reactions:', error)
      }
      return null
    }
    return reactionsToMap(data as PublicMessageReaction[])
  }, [supabaseClient])

  const refreshVisibleReactions = useCallback(async () => {
    if (!supabaseClient) return
    if (reactionSyncInFlightRef.current) return

    const visibleMessageIds = messagesRef.current.map((message) => message.id)
    if (visibleMessageIds.length === 0) {
      setMessageReactions({})
      return
    }

    reactionSyncInFlightRef.current = true
    try {
      const reactionMap = await loadReactionsForMessageIds(visibleMessageIds)
      if (reactionMap) {
        setMessageReactions(reactionMap)
      }
    } finally {
      reactionSyncInFlightRef.current = false
    }
  }, [loadReactionsForMessageIds, supabaseClient])

  useEffect(() => {
    if (!isFullMode) return
    setIsOpen(true)
  }, [isFullMode])

  // Load initial messages once on mount
  useEffect(() => {
    if (!supabaseClient) return

    const loadMessages = async () => {
      const { data } = await supabaseClient
        .from('public_messages')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(MAX_MESSAGES)
      if (data) {
        const latestMessages = (data as PublicMessage[]).reverse()
        setMessages(latestMessages)
        void refreshVisibleReactions()
      }
    }

    void loadMessages()
  }, [refreshVisibleReactions, supabaseClient])

  // Keep isOpenRef in sync
  useEffect(() => {
    isOpenRef.current = isOpen
  }, [isOpen])

  // Listen for custom event to open chat from tab bar (mobile)
  useEffect(() => {
    if (isFullMode) return
    const handleOpenChat = () => {
      setIsOpen(true)
    }
    window.addEventListener('openGlobalChat', handleOpenChat)
    return () => window.removeEventListener('openGlobalChat', handleOpenChat)
  }, [isFullMode])

  // Subscribe to realtime messages
  useEffect(() => {
    if (!supabaseClient || subscribedRef.current) return
    subscribedRef.current = true

    const channel = supabaseClient
      .channel('public_chat')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'public_messages' },
        (payload) => {
          const newMessage = payload.new as PublicMessage
          setMessages((prev) => {
            if (prev.some((m) => m.id === newMessage.id)) return prev
            return [...prev, newMessage].slice(-MAX_MESSAGES)
          })

          if (isOpenRef.current && isNearBottomRef.current) {
            setHasNewMessages(false)
            setTimeout(() => {
              messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
            }, 50)
          } else if (!isOpenRef.current) {
            setUnreadCount((c) => c + 1)
          } else {
            setHasNewMessages(true)
          }
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'public_messages' },
        (payload) => {
          const updatedMessage = payload.new as PublicMessage
          setMessages((prev) => prev.map((message) => (message.id === updatedMessage.id ? updatedMessage : message)))
        },
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'public_messages' },
        (payload) => {
          const deletedMessage = payload.old as PublicMessage
          setMessages((prev) => prev.filter((message) => message.id !== deletedMessage.id))
          setMessageReactions((prev) => {
            if (!prev[deletedMessage.id]) return prev
            const next = { ...prev }
            delete next[deletedMessage.id]
            return next
          })
        },
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'public_message_reactions' },
        (payload) => {
          const row = payload.new as PublicMessageReaction
          setMessageReactions((prev) => addReactionToMap(prev, row.message_id, row.emoji, row.user_id))
          window.setTimeout(() => {
            void refreshVisibleReactions()
          }, 220)
        },
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'public_message_reactions' },
        (payload) => {
          const row = payload.old as PublicMessageReaction
          setMessageReactions((prev) => removeReactionFromMap(prev, row.message_id, row.emoji, row.user_id))
          window.setTimeout(() => {
            void refreshVisibleReactions()
          }, 220)
        },
      )
      .subscribe(() => {})

    return () => {
      supabaseClient.removeChannel(channel)
    }
  }, [refreshVisibleReactions, supabaseClient])

  // Poll for new messages every 5 seconds (lightweight fallback)
  useEffect(() => {
    if (!supabaseClient) return

    const pollMessages = async () => {
      const { data } = await supabaseClient
        .from('public_messages')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(MAX_MESSAGES)
      if (data) {
        const latestMessages = (data as PublicMessage[]).reverse()
        const existingIds = new Set(messagesRef.current.map((message) => message.id))
        const newMessageDetected = latestMessages.some((m) => !existingIds.has(m.id))

        setMessages(latestMessages)
        void refreshVisibleReactions()

        // Update unread indicator from polling too
        if (newMessageDetected) {
          if (isOpenRef.current && isNearBottomRef.current) {
            setHasNewMessages(false)
          } else if (!isOpenRef.current) {
            setUnreadCount((c) => c + 1)
          } else {
            setHasNewMessages(true)
          }
        }
      }
    }

    const interval = setInterval(pollMessages, 5000)
    return () => clearInterval(interval)
  }, [refreshVisibleReactions, supabaseClient])

  // Extra reaction sync so users always see others' reactions quickly, even if realtime misses an event.
  useEffect(() => {
    if (!supabaseClient) return
    const interval = window.setInterval(() => {
      void refreshVisibleReactions()
    }, 3200)
    return () => window.clearInterval(interval)
  }, [refreshVisibleReactions, supabaseClient])

  // Persist open state
  useEffect(() => {
    if (isFullMode) return
    if (typeof window === 'undefined') return
    localStorage.setItem('globalChatOpen', String(isOpen))
    if (isOpen) {
      setUnreadCount(0)
      setHasNewMessages(false)
      setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'auto' })
      }, 100)
    }
  }, [isOpen, isFullMode])

  useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null
      if (!target) return
      if (target.closest('.global-chat-reaction-picker') || target.closest('.global-chat-reaction-add')) return
      setReactionPicker(null)
    }
    document.addEventListener('mousedown', onPointerDown)
    return () => document.removeEventListener('mousedown', onPointerDown)
  }, [])

  // Check scroll position
  const handleScroll = useCallback(() => {
    if (!containerRef.current) return
    const { scrollTop, scrollHeight, clientHeight } = containerRef.current
    const distanceFromBottom = scrollHeight - scrollTop - clientHeight
    isNearBottomRef.current = distanceFromBottom < 100
    setReactionPicker(null)
    
    if (isNearBottomRef.current) {
      setHasNewMessages(false)
    }
  }, [])

  // Scroll to bottom
  const scrollToBottomWithBehavior = useCallback((behavior: ScrollBehavior = 'smooth') => {
    if (containerRef.current) {
      containerRef.current.scrollTo({ top: containerRef.current.scrollHeight, behavior })
    } else {
      messagesEndRef.current?.scrollIntoView({ behavior })
    }
    setHasNewMessages(false)
    isNearBottomRef.current = true
  }, [])

  const requestScrollToBottom = useCallback((behavior: ScrollBehavior = 'smooth') => {
    const run = () => scrollToBottomWithBehavior(behavior)
    run()
    const raf = window.requestAnimationFrame(run)
    const timerA = window.setTimeout(run, 90)
    const timerB = window.setTimeout(run, 220)
    return () => {
      window.cancelAnimationFrame(raf)
      window.clearTimeout(timerA)
      window.clearTimeout(timerB)
    }
  }, [scrollToBottomWithBehavior])

  const scrollToBottom = useCallback(() => {
    scrollToBottomWithBehavior('smooth')
  }, [scrollToBottomWithBehavior])

  // In full-page chat, auto-jump to latest message when page opens
  useEffect(() => {
    if (!isFullMode) return
    if (fullModeAutoScrolledRef.current) return
    if (messages.length === 0) return

    fullModeAutoScrolledRef.current = true
    return requestScrollToBottom('auto')
  }, [isFullMode, messages.length, requestScrollToBottom])

  // Allow forcing chat to latest from navigation while already on chat page
  useEffect(() => {
    if (!isFullMode) return
    const handleScrollRequest = () => {
      requestScrollToBottom('auto')
    }
    window.addEventListener('scrollGlobalChatToBottom', handleScrollRequest)
    return () => window.removeEventListener('scrollGlobalChatToBottom', handleScrollRequest)
  }, [isFullMode, requestScrollToBottom])

  // Send message
  const sendMessage = useCallback(async () => {
    if (!supabaseClient || !isAuthenticated) return
    
    const trimmed = inputValue.trim()
    if (!trimmed || trimmed.length > MESSAGE_MAX_LENGTH) return
    
    const now = Date.now()
    if (now - lastSentRef.current < RATE_LIMIT_MS) {
      return
    }
    lastSentRef.current = now

    setSending(true)
    setInputValue('')

    try {
      await supabaseClient.from('public_messages').insert({
        user_id: currentUserId,
        display_name: currentUsername,
        agency: userAgency || null,
        message: trimmed,
      })
      // Reload messages after sending
      const { data } = await supabaseClient
        .from('public_messages')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(MAX_MESSAGES)
      if (data) {
        setMessages(data.reverse())
        // Scroll to bottom after sending
        setTimeout(() => {
          messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
        }, 100)
      }
    } catch (err) {
      console.error('Failed to send message:', err)
    } finally {
      setSending(false)
    }
  }, [inputValue, currentUserId, currentUsername, userAgency, supabaseClient, isAuthenticated])

  const addEmojiToInput = useCallback((emoji: string) => {
    setInputValue((previous) => `${previous}${emoji}`)
  }, [])

  const toggleReaction = useCallback(async (messageId: string, emoji: string) => {
    if (!supabaseClient || !isAuthenticated) return
    const guardKey = `${messageId}|${emoji}|${currentUserId}`
    const guardNow = Date.now()
    const lastActionAt = reactionActionGuardRef.current[guardKey] || 0
    if (guardNow - lastActionAt < 350) return
    reactionActionGuardRef.current[guardKey] = guardNow

    const currentUsers = messageReactions[messageId]?.[emoji] || []
    const hasReacted = currentUsers.includes(currentUserId)

    if (hasReacted) {
      setMessageReactions((previous) => removeReactionFromMap(previous, messageId, emoji, currentUserId))
    } else {
      setMessageReactions((previous) => addReactionToMap(previous, messageId, emoji, currentUserId))
    }

    try {
      if (hasReacted) {
        const { error } = await supabaseClient
          .from('public_message_reactions')
          .delete()
          .eq('message_id', messageId)
          .eq('emoji', emoji)
          .eq('user_id', currentUserId)
        if (error) throw error
      } else {
        const { error } = await supabaseClient
          .from('public_message_reactions')
          .insert({
            message_id: messageId,
            user_id: currentUserId,
            emoji,
          })
        if (error) throw error
      }
      window.setTimeout(() => {
        void refreshVisibleReactions()
      }, 120)
    } catch (error) {
      console.error('Failed to toggle reaction:', error)
      await refreshVisibleReactions()
    } finally {
      window.setTimeout(() => {
        delete reactionActionGuardRef.current[guardKey]
      }, 360)
    }
  }, [currentUserId, isAuthenticated, messageReactions, refreshVisibleReactions, supabaseClient])

  // Handle report
  const handleReport = useCallback(async (messageId: string) => {
    if (!supabaseClient || !reportReason.trim()) return

    await supabaseClient.from('public_message_reports').insert({
      message_id: messageId,
      reporter_user_id: currentUserId,
      reason: reportReason.trim(),
    })

    setReportModalOpen(null)
    setReportReason('')
  }, [reportReason, currentUserId, supabaseClient])

  // Handle delete
  const handleDelete = useCallback(async (messageId: string) => {
    if (!supabaseClient || !isOwner) return

    await supabaseClient.from('public_messages').update({
      is_deleted: true,
      deleted_at: new Date().toISOString(),
      deleted_by: currentUserId,
      message: '[Message deleted]',
    }).eq('id', messageId)
  }, [isOwner, currentUserId, supabaseClient])

  // Fetch user profile stats
  const fetchUserProfile = useCallback(async (userId: string) => {
    if (!supabaseClient) return
    
    setProfileLoading(true)
    setSelectedProfile(null)
    
    try {
      // Get user profile
      const { data: profile } = await supabaseClient
        .from('profiles')
        .select('user_id, username, avatar_path, agency, bio')
        .eq('user_id', userId)
        .maybeSingle()
      
      // Get app_state for study stats
      const { data: appState } = await supabaseClient
        .from('app_state')
        .select('profile_details, performance')
        .eq('user_id', userId)
        .maybeSingle()
      
      // Get duel stats for 'all' game types
      const { data: duelStats } = await supabaseClient
        .from('duel_player_stats')
        .select('wins, losses, current_win_streak')
        .eq('user_id', userId)
        .eq('game_type', 'all')
        .maybeSingle()
      
      // Calculate mastered codes from performance (same logic as App.tsx)
      let masteredCodes = 0
      if (appState?.performance) {
        const perf = appState.performance as Record<string, { correctCount?: number; incorrectCount?: number; correctStreak?: number }>
        Object.values(perf).forEach(item => {
          const streak = item?.correctStreak ?? 0
          
          // Mastered = streak >= 20 (exact match to App.tsx)
          if (streak >= 20) {
            masteredCodes++
          }
        })
      }
      
      // Extract study stats from profile_details
      let studySeconds = 0
      let studyDayStreak = 0
      let mostStudiedMode = ''
      if (appState?.profile_details) {
        const details = appState.profile_details as { stats?: { studySeconds?: number; studyDayStreak?: number; studyModeCounts?: Record<string, number> } }
        studySeconds = details?.stats?.studySeconds ?? 0
        studyDayStreak = details?.stats?.studyDayStreak ?? 0
        
        // Find most studied mode
        const modeCounts = details?.stats?.studyModeCounts
        if (modeCounts) {
          const entries = Object.entries(modeCounts)
          if (entries.length > 0) {
            const sorted = entries.sort((a, b) => b[1] - a[1])
            const modeMap: Record<string, string> = { penal: 'Penal', hs: 'Highway', vehicle: 'Vehicle', all: 'All' }
            mostStudiedMode = modeMap[sorted[0][0]] || sorted[0][0]
          }
        }
      }
      
      if (profile) {
        // Construct full avatar URL if avatar_path exists
        const avatarUrl = profile.avatar_path 
          ? `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/avatars/${profile.avatar_path}`
          : ''
        
        setSelectedProfile({
          user_id: userId,
          username: profile.username || 'Unknown',
          avatarUrl,
          agency: profile.agency || '',
          bio: profile.bio || '',
          leaderboardFirstSpotsAllTime: leaderboardFirstSpotCounts?.allTime?.[userId] || 0,
          leaderboardFirstSpotsWeekly: leaderboardFirstSpotCounts?.weekly?.[userId] || 0,
          studySeconds,
          studyDayStreak,
          masteredCodes,
          mostStudiedMode,
          duelWins: duelStats?.wins ?? 0,
          duelLosses: duelStats?.losses ?? 0,
          duelCurrentWinStreak: duelStats?.current_win_streak ?? 0,
        })
      }
    } catch (err) {
      console.error('Failed to fetch profile:', err)
    } finally {
      setProfileLoading(false)
    }
  }, [leaderboardFirstSpotCounts, supabaseClient])

  // Format timestamp
  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr)
    const now = new Date()
    const diff = now.getTime() - date.getTime()
    
    if (diff < 60000) return 'now'
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m`
    if (diff < 86400000) return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' })
  }

  // Format study time in hours/minutes
  const formatStudyTime = (seconds: number) => {
    const hours = Math.floor(seconds / 3600)
    const mins = Math.floor((seconds % 3600) / 60)
    if (hours > 0) return `${hours}h ${mins}m`
    return `${mins}m`
  }

  if (!supabaseClient) return null

  return (
    <div className={isFullMode ? 'global-chat-widget global-chat-widget-full' : 'global-chat-widget'}>
      {!isOpen && !isFullMode && (
        <button
          className="global-chat-toggle"
          onClick={() => setIsOpen(true)}
          aria-label="Open chat"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
          {(unreadCount > 0 || hasNewMessages) && <span className="global-chat-badge">{unreadCount > 9 ? '9+' : (unreadCount || '•')}</span>}
        </button>
      )}

      {isOpen && (
        <div className={isFullMode ? 'global-chat-panel global-chat-panel-full' : 'global-chat-panel'}>
          <div className="global-chat-header">
            <span>Public Chat</span>
            {!isFullMode ? (
              <button className="global-chat-close" onClick={() => setIsOpen(false)} aria-label="Close chat">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            ) : null}
          </div>

          <div className="global-chat-messages" ref={containerRef} onScroll={handleScroll}>
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`global-chat-message ${msg.user_id === currentUserId ? 'own' : ''} ${msg.is_deleted ? 'deleted' : ''}`}
              >
                <div className="global-chat-message-header">
                  <button 
                    className="global-chat-name" 
                    onClick={() => void fetchUserProfile(msg.user_id)}
                  >
                    {msg.display_name}
                  </button>
                  {msg.agency && <span className="global-chat-agency">{msg.agency}</span>}
                  <span className="global-chat-time">{formatTime(msg.created_at)}</span>
                </div>
                <p className="global-chat-text">{msg.message}</p>
                <div className="global-chat-reactions">
                  {Object.entries(messageReactions[msg.id] || {})
                    .filter(([, users]) => users.length > 0)
                    .sort((left, right) => right[1].length - left[1].length)
                    .map(([emoji, users]) => {
                      const count = users.length
                      const active = users.includes(currentUserId)
                      return (
                        <button
                          key={`${msg.id}-${emoji}`}
                          type="button"
                          className={active ? 'global-chat-reaction active' : 'global-chat-reaction'}
                          onClick={(event) => {
                            event.preventDefault()
                            event.stopPropagation()
                            void toggleReaction(msg.id, emoji)
                          }}
                        >
                          <span>{emoji}</span>
                          <small>{count}</small>
                        </button>
                      )
                    })}
                  {!msg.is_deleted ? (
                    <button
                      type="button"
                      className="global-chat-reaction-add"
                      onClick={(event) => {
                        const button = event.currentTarget
                        const buttonRect = button.getBoundingClientRect()
                        const estimatedWidth = Math.min(320, window.innerWidth - 24)
                        const left = Math.max(
                          12,
                          Math.min(
                            buttonRect.left + buttonRect.width / 2 - estimatedWidth / 2,
                            window.innerWidth - estimatedWidth - 12,
                          ),
                        )
                        const top = Math.max(12, buttonRect.top)
                        setReactionPicker((previous) =>
                          previous?.messageId === msg.id ? null : { messageId: msg.id, left, top },
                        )
                      }}
                      aria-label="Add reaction"
                    >
                      <span className="global-chat-reaction-add-plus">+</span>
                      <span className="global-chat-reaction-add-emoji">😊</span>
                    </button>
                  ) : null}
                </div>
                {reactionPicker?.messageId === msg.id ? (
                  <div
                    className="global-chat-reaction-picker"
                    style={{
                      left: `${reactionPicker.left}px`,
                      top: `${reactionPicker.top}px`,
                    }}
                  >
                    <p className="global-chat-reaction-picker-title">Popular</p>
                    <div className="global-chat-reaction-picker-row">
                      {popularReactionEmojis.map((emoji) => (
                        <button
                          key={`popular-${msg.id}-${emoji}`}
                          type="button"
                          className="global-chat-reaction-option"
                          onMouseDown={(event) => {
                            event.preventDefault()
                            event.stopPropagation()
                          }}
                          onClick={(event) => {
                            event.preventDefault()
                            event.stopPropagation()
                            void toggleReaction(msg.id, emoji)
                            setReactionPicker(null)
                          }}
                        >
                          {emoji}
                        </button>
                      ))}
                    </div>
                    <p className="global-chat-reaction-picker-title">All emojis</p>
                    <div className="global-chat-reaction-picker-grid">
                      {allReactionEmojis.map((emoji) => (
                        <button
                          key={`all-${msg.id}-${emoji}`}
                          type="button"
                          className="global-chat-reaction-option"
                          onMouseDown={(event) => {
                            event.preventDefault()
                            event.stopPropagation()
                          }}
                          onClick={(event) => {
                            event.preventDefault()
                            event.stopPropagation()
                            void toggleReaction(msg.id, emoji)
                            setReactionPicker(null)
                          }}
                        >
                          {emoji}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}
                {!msg.is_deleted && msg.user_id !== currentUserId && (
                  <button
                    className="global-chat-report"
                    onClick={() => setReportModalOpen(msg.id)}
                    aria-label="Report message"
                  >
                    ⋯
                  </button>
                )}
                {isOwner && !msg.is_deleted && (
                  <button
                    className="global-chat-delete"
                    onClick={() => handleDelete(msg.id)}
                    aria-label="Delete message"
                  >
                    🗑
                  </button>
                )}
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>

          {hasNewMessages && (
            <button className="global-chat-new-indicator" onClick={scrollToBottom}>
              New messages ↓
            </button>
          )}

          <div className="global-chat-input-row">
            {isAuthenticated ? (
              <>
                <input
                  type="text"
                  className="global-chat-input"
                  placeholder="Type a message…"
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      sendMessage()
                    }
                  }}
                  maxLength={MESSAGE_MAX_LENGTH}
                  disabled={sending}
                />
                <button
                  className="global-chat-send"
                  onClick={sendMessage}
                  disabled={sending || !inputValue.trim()}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="22" y1="2" x2="11" y2="13" />
                    <polygon points="22 2 15 22 11 13 2 9 22 2" />
                  </svg>
                </button>
              </>
            ) : (
              <span className="global-chat-signin">Sign in to chat</span>
            )}
          </div>
          {isAuthenticated ? (
            <div className="global-chat-emoji-row">
              {quickInsertEmojis.map((emoji) => (
                <button key={`insert-${emoji}`} type="button" className="global-chat-emoji-btn" onClick={() => addEmojiToInput(emoji)}>
                  {emoji}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      )}

      {reportModalOpen && (
        <div className="global-chat-modal-overlay" onClick={() => setReportModalOpen(null)}>
          <div className="global-chat-modal" onClick={(e) => e.stopPropagation()}>
            <h4>Report Message</h4>
            <select value={reportReason} onChange={(e) => setReportReason(e.target.value)}>
              <option value="">Select a reason</option>
              <option value="spam">Spam</option>
              <option value="abuse">Abuse/Harassment</option>
              <option value="inappropriate">Inappropriate content</option>
              <option value="other">Other</option>
            </select>
            <div className="global-chat-modal-actions">
              <button className="secondary cancel-button" onClick={() => setReportModalOpen(null)}>Cancel</button>
              <button className="primary" onClick={() => handleReport(reportModalOpen)} disabled={!reportReason.trim()}>
                Report
              </button>
            </div>
          </div>
        </div>
      )}

      {selectedProfile && (
        <div className="global-chat-modal-overlay" onClick={() => setSelectedProfile(null)}>
          {profileLoading ? (
            <div className="global-chat-modal profile-modal">
              <div className="profile-loading">Loading...</div>
            </div>
          ) : (
          <div className="global-chat-modal profile-modal" onClick={(e) => e.stopPropagation()}>
            <div className="profile-modal-header">
              <div className="profile-modal-avatar">
                {selectedProfile.avatarUrl ? (
                  <img src={selectedProfile.avatarUrl} alt={selectedProfile.username} />
                ) : (
                  <div className="profile-avatar-placeholder">
                    {selectedProfile.username.charAt(0).toUpperCase()}
                  </div>
                )}
              </div>
              <div className="profile-modal-info">
                <h4>{selectedProfile.username}</h4>
                {selectedProfile.agency && <span className="profile-modal-agency">{selectedProfile.agency}</span>}
              </div>
            </div>
            
            {selectedProfile.bio && (
              <p className="profile-modal-bio">{selectedProfile.bio}</p>
            )}
            
            <div className="profile-modal-section">
              <h5>📚 Study</h5>
              <div className="profile-modal-stats">
                <div className="profile-stat">
                  <span className="profile-stat-value">{selectedProfile.masteredCodes}</span>
                  <span className="profile-stat-label">Mastered</span>
                </div>
                <div className="profile-stat">
                  <span className="profile-stat-value">{selectedProfile.leaderboardFirstSpotsAllTime}</span>
                  <span className="profile-stat-label">#1 Spots</span>
                </div>
                <div className="profile-stat">
                  <span className="profile-stat-value">{formatStudyTime(selectedProfile.studySeconds)}</span>
                  <span className="profile-stat-label">Study Time</span>
                </div>
                <div className="profile-stat">
                  <span className="profile-stat-value fire">🔥 {selectedProfile.studyDayStreak}</span>
                  <span className="profile-stat-label">Day Streak</span>
                </div>
                <div className="profile-stat">
                  <span className="profile-stat-value">{selectedProfile.leaderboardFirstSpotsWeekly}</span>
                  <span className="profile-stat-label">Weekly #1s</span>
                </div>
                {selectedProfile.mostStudiedMode && (
                  <div className="profile-stat">
                    <span className="profile-stat-value">{selectedProfile.mostStudiedMode}</span>
                    <span className="profile-stat-label">Top Mode</span>
                  </div>
                )}
              </div>
            </div>
            
            <div className="profile-modal-section">
              <h5>⚔️ Duel</h5>
              <div className="profile-modal-stats">
                <div className="profile-stat">
                  <span className="profile-stat-value">{selectedProfile.duelWins}-{selectedProfile.duelLosses}</span>
                  <span className="profile-stat-label">W-L</span>
                </div>
                <div className="profile-stat">
                  <span className="profile-stat-value">{selectedProfile.duelWins + selectedProfile.duelLosses > 0 
                    ? Math.round((selectedProfile.duelWins / (selectedProfile.duelWins + selectedProfile.duelLosses)) * 100) 
                    : 0}%</span>
                  <span className="profile-stat-label">Win Rate</span>
                </div>
                <div className="profile-stat">
                  <span className="profile-stat-value fire">🔥 {selectedProfile.duelCurrentWinStreak}</span>
                  <span className="profile-stat-label">Streak</span>
                </div>
              </div>
            </div>
            
            <div className="profile-modal-actions">
              <button className="secondary" onClick={() => setSelectedProfile(null)}>Close</button>
            </div>
          </div>
          )}
        </div>
      )}
    </div>
  )
}
