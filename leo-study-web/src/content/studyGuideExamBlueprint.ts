export type StudyGuideExamId = 'tmas1' | 'tmas2' | 'tmas3'

export type StudyGuideExamCoverage = {
  id: StudyGuideExamId
  shortLabel: string
  teamLabel: string
  examLabel: string
  weekLabel: string
}

const studyGuideExamDefinitions: Record<StudyGuideExamId, StudyGuideExamCoverage> = {
  tmas1: {
    id: 'tmas1',
    shortLabel: 'TMAS 1',
    teamLabel: 'TMAS 1',
    examLabel: 'Comprehensive Exam #1',
    weekLabel: 'Week 6',
  },
  tmas2: {
    id: 'tmas2',
    shortLabel: 'TMAS 2',
    teamLabel: 'TMAS 2',
    examLabel: 'Comprehensive Exam #2',
    weekLabel: 'Week 12',
  },
  tmas3: {
    id: 'tmas3',
    shortLabel: 'TMAS 3',
    teamLabel: 'TMAS 3',
    examLabel: 'Comprehensive Exam #3',
    weekLabel: 'Week 19',
  },
}

const ldToExamIds: Partial<Record<string, StudyGuideExamId[]>> = {
  '5': ['tmas1', 'tmas2', 'tmas3'],
  '6': ['tmas2', 'tmas3'],
  '7': ['tmas2', 'tmas3'],
  '8': ['tmas2', 'tmas3'],
  '9': ['tmas2', 'tmas3'],
  '10': ['tmas2', 'tmas3'],
  '11': ['tmas3'],
  '12': ['tmas3'],
  '15': ['tmas1', 'tmas2', 'tmas3'],
  '16': ['tmas1', 'tmas2', 'tmas3'],
  '20': ['tmas1', 'tmas2', 'tmas3'],
  '25': ['tmas3'],
  '26': ['tmas3'],
  '28': ['tmas3'],
  '37': ['tmas3'],
  '39': ['tmas1', 'tmas2', 'tmas3'],
  '40': ['tmas3'],
  '43': ['tmas3'],
}

export const studyGuideExamCoverageSourceNote =
  'Mapped from “Success Criteria Class 180,” which lists TMAS 1, TMAS 2, and TMAS 3 comprehensive exam LD coverage.'

export function getStudyGuideExamCoverage(ldNumber: string): StudyGuideExamCoverage[] {
  return (ldToExamIds[ldNumber] ?? []).map((examId) => studyGuideExamDefinitions[examId])
}

export function getStudyGuideExamLdNumbers(examId: StudyGuideExamId): string[] {
  return Object.entries(ldToExamIds)
    .filter(([, examIds]) => examIds?.includes(examId))
    .map(([ldNumber]) => ldNumber)
    .sort((left, right) => Number(left) - Number(right))
}
