import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

const rootDir = process.cwd()
const workbookTextDir = path.join(rootDir, '.tmp-post-workbooks-text')
const trainingSpecDir = path.join(rootDir, '.tmp-post-training-specs')
const outputPath = path.join(rootDir, 'src/content/study-guide-post-research.json')

if (!fs.existsSync(workbookTextDir)) {
  throw new Error(`Missing workbook text directory: ${workbookTextDir}`)
}

if (!fs.existsSync(outputPath)) {
  throw new Error(`Missing existing research JSON: ${outputPath}`)
}

fs.mkdirSync(trainingSpecDir, { recursive: true })

const existingResearch = JSON.parse(fs.readFileSync(outputPath, 'utf8'))

function runCommand(command, args) {
  const result = spawnSync(command, args, { encoding: 'utf8' })
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed:\n${result.stderr || result.stdout}`)
  }
}

function cleanLine(line) {
  return line.replace(/\u000c/g, '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim()
}

function shouldDropWorkbookLine(line) {
  if (!line) return false
  if (/^\d+-\d+$/.test(line)) return true
  if (/^[IVXLC]+$/i.test(line)) return true
  if (/^\d+-\d+\s+/.test(line)) return true
  if (/^[A-Za-z][A-Za-z/&,\-'.() ]+\s+\d+-\d+$/.test(line)) return true
  return false
}

function joinWrappedLines(lines) {
  let result = ''

  for (const line of lines) {
    if (!line) continue

    if (!result) {
      result = line
      continue
    }

    if (result.endsWith('-') && /^[a-z]/.test(line)) {
      result = `${result.slice(0, -1)}${line}`
      continue
    }

    result = `${result} ${line}`
  }

  return result.replace(/\s+/g, ' ').trim()
}

function paragraphize(lines) {
  const paragraphs = []
  let current = []

  for (const line of lines) {
    if (!line) {
      if (current.length > 0) {
        paragraphs.push(joinWrappedLines(current))
        current = []
      }
      continue
    }

    current.push(line)
  }

  if (current.length > 0) {
    paragraphs.push(joinWrappedLines(current))
  }

  return paragraphs.filter(Boolean)
}

function normalizeWorkbookText(raw) {
  return raw
    .replace(/\u000c/g, '\n')
    .replace(/\u00a0/g, ' ')
    .split(/\r?\n/)
    .map(cleanLine)
    .filter((line) => !shouldDropWorkbookLine(line))
}

function findLineIndex(lines, matcher, startIndex = 0) {
  for (let index = startIndex; index < lines.length; index += 1) {
    const line = lines[index]
    if (typeof matcher === 'string') {
      if (line === matcher) return index
      continue
    }

    if (matcher.test(line)) return index
  }

  return -1
}

function extractBlock(lines, startMatcher, endMatchers, startIndex = 0) {
  const start = findLineIndex(lines, startMatcher, startIndex)
  if (start === -1) return { start: -1, end: -1, lines: [] }

  let end = lines.length
  for (let index = start + 1; index < lines.length; index += 1) {
    if (endMatchers.some((matcher) => (typeof matcher === 'string' ? lines[index] === matcher : matcher.test(lines[index])))) {
      end = index
      break
    }
  }

  return { start, end, lines: lines.slice(start + 1, end) }
}

function parseWorkbookObjectives(lines) {
  const text = paragraphize(lines)
    .join('\n')
    .replace(/The chart below identifies the student learning objectives for this chapter\./gi, '')
    .replace(/After completing study of this chapter, the student will be able to:\s*Objective ID/gi, '')
    .trim()

  if (!text) return []

  return text
    .split('•')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const ids = [...entry.matchAll(/\b\d{1,2}\.\d{1,2}\.\d{1,2}\b/g)].map((match) => match[0])
      const textWithoutIds = entry
        .replace(/\b\d{1,2}\.\d{1,2}\.\d{1,2}\b/g, '')
        .replace(/\s+-\s+/g, ' — ')
        .replace(/\s+/g, ' ')
        .trim()

      return {
        ids,
        text: textWithoutIds,
      }
    })
    .filter((objective) => objective.text.length > 0)
}

function isLikelyHeading(paragraph) {
  if (!paragraph) return false
  if (paragraph.length > 120) return false
  if (/[.?!:]$/.test(paragraph)) return false
  return true
}

function parseSynopsisSections(lines) {
  const paragraphs = paragraphize(lines)
  if (paragraphs.length === 0) return []

  const sections = []
  let current = null

  for (const paragraph of paragraphs) {
    if (isLikelyHeading(paragraph)) {
      if (current) sections.push(current)
      current = { title: paragraph, points: [] }
      continue
    }

    if (!current) {
      current = { title: 'Key Point', points: [] }
    }

    current.points.push(paragraph)
  }

  if (current) sections.push(current)

  return sections.filter((section) => section.points.length > 0)
}

function excerptParagraphs(paragraphs, count = 3, maxLength = 900) {
  const selected = []

  for (const paragraph of paragraphs) {
    if (!paragraph || paragraph.length < 25) continue
    if (/^(Introduction|Text|Ethics|Overview|Learning Need|Learning Objectives)$/i.test(paragraph)) continue
    selected.push(paragraph)
    if (selected.length >= count) break
  }

  const joined = selected.join(' ')
  if (joined.length <= maxLength) return joined
  return `${joined.slice(0, maxLength - 1).trimEnd()}…`
}

function normalizeTopicName(value) {
  return value.replace(/\s+/g, ' ').trim().toUpperCase()
}

function parseTopicBriefs(lines, topics) {
  const stopMarkers = ['WORKBOOK LEARNING ACTIVITIES', 'CHAPTER SYNOPSIS', 'GLOSSARY']
  const topicIndices = topics
    .map((topic) => ({
      topic,
      normalized: normalizeTopicName(topic),
      index: findLineIndex(lines, new RegExp(`^${normalizeTopicName(topic).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i')),
    }))
    .filter((entry) => entry.index !== -1 && !['OVERVIEW', 'WORKBOOK LEARNING ACTIVITIES', 'CHAPTER SYNOPSIS'].includes(entry.normalized))
    .sort((left, right) => left.index - right.index)

  return topicIndices
    .map((entry, index) => {
      let end = lines.length
      const nextTopic = topicIndices[index + 1]
      if (nextTopic) end = nextTopic.index

      for (let lineIndex = entry.index + 1; lineIndex < lines.length; lineIndex += 1) {
        if (stopMarkers.includes(normalizeTopicName(lines[lineIndex]))) {
          end = Math.min(end, lineIndex)
          break
        }
      }

      const sectionLines = lines.slice(entry.index + 1, end)
      const paragraphs = paragraphize(sectionLines)
      const excerpt = excerptParagraphs(paragraphs)

      if (!excerpt) return null

      return {
        title: entry.topic,
        excerpt,
      }
    })
    .filter(Boolean)
}

