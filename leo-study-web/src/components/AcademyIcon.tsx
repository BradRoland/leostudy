import type { ReactNode } from 'react'

export type AcademyIconName = 'home' | 'study' | 'games' | 'scenarios' | 'support' | 'library' | 'flashcards' | 'test' | 'warning' | 'chat' | 'leaderboards' | 'settings' | 'stats' | 'speed' | 'duel' | 'updates' | 'blaster' | 'class' | 'arrow' | 'sun' | 'moon' | 'menu'
const icons: Record<AcademyIconName, ReactNode> = {
  home: <><rect x="3.5" y="3.5" width="6" height="6" rx="1.5"/><rect x="14.5" y="3.5" width="6" height="6" rx="1.5"/><rect x="3.5" y="14.5" width="6" height="6" rx="1.5"/><rect x="14.5" y="14.5" width="6" height="6" rx="1.5"/></>,
  study: <><path d="M12 6v14M3.5 4.5h4.8A4.5 4.5 0 0 1 12 6a4.5 4.5 0 0 1 3.7-1.5h4.8v14h-4.8A4.5 4.5 0 0 0 12 20a4.5 4.5 0 0 0-3.7-1.5H3.5z"/></>,
  games: <><path d="M7 8h10c2.7 0 4.5 7 3.5 10-1 3-4-1.5-5.5-1.5H9c-1.5 0-4.5 4.5-5.5 1.5C2.5 15 4.3 8 7 8Z"/><path d="M7 11v4m-2-2h4m6-1h.01m3 2h.01M10 8V5h4"/></>,
  scenarios: <><rect x="4" y="6" width="16" height="15" rx="2"/><path d="M9 6V3h6v3M8 11h8m-8 4h5"/></>,
  support: <><path d="M5 13v-2a7 7 0 0 1 14 0v2M5 12H3v6h4v-6Zm14 0h2v6h-4v-6ZM19 18c0 3-2 3-5 3"/></>,
  library: <><path d="M4 4v16m5-16v16m5-16 5 16M3 7h3m2 10h3m4-9 3-1"/></>,
  flashcards: <><rect x="7" y="6" width="13" height="15" rx="2"/><path d="M16 3H6a2 2 0 0 0-2 2v12m8-7h4m-4 4h4"/></>,
  test: <><rect x="5" y="3" width="14" height="18" rx="2"/><path d="m8 8 1 1 2-2m2 1h3m-8 5 1 1 2-2m2 1h3m-8 4h8"/></>,
  warning: <><path d="m12 3 10 18H2L12 3Zm0 6v5m0 3h.01"/></>,
  chat: <><path d="M20.5 11.5A8.5 8.5 0 0 1 12 20H3.5v-8.5A8.5 8.5 0 0 1 12 3a8.5 8.5 0 0 1 8.5 8.5Z"/><path d="M8 9h8m-8 5h5"/></>,
  leaderboards: <><path d="M8 3h8v6a4 4 0 0 1-8 0V3Zm0 2H4v3a4 4 0 0 0 4 4m8-7h4v3a4 4 0 0 1-4 4M12 13v5m-4 3v-3h8v3M6 21h12"/></>,
  settings: <><path d="M4 7h16M4 17h16"/><circle cx="9" cy="7" r="3" fill="var(--card-bg,white)"/><circle cx="15" cy="17" r="3" fill="var(--card-bg,white)"/></>,
  stats: <><path d="M4 3v18h17M9 16v-5m5 5V7m5 9V4"/></>,
  speed: <><circle cx="12" cy="13" r="8"/><path d="M12 9v4l3 2M9 2h6m4 3 2 2"/></>,
  duel: <><path d="M4 3h4l12 14-3 3L4 7V3Zm16 0h-4L4 17l3 3 13-13V3ZM2 15l7 7m6 0 7-7"/></>,
  updates: <><path d="M3 10a9 9 0 1 1 2 8M3 4v6h6m3-4v6l3 2"/></>,
  blaster: <><path d="M14 3c3-1 5-1 7-1 0 2 0 4-1 7l-8 8-5-5 7-9Zm-6 7H4l-2 5 6-1m6 2-1 6 5-2v-4M3 21l3-3"/><circle cx="16" cy="7" r="2"/></>,
  class: <><circle cx="9" cy="8" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3m0-16a3 3 0 0 1 0 6m3 3a5 5 0 0 1 3 4v3"/></>,
  arrow: <path d="M4 12h16m-6-6 6 6-6 6"/>,
  sun: <><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/></>,
  moon: <path d="M20.5 14A9 9 0 0 1 10 3.5a9 9 0 1 0 10.5 10.5Z"/>,
  menu: <path d="M4 6h16M4 12h16M4 18h16"/>,
}
export function AcademyIcon({ name, className = '' }: { name: AcademyIconName; className?: string }) {
  return <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className}>{icons[name]}</svg>
}
