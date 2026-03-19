import researchRaw from './study-guide-post-research.json'

export type StudyGuideOfficialChapter = {
  chapter: number
  title: string
  topics: string[]
}

export type StudyGuideOfficialObjective = {
  ids: string[]
  text: string
}

export type StudyGuideOfficialTopicBrief = {
  title: string
  excerpt: string
}

export type StudyGuideOfficialTtsObjective = {
  label: string
  text: string
  explanation: string
  exampleScenario: {
    setup: string
    prompt: string
    answerFocus: string
  }
}

export type StudyGuideOfficialTtsSection = {
  roman: string
  learningNeed: string
  objectives: StudyGuideOfficialTtsObjective[]
}

export type StudyGuideOfficialSynopsisSection = {
  title: string
  points: string[]
}

export type StudyGuideOfficialChapterGuide = {
  chapter: number
  title: string
  topics: string[]
  workbookLearningNeed: string
  workbookObjectives: StudyGuideOfficialObjective[]
  topicBriefs: StudyGuideOfficialTopicBrief[]
  synopsisSections: StudyGuideOfficialSynopsisSection[]
  ttsSection: StudyGuideOfficialTtsSection | null
}

export type StudyGuideOfficialFlashcard = {
  front: string
  back: string
}

export type StudyGuideOfficialResearch = {
  ldNumber: string
  officialTitle: string
  workbookVersion: string
  latestRevision: string
  workbookUrl: string
  trainingSpecUrl: string
  trainingSpecLabel: string
  focusAreas: string[]
  chapterBreakdown: StudyGuideOfficialChapter[]
  chapters: StudyGuideOfficialChapterGuide[]
  studyChecklist: string[]
  requiredTests: string[]
  summary: string
  flashcards: StudyGuideOfficialFlashcard[]
}

export const studyGuideOfficialResearchByLd = researchRaw as Record<string, StudyGuideOfficialResearch>