const stopWords = new Set([
  'the', 'and', 'for', 'that', 'with', 'from', 'this', 'they', 'them', 'their', 'into', 'must', 'know', 'what',
  'when', 'where', 'which', 'while', 'under', 'over', 'have', 'has', 'had', 'are', 'was', 'were', 'will', 'would',
  'should', 'could', 'about', 'because', 'being', 'been', 'each', 'such', 'than', 'then', 'also', 'through', 'using',
  'used', 'within', 'across', 'between', 'among', 'peace', 'officers', 'officer'
])

function tokenize(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 2 && !stopWords.has(token))
}

function overlapCount(leftTokens, rightTokens) {
  const right = new Set(rightTokens)
  return new Set(leftTokens).size === 0
    ? 0
    : Array.from(new Set(leftTokens)).reduce((count, token) => count + (right.has(token) ? 1 : 0), 0)
}

function trimWords(value, maxWords = 55) {
  const words = value.replace(/\s+/g, ' ').trim().split(' ').filter(Boolean)
  if (words.length <= maxWords) return words.join(' ')
  return `${words.slice(0, maxWords).join(' ').trimEnd()}…`
}

function sentenceBlocks(value) {
  return value
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?])\s+/)
    .map((entry) => entry.trim())
    .filter(Boolean)
}

