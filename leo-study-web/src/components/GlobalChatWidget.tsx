import { Fragment, useEffect, useId, useRef, useState, useCallback, type SyntheticEvent } from 'react'
import { getEffectiveProfileDecorationForLevel } from '../lib/profileDecorationData'
import { ProfileAvatarDecoration } from '../lib/profileDecorations'
import { supabase } from '../lib/supabase'

type PublicMessage = {
  id: string
  user_id: string
  display_name: string
  agency: string | null
  department_name?: string | null
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

type MessageReactionMap = Record<string, Record<string, string[]>>

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
  // Level stats
  level: number
  tierName: string
  totalXp: number
  haloClass: string
  profileDecorationKey: string
  autoDecorationKey?: string
}

type ChatLevelProfile = {
  level: number
  tierName: string
  totalXp: number
  haloClass: string
  autoDecorationKey?: string
}

type Props = {
  currentUserId: string
  currentUsername: string
  userAgency?: string
  isOwner?: boolean
  classId?: string
  classLabel?: string
  canModerateClass?: boolean
  leaderboardFirstSpotCounts?: {
    allTime: Record<string, number>
    weekly: Record<string, number>
  }
  userLevels?: Record<string, ChatLevelProfile>
  onOpenProfile?: (userId: string) => void
  mode?: 'widget' | 'full'
}

const MAX_MESSAGES = 100
const MESSAGE_MAX_LENGTH = 280
const RATE_LIMIT_MS = 2000
const CHAT_CACHE_KEY = 'leo_global_chat_cache_v1'
const CHAT_CACHE_TTL_MS = 5 * 60 * 1000

type ChatCacheEntry = {
  messages: PublicMessage[]
  reactions: MessageReactionMap
  at: number
}

const hotChatCacheByScope: Record<string, ChatCacheEntry> = {}

function ChatIcon({ name, size = 20 }: { name: 'chat' | 'send' | 'smile' | 'close' | 'down' | 'flag' | 'trash'; size?: number }) {
  const paths = {
    chat: <><path d="M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.4 8.4 0 0 1 3.8-.9h.5a8.5 8.5 0 0 1 8 8v.5Z" /><path d="M8 11h.01M12 11h.01M16 11h.01" /></>,
    send: <><path d="m12 19 0-14M5 12l7-7 7 7" /></>,
    smile: <><circle cx="12" cy="12" r="9" /><path d="M8 14s1.5 2 4 2 4-2 4-2M8 9h.01M16 9h.01" /></>,
    close: <path d="m6 6 12 12M18 6 6 18" />,
    down: <path d="M12 5v14m-7-7 7 7 7-7" />,
    flag: <><path d="M4 22V3m0 1c5-4 11 4 16 0v10c-5 4-11-4-16 0" /></>,
    trash: <><path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7" /></>,
  }
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>
}

function messageDayLabel(createdAt: string) {
  const date = new Date(createdAt)
  const today = new Date()
  const yesterday = new Date(today)
  yesterday.setDate(today.getDate() - 1)
  if (date.toDateString() === today.toDateString()) return 'Today'
  if (date.toDateString() === yesterday.toDateString()) return 'Yesterday'
  return date.toLocaleDateString([], { month: 'short', day: 'numeric', ...(date.getFullYear() !== today.getFullYear() ? { year: 'numeric' as const } : {}) })
}

function messageInitials(name: string) {
  return name.trim().split(/\s+/).slice(0, 2).map((part) => Array.from(part)[0] || '').join('').toUpperCase() || '?'
}

function chatCacheScope(classId?: string) {
  return classId ? `class:${classId}` : 'public'
}

function readChatCache(scope: string) {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.sessionStorage.getItem(`${CHAT_CACHE_KEY}:${scope}`)
    if (!raw) return null
    const parsed = JSON.parse(raw) as {
      at?: number
      messages?: PublicMessage[]
      reactions?: MessageReactionMap
    }
    if (!parsed || typeof parsed !== 'object') return null
    const at = Number(parsed.at || 0)
    if (!Number.isFinite(at) || at <= 0) return null
    if (Date.now() - at > CHAT_CACHE_TTL_MS) return null
    const messages = Array.isArray(parsed.messages) ? parsed.messages.slice(-MAX_MESSAGES) : []
    const reactions = parsed.reactions && typeof parsed.reactions === 'object' ? parsed.reactions : {}
    return { at, messages, reactions }
  } catch {
    return null
  }
}

function writeChatCache(scope: string, messages: PublicMessage[], reactions: MessageReactionMap) {
  if (typeof window === 'undefined') return
  try {
    const payload = {
      at: Date.now(),
      messages: messages.slice(-MAX_MESSAGES),
      reactions,
    }
    window.sessionStorage.setItem(`${CHAT_CACHE_KEY}:${scope}`, JSON.stringify(payload))
  } catch {
    // ignore cache write failures
  }
}

