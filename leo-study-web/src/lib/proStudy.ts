export type PracticeSetup = { id: string; name: string; module: 'tmas1' | 'tmas2' | 'tmas3'; length: number }
export type ProStudyPreferences = { weeklySessions: number; setups: PracticeSetup[] }
export function sanitizeProStudyPreferences(raw: unknown): ProStudyPreferences {
  const value = raw && typeof raw === 'object' ? raw as Partial<ProStudyPreferences> : {}
  return { weeklySessions: Math.max(1,Math.min(30,Math.round(Number(value.weeklySessions) || 5))),
    setups: Array.isArray(value.setups) ? value.setups.filter(row => row && typeof row.id === 'string' && ['tmas1','tmas2','tmas3'].includes(row.module) && [10,20,50,100].includes(row.length)).slice(0,8).map(row => ({...row,name:String(row.name || 'Practice setup').slice(0,40)})) : [] }
}
export type ProAnalytics = {
  current: { sessions: number; accuracy: number | null }; previous: { sessions: number; accuracy: number | null }
  sessionDelta: number; accuracyDelta: number | null; calendar: {date:string;count:number}[]
  weaknesses: {codeSet:'penal'|'hs'|'vehicle';sectionNumber:string;title:string;attempts:number;accuracy:number}[]
  trackedSessions:number;weekStart:string;generatedAt:string
}