function excerptSentences(value, maxSentences = 2, maxWords = 70) {
  const sentences = sentenceBlocks(value).slice(0, maxSentences)
  const joined = sentences.join(' ').trim()
  return joined ? trimWords(joined, maxWords) : trimWords(value, maxWords)
}

function ensureSentence(value) {
  const cleaned = value.replace(/\s+/g, ' ').trim()
  if (!cleaned) return ''
  return /[.!?]$/.test(cleaned) ? cleaned : `${cleaned}.`
}

function lowerCaseFirst(value) {
  if (!value) return value
  return value.charAt(0).toLowerCase() + value.slice(1)
}

function humanizeTopicLabel(value) {
  return value
    .toLowerCase()
    .replace(/\b([a-z])/g, (_, letter) => letter.toUpperCase())
    .replace(/\bUs\b/g, 'U.S.')
    .replace(/\bLgbtq\b/g, 'LGBTQ')
}

function toRoman(value) {
  const numerals = [
    ['X', 10],
    ['IX', 9],
    ['V', 5],
    ['IV', 4],
    ['I', 1],
  ]
  let remaining = value
  let result = ''
  for (const [symbol, amount] of numerals) {
    while (remaining >= amount) {
      result += symbol
      remaining -= amount
    }
  }
  return result
}

function buildObjectiveSourceSnippets(chapter) {
  return [
    chapter.workbookLearningNeed
      ? {
          type: 'learningNeed',
          title: 'Workbook Learning Need',
          text: chapter.workbookLearningNeed,
        }
      : null,
    ...chapter.workbookObjectives.map((objective) => ({
      type: 'workbookObjective',
      title: objective.ids.join(', ') || 'Workbook Objective',
      text: objective.text,
    })),
    ...chapter.topicBriefs.map((brief) => ({
      type: 'topicBrief',
      title: brief.title,
      text: brief.excerpt,
    })),
    ...chapter.synopsisSections.flatMap((section) =>
      section.points.map((point) => ({
        type: 'synopsis',
        title: section.title,
        text: point,
      })),
    ),
  ].filter(Boolean)
}