function reactionsToMap(rows: PublicMessageReaction[]) {
  const map: MessageReactionMap = {}
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
  prev: MessageReactionMap,
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
  prev: MessageReactionMap,
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
  userLevels,
  onOpenProfile,
  mode = 'widget',
  classId,
  classLabel,
  canModerateClass,
}: Props) {
  const isFullMode = mode === 'full'
  const messageTable = classId ? 'class_messages' : 'public_messages'
  const reactionTable = classId ? 'class_message_reactions' : 'public_message_reactions'
  const cacheScope = chatCacheScope(classId)
  const reportTable = classId ? 'class_message_reports' : 'public_message_reports'
  const canModerateMessages = Boolean(isOwner || canModerateClass)
  const [isOpen, setIsOpen] = useState(() => {
    if (isFullMode) return true
    if (typeof window === 'undefined') return false
    const stored = localStorage.getItem('globalChatOpen')
    return stored ? stored === 'true' : false
  })
  const [messages, setMessages] = useState<PublicMessage[]>([])
  const [inputValue, setInputValue] = useState('')
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState('')
  const [showQuickEmojis, setShowQuickEmojis] = useState(false)
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'live' | 'reconnecting'>('connecting')
  const [connectionAttempt, setConnectionAttempt] = useState(0)
  const [unreadCount, setUnreadCount] = useState(0)
  // Track if user has seen latest message
  const [hasNewMessages, setHasNewMessages] = useState(false)
  const [reportModalOpen, setReportModalOpen] = useState<string | null>(null)
  const [reportReason, setReportReason] = useState('')
  const [selectedProfile, setSelectedProfile] = useState<UserProfileStats | null>(null)
  const [profileLoading, setProfileLoading] = useState(false)
  const [reactionPicker, setReactionPicker] = useState<{ messageId: string; left: number; top: number } | null>(null)
  const [reactionHover, setReactionHover] = useState<{
    messageId: string
    emoji: string
    users: string[]
    left: number
    top: number
    originX: number
  } | null>(null)
  const [messageReactions, setMessageReactions] = useState<MessageReactionMap>({})
  const [reactionUserNames, setReactionUserNames] = useState<Record<string, string>>({})
  
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const messagesRef = useRef<PublicMessage[]>([])
  const lastSentRef = useRef(0)
  const isNearBottomRef = useRef(true)
  const subscribedRef = useRef(false)
  const channelInstanceId = useId()
  const subscriptionNumberRef = useRef(0)
  const closedRetryCountRef = useRef(0)
  const fullModeAutoScrolledRef = useRef(false)
  const reactionActionGuardRef = useRef<Record<string, number>>({})
  const reactionSyncInFlightRef = useRef(false)
  const cacheHydratedRef = useRef(false)
  const reactionUserNamesRef = useRef<Record<string, string>>({})
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

  useEffect(() => {
    reactionUserNamesRef.current = reactionUserNames
  }, [reactionUserNames])

  const ensureReactionUserNames = useCallback(async (userIds: string[]) => {
    if (!supabaseClient || userIds.length === 0) return

    const uniqueIds = Array.from(new Set(userIds.filter(Boolean)))
    if (uniqueIds.length === 0) return

    const namesFromMessages: Record<string, string> = {}
    for (const message of messagesRef.current) {
      if (message.user_id && message.display_name) {
        namesFromMessages[message.user_id] = message.display_name
      }
    }

    if (Object.keys(namesFromMessages).length > 0) {
      setReactionUserNames((prev) => {
        const next = { ...prev }
        let changed = false
        for (const [userId, name] of Object.entries(namesFromMessages)) {
          if (!next[userId] && name) {
            next[userId] = name
            changed = true
          }
        }
        return changed ? next : prev
      })
    }

    const knownNames = {
      ...reactionUserNamesRef.current,
      ...namesFromMessages,
    }
    const unknownIds = uniqueIds.filter((userId) => !knownNames[userId])
    if (unknownIds.length === 0) return

    const { data, error } = await supabaseClient
      .from('profiles')
      .select('user_id,username')
      .in('user_id', unknownIds)

    if (error || !data) {
      if (error) {
        console.error('Failed to load reaction user names:', error)
      }
      return
    }

    const fetchedNames: Record<string, string> = {}
    for (const row of data as Array<{ user_id: string | null; username: string | null }>) {
      if (!row.user_id) continue
      fetchedNames[row.user_id] = row.username?.trim() || `User ${row.user_id.slice(0, 6)}`
    }

    if (Object.keys(fetchedNames).length === 0) return

    setReactionUserNames((prev) => ({
      ...prev,
      ...fetchedNames,
    }))
  }, [supabaseClient])

  useEffect(() => {
    const userIds = Array.from(
      new Set(
        Object.values(messageReactions).flatMap((reactionsByEmoji) =>
          Object.values(reactionsByEmoji).flatMap((users) => users),
        ),
      ),
    )
    if (userIds.length === 0) return
    void ensureReactionUserNames(userIds)
  }, [messageReactions, ensureReactionUserNames])

  useEffect(() => {
    if (!cacheHydratedRef.current) return
    hotChatCacheByScope[cacheScope] = {
      messages,
      reactions: messageReactions,
      at: Date.now(),
    }
    writeChatCache(cacheScope, messages, messageReactions)
  }, [cacheScope, messageReactions, messages])

  const loadReactionsForMessageIds = useCallback(async (messageIds: string[]) => {
    if (!supabaseClient) return {}
    if (messageIds.length === 0) return {}
    const { data, error } = await supabaseClient
      .from(reactionTable)
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
  }, [reactionTable, supabaseClient])

  const refreshVisibleReactions = useCallback(async (messageIdsOverride?: string[]) => {
    if (!supabaseClient) return
    if (reactionSyncInFlightRef.current) return

    const visibleMessageIds = (messageIdsOverride && messageIdsOverride.length > 0
      ? messageIdsOverride
      : messagesRef.current.map((message) => message.id))
    if (visibleMessageIds.length === 0) {
      setMessageReactions({})
      hotChatCacheByScope[cacheScope] = {
        messages: messagesRef.current,
        reactions: {},
        at: Date.now(),
      }
      return
    }

    reactionSyncInFlightRef.current = true
    try {
      const reactionMap = await loadReactionsForMessageIds(visibleMessageIds)
      if (reactionMap) {
        setMessageReactions(reactionMap)
        hotChatCacheByScope[cacheScope] = {
          messages: messagesRef.current,
          reactions: reactionMap,
          at: Date.now(),
        }
        writeChatCache(cacheScope, messagesRef.current, reactionMap)
      }
    } finally {
      reactionSyncInFlightRef.current = false
    }
  }, [cacheScope, loadReactionsForMessageIds, supabaseClient])

  useEffect(() => {
    if (!isFullMode) return
    setIsOpen(true)
  }, [isFullMode])

  useEffect(() => {
    const hotCache = hotChatCacheByScope[cacheScope]
    const isHotCacheFresh = Boolean(hotCache?.messages.length && Date.now() - hotCache.at <= CHAT_CACHE_TTL_MS)
    if (isHotCacheFresh && hotCache) {
      setMessages(hotCache.messages)
      messagesRef.current = hotCache.messages
      setMessageReactions(hotCache.reactions)
      cacheHydratedRef.current = true
      return
    }

    const sessionCache = readChatCache(cacheScope)
    if (sessionCache && sessionCache.messages.length > 0) {
      setMessages(sessionCache.messages)
      messagesRef.current = sessionCache.messages
      setMessageReactions(sessionCache.reactions)
      hotChatCacheByScope[cacheScope] = {
        messages: sessionCache.messages,
        reactions: sessionCache.reactions,
        at: sessionCache.at,
      }
    }
    cacheHydratedRef.current = true
  }, [cacheScope])

  // Load initial messages once on mount
  useEffect(() => {
    if (!supabaseClient) return

    const loadMessages = async () => {
      const query = supabaseClient
        .from(messageTable)
        .select('*')
        .order('created_at', { ascending: false })
        .limit(MAX_MESSAGES)
      if (classId) query.eq('class_id', classId)
      const { data } = await query
      if (data) {
        const latestMessages = (data as PublicMessage[]).reverse()
        setMessages(latestMessages)
        messagesRef.current = latestMessages
        hotChatCacheByScope[cacheScope] = {
          messages: latestMessages,
          reactions: hotChatCacheByScope[cacheScope]?.reactions || {},
          at: Date.now(),
        }
        const ids = latestMessages.map((message) => message.id)
        if (ids.length > 0) {
          await refreshVisibleReactions(ids)
        } else {
          setMessageReactions({})
          hotChatCacheByScope[cacheScope] = {
            messages: latestMessages,
            reactions: {},
            at: Date.now(),
          }
          writeChatCache(cacheScope, latestMessages, {})
        }
      }
    }

    void loadMessages()
  }, [cacheScope, classId, messageTable, refreshVisibleReactions, supabaseClient])

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
    let active = true
    let recoveryTimer: ReturnType<typeof setTimeout> | undefined

    const messageFilter = classId ? `class_id=eq.${classId}` : undefined
    const messageSubscription = messageFilter
      ? { event: 'INSERT' as const, schema: 'public', table: messageTable, filter: messageFilter }
      : { event: 'INSERT' as const, schema: 'public', table: messageTable }
    const messageUpdateSubscription = messageFilter
      ? { event: 'UPDATE' as const, schema: 'public', table: messageTable, filter: messageFilter }
      : { event: 'UPDATE' as const, schema: 'public', table: messageTable }
    const messageDeleteSubscription = messageFilter
      ? { event: 'DELETE' as const, schema: 'public', table: messageTable, filter: messageFilter }
      : { event: 'DELETE' as const, schema: 'public', table: messageTable }

    const channel = supabaseClient
      // A retiring popup/full-page subscription must not close its replacement.
      .channel(`${classId ? `class_chat_${classId}` : 'public_chat'}:${channelInstanceId}:${++subscriptionNumberRef.current}`)
      .on(
        'postgres_changes',
        messageSubscription,
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
        messageUpdateSubscription,
        (payload) => {
          const updatedMessage = payload.new as PublicMessage
          setMessages((prev) => prev.map((message) => (message.id === updatedMessage.id ? updatedMessage : message)))
        },
      )
      .on(
        'postgres_changes',
        messageDeleteSubscription,
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
        { event: 'INSERT', schema: 'public', table: reactionTable },
        (payload) => {
          const row = payload.new as PublicMessageReaction
          void ensureReactionUserNames([row.user_id])
          setMessageReactions((prev) => addReactionToMap(prev, row.message_id, row.emoji, row.user_id))
          window.setTimeout(() => {
            void refreshVisibleReactions()
          }, 220)
        },
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: reactionTable },
        (payload) => {
          const row = payload.old as PublicMessageReaction
          setMessageReactions((prev) => removeReactionFromMap(prev, row.message_id, row.emoji, row.user_id))
          window.setTimeout(() => {
            void refreshVisibleReactions()
          }, 220)
        },
      )
      .subscribe((status, error) => {
        if (!active) return
        if (error) console.warn('Chat realtime subscription:', error.message)
        setConnectionStatus(status === 'SUBSCRIBED' ? 'live' : status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED' ? 'reconnecting' : 'connecting')
        if (status === 'SUBSCRIBED') {
          closedRetryCountRef.current = 0
          clearTimeout(recoveryTimer)
          recoveryTimer = undefined
        } else if (status === 'CLOSED' && recoveryTimer === undefined) {
          // The SDK retries errors/timeouts itself, but a CLOSED channel stops
          // its rejoin timer. Recover only unexpected closes, with capped delay.
          const delay = Math.min(1000 * 2 ** Math.min(closedRetryCountRef.current++, 5), 30_000)
          recoveryTimer = setTimeout(() => {
            if (active) setConnectionAttempt((attempt) => attempt + 1)
          }, delay)
        }
      })

    return () => {
      active = false
      clearTimeout(recoveryTimer)
      subscribedRef.current = false
      supabaseClient.removeChannel(channel)
    }
  }, [channelInstanceId, classId, connectionAttempt, ensureReactionUserNames, messageTable, reactionTable, refreshVisibleReactions, supabaseClient])

  // Poll for new messages every 5 seconds (lightweight fallback)
  useEffect(() => {
    if (!supabaseClient) return

    const pollMessages = async () => {
      const query = supabaseClient
        .from(messageTable)
        .select('*')
        .order('created_at', { ascending: false })
        .limit(MAX_MESSAGES)
      if (classId) query.eq('class_id', classId)
      const { data } = await query
      if (data) {
        const latestMessages = (data as PublicMessage[]).reverse()
        const existingIds = new Set(messagesRef.current.map((message) => message.id))
        const newMessageDetected = latestMessages.some((m) => !existingIds.has(m.id))

        setMessages(latestMessages)
        messagesRef.current = latestMessages
        hotChatCacheByScope[cacheScope] = {
          messages: latestMessages,
          reactions: hotChatCacheByScope[cacheScope]?.reactions || {},
          at: Date.now(),
        }
        void refreshVisibleReactions(latestMessages.map((message) => message.id))

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
  }, [cacheScope, classId, messageTable, refreshVisibleReactions, supabaseClient])

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
      if (!target.closest('.global-chat-reaction') && !target.closest('.global-chat-reaction-tooltip')) {
        setReactionHover(null)
      }
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
    setReactionHover(null)
    
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
    if (!supabaseClient || !isAuthenticated || sending) return
    
    const trimmed = inputValue.trim()
    if (!trimmed || trimmed.length > MESSAGE_MAX_LENGTH) return
    
    const now = Date.now()
    if (now - lastSentRef.current < RATE_LIMIT_MS) {
      setSendError('Give it a moment, then send your next message.')
      return
    }
    lastSentRef.current = now

    setSending(true)
    setSendError('')
    setInputValue('')

    try {
      const { error } = await supabaseClient.from(messageTable).insert({
        ...(classId ? { class_id: classId, department_name: userAgency || null } : { agency: userAgency || null }),
        user_id: currentUserId,
        display_name: currentUsername,
        message: trimmed,
      })
      if (error) throw error
      // Reload messages after sending
      const query = supabaseClient
        .from(messageTable)
        .select('*')
        .order('created_at', { ascending: false })
        .limit(MAX_MESSAGES)
      if (classId) query.eq('class_id', classId)
      const { data } = await query
      if (data) {
        const latestMessages = (data as PublicMessage[]).reverse()
        setMessages(latestMessages)
        messagesRef.current = latestMessages
        hotChatCacheByScope[cacheScope] = {
          messages: latestMessages,
          reactions: hotChatCacheByScope[cacheScope]?.reactions || {},
          at: Date.now(),
        }
        void refreshVisibleReactions(latestMessages.map((message) => message.id))
        // Scroll to bottom after sending
        setTimeout(() => {
          messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
        }, 100)
      }
    } catch (err) {
      console.error('Failed to send message:', err)
      setInputValue(trimmed)
      setSendError('Your message wasn’t sent. Your draft is saved here; try again.')
    } finally {
      setSending(false)
    }
  }, [cacheScope, classId, inputValue, currentUserId, currentUsername, messageTable, userAgency, supabaseClient, isAuthenticated, refreshVisibleReactions, sending])

  const addEmojiToInput = useCallback((emoji: string) => {
    setInputValue((previous) => previous.length + emoji.length <= MESSAGE_MAX_LENGTH ? `${previous}${emoji}` : previous)
  }, [])

  const formatReactionHoverText = useCallback((users: string[]) => {
    if (users.length === 0) return 'No reactions yet'
    return users
      .map((userId) => {
        if (userId === currentUserId) return 'You'
        return reactionUserNames[userId] || `User ${userId.slice(0, 6)}`
      })
      .join(', ')
  }, [currentUserId, reactionUserNames])

  const showReactionHover = useCallback(
    (event: SyntheticEvent<HTMLElement>, messageId: string, emoji: string, users: string[]) => {
      const target = event.currentTarget
      const rect = target.getBoundingClientRect()
      const estimatedChars = users.reduce((total, userId) => {
        const label = userId === currentUserId ? 'You' : (reactionUserNames[userId] || `User ${userId.slice(0, 6)}`)
        return total + label.length + 2
      }, 0)
      const tooltipWidth = Math.min(Math.max(64, estimatedChars * 6.8), Math.min(460, window.innerWidth - 24))
      const left = Math.max(
        12,
        Math.min(rect.left + rect.width / 2 - tooltipWidth / 2, window.innerWidth - tooltipWidth - 12),
      )
      const top = Math.max(12, rect.top - 12)
      const originX = Math.max(8, Math.min(rect.left + rect.width / 2 - left, tooltipWidth - 8))
      setReactionHover({ messageId, emoji, users: [...users], left, top, originX })
      void ensureReactionUserNames(users)
    },
    [currentUserId, ensureReactionUserNames, reactionUserNames],
  )

  const hideReactionHover = useCallback((messageId: string, emoji: string) => {
    setReactionHover((previous) => {
      if (!previous) return previous
      if (previous.messageId !== messageId || previous.emoji !== emoji) return previous
      return null
    })
  }, [])

  const openReactionPicker = useCallback((anchor: HTMLElement, messageId: string) => {
    setReactionHover(null)
    const buttonRect = anchor.getBoundingClientRect()
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
      previous?.messageId === messageId ? null : { messageId, left, top },
    )
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
          .from(reactionTable)
          .delete()
          .eq('message_id', messageId)
          .eq('emoji', emoji)
          .eq('user_id', currentUserId)
        if (error) throw error
      } else {
        const { error } = await supabaseClient
          .from(reactionTable)
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
  }, [currentUserId, isAuthenticated, messageReactions, reactionTable, refreshVisibleReactions, supabaseClient])

  // Handle report
  const handleReport = useCallback(async (messageId: string) => {
    if (!supabaseClient || !reportReason.trim()) return

    await supabaseClient.from(reportTable).insert({
      message_id: messageId,
      reporter_user_id: currentUserId,
      reason: reportReason.trim(),
    })

    setReportModalOpen(null)
    setReportReason('')
  }, [reportReason, currentUserId, reportTable, supabaseClient])

  // Handle delete
  const handleDelete = useCallback(async (messageId: string) => {
    if (!supabaseClient || !canModerateMessages) return

    if (classId) {
      await supabaseClient.rpc('class_moderate_message', {
        p_message_id: messageId,
        p_action: 'delete',
      })
      return
    }

    await supabaseClient.from(messageTable).update({
      is_deleted: true,
      deleted_at: new Date().toISOString(),
      deleted_by: currentUserId,
      message: '[Message deleted]',
    }).eq('id', messageId)
  }, [canModerateMessages, classId, currentUserId, messageTable, supabaseClient])

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
      
      // Read only the permitted public classmate study summary
      const { data: appState } = await supabaseClient
        .from('public_study_profiles')
        .select('profile_details,mastered_codes')
        .eq('user_id', userId)
        .maybeSingle()
      
      // Get duel stats for 'all' game types
      const { data: duelStats } = await supabaseClient
        .from('duel_player_stats')
        .select('wins, losses, current_win_streak')
        .eq('user_id', userId)
        .eq('game_type', 'all')
        .maybeSingle()
      
      // Only the aggregate mastery count is shared with classmates.
      const masteredCodes = Math.max(0, Number(appState?.mastered_codes) || 0)
      
      // Extract study stats from profile_details
      let studySeconds = 0
      let studyDayStreak = 0
      let mostStudiedMode = ''
      let profileDecorationKey = 'auto'
      let levelSnapshot: Record<string, unknown> | null = null
      if (appState?.profile_details) {
        const details = appState.profile_details as {
          profileDecorationKey?: string
          levelSnapshot?: Record<string, unknown>
          stats?: { studySeconds?: number; studyDayStreak?: number; studyModeCounts?: Record<string, number> }
        }
        profileDecorationKey = typeof details.profileDecorationKey === 'string' ? details.profileDecorationKey : 'auto'
        levelSnapshot = details.levelSnapshot && typeof details.levelSnapshot === 'object' ? details.levelSnapshot : null
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
        
        const levelProfile = userLevels?.[userId]
        const level = levelProfile?.level ?? Math.max(1, Math.floor(Number(levelSnapshot?.level || 1)))
        const tierName = levelProfile?.tierName ?? String(levelSnapshot?.tierName || 'Recruit')
        const totalXp = levelProfile?.totalXp ?? Math.max(0, Math.floor(Number(levelSnapshot?.totalXp || 0)))
        const haloClass = levelProfile?.haloClass ?? String(levelSnapshot?.haloClass || 'level-halo-recruit')
        const autoDecorationKey = levelProfile?.autoDecorationKey ?? (typeof levelSnapshot?.autoDecorationKey === 'string' ? levelSnapshot.autoDecorationKey : undefined)

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
          level,
          tierName,
          totalXp,
          haloClass,
          profileDecorationKey,
          autoDecorationKey,
        })
      }
    } catch (err) {
      console.error('Failed to fetch profile:', err)
    } finally {
      setProfileLoading(false)
    }
  }, [leaderboardFirstSpotCounts, supabaseClient, userLevels])

  const openUserProfile = useCallback((userId: string) => {
    if (onOpenProfile) {
      onOpenProfile(userId)
      return
    }
    void fetchUserProfile(userId)
  }, [fetchUserProfile, onOpenProfile])

  const formatTime = (dateStr: string) => new Date(dateStr).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  const conversationTitle = classLabel || (classId ? 'Class conversation' : 'Academy conversation')
  const ConversationHeading = isFullMode ? 'h1' : 'h2'

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
          <header className="global-chat-header">
            <div className="global-chat-room-mark"><ChatIcon name="chat" size={23} /></div>
            <div className="global-chat-heading">
              <span className="global-chat-eyebrow">180 Academy · Messages</span>
              <ConversationHeading className="global-chat-title">{conversationTitle}</ConversationHeading>
              <p>{classId ? 'Your class. One conversation.' : 'A place to learn together.'}</p>
            </div>
            <div className="global-chat-header-actions">
              <span className={`global-chat-connection ${connectionStatus}`} role="status">
                <i aria-hidden="true" />{connectionStatus === 'live' ? 'Live updates' : connectionStatus === 'connecting' ? 'Connecting' : 'Reconnecting'}
              </span>
              {!isFullMode && (
                <button className="global-chat-close" onClick={() => setIsOpen(false)} aria-label="Close chat"><ChatIcon name="close" size={18} /></button>
              )}
            </div>
          </header>
          <div className="global-chat-context">
            <span><span aria-hidden="true">#</span> general</span>
            <p>Share a question. Help a classmate. Keep moving forward.</p>
          </div>

          <div className="global-chat-messages" ref={containerRef} onScroll={handleScroll} role="log" aria-label={`${conversationTitle} messages`} aria-live="polite" aria-relevant="additions">
            {messages.length === 0 && (
              <div className="global-chat-empty">
                <span><ChatIcon name="chat" size={29} /></span>
                <h3>Great progress starts with a conversation.</h3>
                <p>Ask a study question, share a useful tip, or say hello to your class.</p>
              </div>
            )}
            {messages.map((msg, index) => {
              const messageDisplayName = String(msg.display_name || '').trim().toLowerCase()
              const isSystemMessage = messageDisplayName === 'system' || messageDisplayName === '🔔 system'
              const isOwnMessage = msg.user_id === currentUserId && !isSystemMessage
              const messageLevel = userLevels?.[msg.user_id] || { level: 1, tierName: 'Recruit', totalXp: 0, haloClass: 'level-halo-recruit' }

              return (
                <Fragment key={msg.id}>
                  {(index === 0 || new Date(messages[index - 1].created_at).toDateString() !== new Date(msg.created_at).toDateString()) && (
                    <div className="global-chat-day"><span>{messageDayLabel(msg.created_at)}</span></div>
                  )}
                  <article className={`global-chat-message-row ${isOwnMessage ? 'own' : ''} ${isSystemMessage ? 'system' : ''}`}>
                    {isSystemMessage ? (
                      <span className="global-chat-message-avatar system" aria-hidden="true"><ChatIcon name="chat" size={16} /></span>
                    ) : (
                      <button className="global-chat-message-avatar" onClick={() => openUserProfile(msg.user_id)} aria-label={`View ${msg.display_name}'s profile`}>{messageInitials(msg.display_name)}</button>
                    )}
                    <div className={`global-chat-message ${isOwnMessage ? 'own' : ''} ${msg.is_deleted ? 'deleted' : ''}`}>
                  <div className="global-chat-message-header">
                    {isSystemMessage ? (
                      <span className="global-chat-name global-chat-name-system">{msg.display_name}</span>
                    ) : (
                      <button className="global-chat-name" onClick={() => openUserProfile(msg.user_id)}>
                        {msg.display_name}
                      </button>
                    )}
                    {!isSystemMessage ? (
                      <span className={`global-chat-level ${messageLevel.haloClass}`}>Lv {messageLevel.level}</span>
                    ) : null}
                    {(msg.agency || msg.department_name) && <span className="global-chat-agency">{msg.agency || msg.department_name}</span>}
                  </div>
                  <p className="global-chat-text">{msg.message}</p>
                  <div className="global-chat-message-footer">
                  <div className="global-chat-reactions">
                    {Object.entries(messageReactions[msg.id] || {})
                      .filter(([, users]) => users.length > 0)
                      .sort((left, right) => right[1].length - left[1].length)
                      .map(([emoji, users]) => {
                        const count = users.length
                        const active = users.includes(currentUserId)
                        const hoverLabel = formatReactionHoverText(users)
                        return (
                          <button
                            key={`${msg.id}-${emoji}`}
                            type="button"
                            className={active ? 'global-chat-reaction active' : 'global-chat-reaction'}
                            title={hoverLabel}
                            aria-pressed={active}
                            aria-label={`${emoji} reaction • ${count} ${count === 1 ? 'person' : 'people'} • ${hoverLabel}`}
                            onMouseEnter={(event) => showReactionHover(event, msg.id, emoji, users)}
                            onMouseLeave={() => hideReactionHover(msg.id, emoji)}
                            onFocus={(event) => showReactionHover(event, msg.id, emoji, users)}
                            onBlur={() => hideReactionHover(msg.id, emoji)}
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
                        onMouseDown={(event) => {
                          event.preventDefault()
                          event.stopPropagation()
                          openReactionPicker(event.currentTarget, msg.id)
                        }}
                        onKeyDown={(event) => {
                          if (event.key !== 'Enter' && event.key !== ' ') return
                          event.preventDefault()
                          event.stopPropagation()
                          openReactionPicker(event.currentTarget, msg.id)
                        }}
                        aria-label="Add reaction"
                      >
                        <span className="global-chat-reaction-add-plus">+</span>
                        <span className="global-chat-reaction-add-emoji">😊</span>
                      </button>
                    ) : null}
                  </div>
                    <time className="global-chat-time" dateTime={msg.created_at} title={new Date(msg.created_at).toLocaleString()}>{formatTime(msg.created_at)}</time>
                    <div className="global-chat-message-tools">
                      {!msg.is_deleted && msg.user_id !== currentUserId && (
                        <button className="global-chat-report" onClick={() => setReportModalOpen(msg.id)} aria-label="Report message" title="Report message"><ChatIcon name="flag" size={14} /></button>
                      )}
                      {canModerateMessages && !msg.is_deleted && (
                        <button className="global-chat-delete" onClick={() => handleDelete(msg.id)} aria-label="Delete message" title="Delete message"><ChatIcon name="trash" size={14} /></button>
                      )}
                    </div>
                  </div>
                    </div>
                  </article>
                </Fragment>
              )
            })}
            <div ref={messagesEndRef} />
          </div>
          {reactionPicker ? (
            <div
              className="global-chat-reaction-picker"
              style={{
                left: `${reactionPicker.left}px`,
                top: `${reactionPicker.top}px`,
              }}
              onMouseDown={(event) => {
                event.preventDefault()
                event.stopPropagation()
              }}
            >
              <p className="global-chat-reaction-picker-title">Popular</p>
              <div className="global-chat-reaction-picker-row">
                {popularReactionEmojis.map((emoji) => (
                  <button
                    key={`popular-${reactionPicker.messageId}-${emoji}`}
                    type="button"
                    className="global-chat-reaction-option"
                    onClick={(event) => {
                      event.preventDefault()
                      event.stopPropagation()
                      void toggleReaction(reactionPicker.messageId, emoji)
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
                    key={`all-${reactionPicker.messageId}-${emoji}`}
                    type="button"
                    className="global-chat-reaction-option"
                    onClick={(event) => {
                      event.preventDefault()
                      event.stopPropagation()
                      void toggleReaction(reactionPicker.messageId, emoji)
                      setReactionPicker(null)
                    }}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
          {reactionHover ? (
            <div
              className="global-chat-reaction-tooltip"
              style={{
                left: `${reactionHover.left}px`,
                top: `${reactionHover.top}px`,
                transformOrigin: `${reactionHover.originX}px calc(100% + 10px)`,
              }}
            >
              {formatReactionHoverText(reactionHover.users)}
            </div>
          ) : null}

          {hasNewMessages && (
            <button className="global-chat-new-indicator" onClick={scrollToBottom}><ChatIcon name="down" size={15} /> New messages</button>
          )}

          <div className="global-chat-composer">
            {isAuthenticated ? (
              <>
                {sendError && <p className="global-chat-send-error" role="alert">{sendError}</p>}
                <div className="global-chat-input-row">
                  <textarea
                    className="global-chat-input"
                    placeholder="Message your class…"
                    aria-label="Message"
                    rows={2}
                    value={inputValue}
                    onChange={(event) => { setInputValue(event.target.value); setSendError('') }}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
                        event.preventDefault()
                        void sendMessage()
                      }
                    }}
                    maxLength={MESSAGE_MAX_LENGTH}
                    disabled={sending}
                  />
                  <div className="global-chat-composer-toolbar">
                    <button type="button" className={`global-chat-emoji-toggle ${showQuickEmojis ? 'active' : ''}`} aria-label="Insert an emoji" aria-expanded={showQuickEmojis} onClick={() => setShowQuickEmojis((value) => !value)}><ChatIcon name="smile" /></button>
                    <span className="global-chat-composer-hint">Enter to send · Shift + Enter for a new line</span>
                    <span className={`global-chat-count ${inputValue.length >= MESSAGE_MAX_LENGTH ? 'limit' : ''}`} aria-label={`${inputValue.length} of ${MESSAGE_MAX_LENGTH} characters`}>{inputValue.length}/{MESSAGE_MAX_LENGTH}</span>
                    <button type="button" className="global-chat-send" onClick={() => void sendMessage()} disabled={sending || !inputValue.trim()} aria-label={sending ? 'Sending message' : 'Send message'}>
                      <span>{sending ? 'Sending' : 'Send'}</span><ChatIcon name="send" size={17} />
                    </button>
                  </div>
                </div>
                {showQuickEmojis && (
                  <div className="global-chat-emoji-row" aria-label="Quick emojis">
                    {quickInsertEmojis.map((emoji) => <button key={`insert-${emoji}`} type="button" className="global-chat-emoji-btn" disabled={sending} aria-label={`Insert ${emoji}`} onClick={() => addEmojiToInput(emoji)}>{emoji}</button>)}
                  </div>
                )}
                <p className="global-chat-composer-note">{classId ? 'A shared space for your class. Keep it helpful and respectful.' : 'Keep the conversation supportive and respectful.'}</p>
              </>
            ) : <p className="global-chat-signin">Sign in to join the conversation.</p>}
          </div>
        </div>
      )}

      {reportModalOpen && (
        <div className="global-chat-modal-overlay" onClick={() => setReportModalOpen(null)}>
          <div className="global-chat-modal" role="dialog" aria-modal="true" aria-labelledby="chat-report-title" onClick={(e) => e.stopPropagation()}>
            <span className="global-chat-modal-symbol"><ChatIcon name="flag" size={22} /></span>
            <h4 id="chat-report-title">Report a message</h4>
            <p className="global-chat-modal-description">Help keep the conversation useful and respectful. Choose the reason for your report.</p>
            <select aria-label="Report reason" value={reportReason} onChange={(e) => setReportReason(e.target.value)}>
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
	              <div className={`profile-modal-avatar avatar-decoration-wrap level-halo-frame ${selectedProfile.haloClass}`}>
	                {selectedProfile.avatarUrl ? (
                  <img src={selectedProfile.avatarUrl} alt={selectedProfile.username} />
                ) : (
                  <div className="profile-avatar-placeholder">
                    {selectedProfile.username.charAt(0).toUpperCase()}
                  </div>
                )}
                <ProfileAvatarDecoration
                  decoration={getEffectiveProfileDecorationForLevel(selectedProfile.level, selectedProfile.profileDecorationKey)}
                />
              </div>
	              <div className="profile-modal-info">
	                <h4>{selectedProfile.username}</h4>
	                <span className={`global-chat-profile-level ${selectedProfile.haloClass}`}>Lv {selectedProfile.level} • {selectedProfile.tierName} • {selectedProfile.totalXp.toLocaleString()} XP</span>
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
