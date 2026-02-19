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

type Props = {
  currentUserId: string
  currentUsername: string
  userAgency?: string
  isOwner?: boolean
}

const MAX_MESSAGES = 100
const MESSAGE_MAX_LENGTH = 280
const RATE_LIMIT_MS = 2000

export function GlobalChatWidget({ currentUserId, currentUsername, userAgency, isOwner }: Props) {
  const [isOpen, setIsOpen] = useState(() => {
    if (typeof window === 'undefined') return false
    const stored = localStorage.getItem('globalChatOpen')
    return stored ? stored === 'true' : false
  })
  const [messages, setMessages] = useState<PublicMessage[]>([])
  const [inputValue, setInputValue] = useState('')
  const [sending, setSending] = useState(false)
  const [unreadCount, setUnreadCount] = useState(0)
  const [showNewMessagesIndicator, setShowNewMessagesIndicator] = useState(false)
  const [reportModalOpen, setReportModalOpen] = useState<string | null>(null)
  const [reportReason, setReportReason] = useState('')
  
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const lastSentRef = useRef(0)
  const isNearBottomRef = useRef(true)
  const subscribedRef = useRef(false)
  const supabaseClient = supabase

  const isAuthenticated = Boolean(currentUserId && supabaseClient)

  // Load initial messages
  useEffect(() => {
    if (!supabaseClient) return

    const loadMessages = async () => {
      
      const { data, error } = await supabaseClient
        .from('public_messages')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(MAX_MESSAGES)
      
      
      if (data) {
        setMessages(data.reverse())
      }
    }

    loadMessages()
  }, [supabaseClient])

  const isOpenRef = useRef(isOpen)
  isOpenRef.current = isOpen

  // Fallback: poll for new messages every 30 seconds (reduced to prevent excessive re-renders)
  useEffect(() => {
    if (!supabaseClient) return

    const pollMessages = async () => {
      const { data } = await supabaseClient
        .from('public_messages')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(MAX_MESSAGES)
      if (data) {
        setMessages(data.reverse())
      }
    }

    const interval = setInterval(pollMessages, 30000)
    return () => clearInterval(interval)
  }, [supabaseClient])

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
            setTimeout(() => {
              messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
            }, 50)
          } else if (!isOpenRef.current) {
            setUnreadCount((c) => c + 1)
          } else {
            setShowNewMessagesIndicator(true)
          }
        }
      )
      .subscribe(() => {})

    return () => {
      supabaseClient.removeChannel(channel)
    }
  }, [supabaseClient])

  // Persist open state
  useEffect(() => {
    if (typeof window === 'undefined') return
    localStorage.setItem('globalChatOpen', String(isOpen))
    if (isOpen) {
      setUnreadCount(0)
      setShowNewMessagesIndicator(false)
      // Scroll to bottom when opening
      setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'auto' })
      }, 100)
    }
  }, [isOpen])

  // Check scroll position
  const handleScroll = useCallback(() => {
    if (!containerRef.current) return
    const { scrollTop, scrollHeight, clientHeight } = containerRef.current
    const distanceFromBottom = scrollHeight - scrollTop - clientHeight
    isNearBottomRef.current = distanceFromBottom < 100
    
    if (isNearBottomRef.current) {
      setShowNewMessagesIndicator(false)
    }
  }, [])

  // Scroll to bottom
  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    setShowNewMessagesIndicator(false)
    isNearBottomRef.current = true
  }, [])

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
      // Reload messages to see the new one
      const { data } = await supabaseClient
        .from('public_messages')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(MAX_MESSAGES)
      if (data) {
        setMessages(data.reverse())
      }
    } catch (err) {
      console.error('Failed to send message:', err)
    } finally {
      setSending(false)
    }
  }, [inputValue, currentUserId, currentUsername, userAgency, supabaseClient, isAuthenticated])

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

  if (!supabaseClient) return null

  return (
    <div className="global-chat-widget">
      {!isOpen && (
        <button
          className="global-chat-toggle"
          onClick={() => setIsOpen(true)}
          aria-label="Open chat"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
          {unreadCount > 0 && <span className="global-chat-badge">{unreadCount > 9 ? '9+' : unreadCount}</span>}
        </button>
      )}

      {isOpen && (
        <div className="global-chat-panel">
          <div className="global-chat-header">
            <span>Public Chat</span>
            <button className="global-chat-close" onClick={() => setIsOpen(false)} aria-label="Close chat">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>

          <div className="global-chat-messages" ref={containerRef} onScroll={handleScroll}>
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`global-chat-message ${msg.user_id === currentUserId ? 'own' : ''} ${msg.is_deleted ? 'deleted' : ''}`}
              >
                <div className="global-chat-message-header">
                  <span className="global-chat-name">{msg.display_name}</span>
                  {msg.agency && <span className="global-chat-agency">{msg.agency}</span>}
                  <span className="global-chat-time">{formatTime(msg.created_at)}</span>
                </div>
                <p className="global-chat-text">{msg.message}</p>
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

          {showNewMessagesIndicator && (
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
              <button className="secondary" onClick={() => setReportModalOpen(null)}>Cancel</button>
              <button className="primary" onClick={() => handleReport(reportModalOpen)} disabled={!reportReason.trim()}>
                Report
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