function pickObjectiveSnippets(chapter, objective) {
  const objectiveTokens = tokenize(`${objective.text} ${chapter.title} ${chapter.workbookLearningNeed || ''}`)
  const chapterTokens = tokenize(`${chapter.title} ${chapter.topics.join(' ')}`)
  const seen = new Set()

  return buildObjectiveSourceSnippets(chapter)
    .map((snippet) => {
      const snippetTokens = tokenize(`${snippet.title} ${snippet.text}`)
      let score = overlapCount(snippetTokens, objectiveTokens) * 4 + overlapCount(snippetTokens, chapterTokens)
      if (snippet.type === 'topicBrief') score += 2
      if (snippet.type === 'learningNeed') score += 1
      return { ...snippet, score }
    })
    .sort((left, right) => right.score - left.score || left.text.length - right.text.length)
    .filter((snippet) => {
      const key = `${snippet.title}::${snippet.text}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    .filter((snippet, index) => snippet.score > 0 || index < 2)
    .slice(0, 3)
}

function buildObjectiveExplanation(chapter, objective) {
  const snippets = pickObjectiveSnippets(chapter, objective)
  const explanationParts = [
    ensureSentence(`POST can test whether the officer can ${lowerCaseFirst(objective.text)}`),
  ]

  if (chapter.workbookLearningNeed) {
    explanationParts.push(
      ensureSentence(`In this chapter, that tested point matters because ${lowerCaseFirst(trimWords(chapter.workbookLearningNeed, 34))}`),
    )
  }

  for (const snippet of snippets.slice(0, 2)) {
    explanationParts.push(ensureSentence(excerptSentences(snippet.text, snippet.type === 'topicBrief' ? 2 : 1, snippet.type === 'topicBrief' ? 80 : 60)))
  }

  if (chapter.topics.length > 0) {
    explanationParts.push(
      ensureSentence(`Key study anchors for this objective are ${chapter.topics.slice(0, 4).join(', ')}`),
    )
  }

  return explanationParts.filter(Boolean).join(' ')
}

function objectiveFocusPhrase(objectiveText) {
  return objectiveText
    .replace(/^(recognize|identify|differentiate|discuss|describe|demonstrate|apply|explain|recall)\s+/i, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function primaryTopicLabel(chapter) {
  return (
    chapter.topics.find((topic) => !/^(overview|chapter synopsis|workbook learning activities)$/i.test(topic)) ||
    chapter.title
  )
}

function objectiveScenarioKind(objectiveText) {
  const lower = objectiveText.toLowerCase()
  if (lower.includes('crime elements') || lower.includes('required to arrest') || lower.includes('probable cause')) return 'arrest'
  if (lower.includes('classif') || lower.includes('misdemeanor') || lower.includes('felony')) return 'classification'
  if (lower.includes('court order') || lower.includes('restraining order') || lower.includes('protective order')) return 'court_order'
  if (lower.includes('document') || lower.includes('report')) return 'documentation'
  if (lower.includes('evidence') || lower.includes('collect')) return 'evidence'
  if (lower.includes('force')) return 'force'
  if (lower.includes('deescalation')) return 'deescalation'
  if (lower.includes('search') || lower.includes('seizure') || lower.includes('warrant')) return 'search'
  if (lower.includes('detention') || lower.includes('consensual encounter') || lower.includes('arrest')) return 'contact'
  return 'general'
}

function buildObjectiveScenario(chapter, objective) {
  const primaryTopic = humanizeTopicLabel(primaryTopicLabel(chapter))
  const focusPhrase = objectiveFocusPhrase(objective.text)
  const setup = `An officer is handling a call or field contact involving ${lowerCaseFirst(primaryTopic)} during ${chapter.title.toLowerCase()}. The facts are incomplete, emotions are high, and the officer has to sort out the legally important point before acting.`
  const kind = objectiveScenarioKind(objective.text)

  switch (kind) {
    case 'arrest':
      return {
        setup,
        prompt: 'Which fact or combination of facts would give the officer the strongest probable-cause basis under this objective?',
        answerFocus: 'Focus on the required elements, the relationship or status facts that matter, and the observations or statements that directly support enforcement action.',
      }
    case 'classification':
      return {
        setup,
        prompt: 'Which fact changes the offense level or tells the officer how the crime should be classified on a TMAS-style question?',
        answerFocus: 'Focus on the facts that move the offense between misdemeanor and felony treatment, or otherwise control the correct legal classification.',
      }
    case 'court_order':
      return {
        setup,
        prompt: 'What must the officer verify or enforce first before taking the next step?',
        answerFocus: 'Focus on order type, validity, scope, service, protected party status, and the exact enforcement authority the officer has on scene.',
      }
    case 'documentation':
      return {
        setup,
        prompt: 'What detail would POST most likely expect the officer to document or preserve in the report?',
        answerFocus: 'Focus on the fact pattern, victim or witness statements, injuries or observations, evidence collected, and the follow-up actions that must be reflected in the report.',
      }
    case 'evidence':
      return {
        setup,
        prompt: 'Which item, statement, injury, or scene observation is the strongest piece of evidence to identify or collect under this objective?',
        answerFocus: 'Focus on evidence that proves the element being tested and that can be clearly tied back to the suspect, victim, scene, or officer observations.',
      }
    case 'force':
      return {
        setup,
        prompt: 'What fact pattern would POST most likely ask the officer to evaluate before deciding whether force is objectively reasonable?',
        answerFocus: 'Focus on the threat level, resistance, immediacy, alternatives, and the officer’s legal authority to respond under the totality of the circumstances.',
      }
    case 'deescalation':
      return {
        setup,
        prompt: 'What officer tactic, communication choice, or scene-management step best reflects the tested deescalation principle?',
        answerFocus: 'Focus on slowing the event down when feasible, using time-distance-cover, communication, and decision-making tactics that reduce intensity without giving up safety.',
      }
    case 'search':
      return {
        setup,
        prompt: 'What fact would control whether the officer’s search or seizure decision is lawful?',
        answerFocus: 'Focus on the legal threshold being tested, the justification for the intrusion, and the limit on what the officer may search, seize, or inspect.',
      }
    case 'contact':
      return {
        setup,
        prompt: 'At what point would this contact legally change, and what fact would justify that change?',
        answerFocus: 'Focus on the difference between the current level of contact and the next level, and the specific facts needed to lawfully escalate or maintain the contact.',
      }
    default:
      return {
        setup,
        prompt: 'What fact, legal rule, or officer action would POST most likely test from this objective?',
        answerFocus: `Focus on ${lowerCaseFirst(focusPhrase || 'the controlling rule in the objective')} and on the fact that changes the officer’s authority, decision, or reporting responsibility.`,
      }
  }
}

function parseChapterRanges(lines) {
  const starts = []

  for (let index = 0; index < lines.length; index += 1) {
    const match = lines[index].match(/^Chapter\s+(\d+)$/i)
    if (!match) continue
    starts.push({ index, chapter: Number(match[1]) })
  }

  return starts.map((start, index) => ({
    chapter: start.chapter,
    start: start.index,
    end: starts[index + 1]?.index ?? lines.length,
  }))
}

function extractChapterTitle(lines, chapterStartIndex) {
  const titleLines = []

  for (let index = chapterStartIndex + 1; index < lines.length; index += 1) {
    const line = lines[index]
    if (!line) {
      if (titleLines.length > 0) break
      continue
    }

    if (/^(OVERVIEW|Learning Need)$/i.test(line)) break
    titleLines.push(line)
    if (titleLines.length >= 2) break
  }

  return joinWrappedLines(titleLines)
}

function prepareTrainingSpecText(raw) {
  let text = raw.replace(/\u0007+/g, '\n').replace(/\r/g, '').replace(/\t+/g, ' ')

  for (let iteration = 0; iteration < 5; iteration += 1) {
    text = text.replace(/\b([IVXLC])\s+(?=[IVXLC]+\.)/g, '$1')
  }

  return text
    .replace(/\n[ \t]+/g, '\n')
    .replace(/[ ]{2,}/g, ' ')
    .replace(/([IVXLC]+\.)\s*(LEARNING NEED|REQUIRED TESTS|REQUIRED LEARNING ACTIVITIES|HOURLY REQUIREMENTS|ORIGINATION DATE|REVISION DATE)/g, '\n$1 $2')
    .replace(/LEARNING OBJECTIVE(S)?/g, '\nLEARNING OBJECTIVES\n')
    .replace(/\n{2,}/g, '\n\n')
}

function cleanObjectiveNoise(text) {
  return text
    .replace(/(^|\n)X+(?=\n|$)/g, '$1')
    .replace(/X+(?=[A-Z]\.)/g, '')
    .replace(/\n{2,}/g, '\n\n')
    .trim()
}

function parseTtsObjectives(text) {
  const cleaned = cleanObjectiveNoise(text)
  if (!cleaned) return []

  const matches = [...cleaned.matchAll(/(?:^|\n)([A-Z])\.\s+([\s\S]*?)(?=(?:\n[A-Z]\.\s+)|$)/g)]
  const objectives = []

  if (matches.length > 0) {
    const leading = cleaned.slice(0, matches[0].index).trim()
    if (leading) {
      objectives.push({
        label: 'A',
        text: leading.replace(/\s+/g, ' ').trim(),
      })
    }
  } else {
    return [
      {
        label: 'A',
        text: cleaned.replace(/\s+/g, ' ').trim(),
      },
    ]
  }

  for (const match of matches) {
    objectives.push({
      label: match[1],
      text: match[2].replace(/\s+/g, ' ').trim(),
    })
  }

  return objectives.filter((objective, index, array) => {
    if (!objective.text) return false
    return array.findIndex((candidate) => candidate.label === objective.label && candidate.text === objective.text) === index
  })
}

function parseTrainingSpecSections(text) {
  const sections = []
  const pattern = /(?:^|\n)(?:(?<roman>[IVXLC]+)\.\s*)?LEARNING NEED([\s\S]*?)(?=(?:\n(?:(?:[IVXLC]+\.\s*)?LEARNING NEED|[IVXLC]+\. REQUIRED TESTS|[IVXLC]+\. REQUIRED LEARNING ACTIVITIES|[IVXLC]+\. HOURLY REQUIREMENTS|[IVXLC]+\. ORIGINATION DATE|[IVXLC]+\. REVISION DATE))|$)/g

  let sectionIndex = 1
  for (const match of text.matchAll(pattern)) {
    const roman = match.groups?.roman || toRoman(sectionIndex)
    const body = match[2].trim()
    const [learningNeedPart, objectivesPart = ''] = body.split('LEARNING OBJECTIVES')
    const learningNeed = learningNeedPart.replace(/\s+/g, ' ').trim()

    sections.push({
      roman,
      learningNeed,
      objectives: parseTtsObjectives(objectivesPart),
    })
    sectionIndex += 1
  }

  return sections
}

function parseRequiredTests(text) {
  const match = text.match(/[IVXLC]+\. REQUIRED TESTS([\s\S]*?)(?=(?:[IVXLC]+\. REQUIRED LEARNING ACTIVITIES|[IVXLC]+\. HOURLY REQUIREMENTS|$))/)
  if (!match) return []

  const cleaned = cleanObjectiveNoise(match[1]).replace(/\n/g, ' ')
  const tests = [...cleaned.matchAll(/The POST-Constructed[^.]+\./g)].map((result) =>
    result[0].replace(/\s+/g, ' ').trim(),
  )

  return Array.from(new Set(tests))
}

function ensureTrainingSpecText(entry) {
  const trainingUrl = entry.trainingSpecUrl
  if (!trainingUrl) return ''

  const urlPath = new URL(trainingUrl).pathname
  const extension = path.extname(urlPath) || '.doc'
  const fileStem = `LD_${String(entry.ldNumber).padStart(2, '0')}`
  const docPath = path.join(trainingSpecDir, `${fileStem}${extension}`)
  const txtPath = path.join(trainingSpecDir, `${fileStem}.txt`)

  runCommand('curl', ['-L', trainingUrl, '-o', docPath])
  runCommand('textutil', ['-convert', 'txt', docPath, '-output', txtPath])

  return fs.readFileSync(txtPath, 'utf8')
}

const enrichedResearch = Object.fromEntries(
  Object.entries(existingResearch).map(([ldNumber, entry]) => {
    const workbookPath = path.join(workbookTextDir, `LD_${String(ldNumber).padStart(2, '0')}.txt`)
    if (!fs.existsSync(workbookPath)) {
      return [ldNumber, entry]
    }

    const workbookLines = normalizeWorkbookText(fs.readFileSync(workbookPath, 'utf8'))
    const chapterRanges = parseChapterRanges(workbookLines)

    const workbookChapters = chapterRanges.map((range, chapterIndex) => {
      const chapterLines = workbookLines.slice(range.start, range.end)
      const fallback = entry.chapterBreakdown?.[chapterIndex]
      const learningNeedBlock = extractBlock(chapterLines, 'Learning Need', ['Learning Objectives', 'In This Chapter'])
      const objectiveBlock = extractBlock(chapterLines, 'Learning Objectives', ['In This Chapter'])
      const synopsisBlock = extractBlock(chapterLines, 'CHAPTER SYNOPSIS', ['WORKBOOK LEARNING ACTIVITIES'])
      const title = extractChapterTitle(chapterLines, 0) || fallback?.title || `Chapter ${range.chapter}`
      const topics = fallback?.topics ?? []

      return {
        chapter: range.chapter,
        title,
        topics,
        workbookLearningNeed: paragraphize(learningNeedBlock.lines).join(' '),
        workbookObjectives: parseWorkbookObjectives(objectiveBlock.lines),
        topicBriefs: parseTopicBriefs(chapterLines, topics),
        synopsisSections: parseSynopsisSections(synopsisBlock.lines),
      }
    })

    const trainingSpecText = ensureTrainingSpecText(entry)
    const preparedTrainingSpec = prepareTrainingSpecText(trainingSpecText)
    const ttsSections = parseTrainingSpecSections(preparedTrainingSpec)
    const requiredTests = parseRequiredTests(preparedTrainingSpec)

    const chapters = workbookChapters.map((chapter, index) => ({
      ...chapter,
      ttsSection: ttsSections[index]
        ? {
            ...ttsSections[index],
            objectives: ttsSections[index].objectives.map((objective) => ({
              ...objective,
              explanation: buildObjectiveExplanation(chapter, objective),
              exampleScenario: buildObjectiveScenario(chapter, objective),
            })),
          }
        : null,
    }))

    const studyChecklist = chapters.flatMap((chapter) => {
      const items = []
      if (chapter.ttsSection?.learningNeed) {
        items.push(`Know the TTS learning need for Chapter ${chapter.chapter}.`)
      }
      items.push(`Review Chapter ${chapter.chapter}: ${chapter.title}.`)
      if (chapter.ttsSection?.objectives?.[0]) {
        items.push(`Be ready to answer TTS objective ${chapter.ttsSection.objectives[0].label} for Chapter ${chapter.chapter}.`)
      }
      return items
    })

    const flashcards = chapters.flatMap((chapter) => {
      const cards = []

      if (chapter.ttsSection?.learningNeed) {
        cards.push({
          front: `What TTS learning need drives LD ${ldNumber}, Chapter ${chapter.chapter}?`,
          back: chapter.ttsSection.learningNeed,
        })
      }

      for (const objective of chapter.ttsSection?.objectives?.slice(0, 3) ?? []) {
        cards.push({
          front: `What can the test hit in LD ${ldNumber}, Chapter ${chapter.chapter}, objective ${objective.label}?`,
          back: objective.text,
        })
      }

      for (const brief of chapter.topicBriefs.slice(0, 2)) {
        cards.push({
          front: `How does the workbook explain ${brief.title} in LD ${ldNumber}, Chapter ${chapter.chapter}?`,
          back: brief.excerpt,
        })
      }

      return cards
    })

    const dedupedFlashcards = []
    const seenFlashcards = new Set()
    for (const card of flashcards) {
      const key = `${card.front}::${card.back}`
      if (seenFlashcards.has(key)) continue
      seenFlashcards.add(key)
      dedupedFlashcards.push(card)
    }

    return [
      ldNumber,
      {
        ...entry,
        chapters,
        studyChecklist: Array.from(new Set(studyChecklist)),
        requiredTests,
        flashcards: dedupedFlashcards,
      },
    ]
  }),
)

fs.writeFileSync(outputPath, `${JSON.stringify(enrichedResearch, null, 2)}\n`)
console.log(`Updated ${outputPath}`)
