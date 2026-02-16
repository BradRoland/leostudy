import 'dotenv/config'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const projectRoot = path.resolve(__dirname, '..')

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || ''
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

if (!supabaseUrl || !serviceRoleKey) {
  console.error('Missing env vars. Required: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
})

const parseJson = (filePath) => JSON.parse(fs.readFileSync(filePath, 'utf8'))

function toCodeRows(items) {
  return items.map((item) => ({
    id: String(item.id || '').trim(),
    category: String(item.category || '').trim().toLowerCase(),
    type: 'code',
    title: String(item.title || '').trim(),
    question: String(item.question || '').trim(),
    answer: String(item.answer || '').trim() || null,
    tags: Array.isArray(item.tags) ? item.tags.map((entry) => String(entry).trim()).filter(Boolean) : [],
    difficulty: String(item.difficulty || '').trim() || null,
    code_section: String(item.codeSection || '').trim() || null,
    explanation: String(item.explanation || '').trim() || null,
    source_url: String(item.sourceUrl || '').trim() || null,
    scenario: null,
    scenario_questions: [],
    key_points: [],
    is_published: true,
  }))
}

function toScenarioRows(items) {
  return items.map((item) => ({
    id: String(item.id || '').trim(),
    category: String(item.category || 'scenario').trim().toLowerCase(),
    type: 'scenario',
    title: String(item.title || '').trim() || 'Scenario',
    question: null,
    answer: String(item.expectedAnswer || '').trim() || null,
    tags: Array.isArray(item.tags) ? item.tags.map((entry) => String(entry).trim()).filter(Boolean) : [],
    difficulty: String(item.difficulty || '').trim() || null,
    code_section: String(item.codeSection || '').trim() || null,
    explanation: String(item.explanation || '').trim() || null,
    source_url: String(item.sourceUrl || '').trim() || null,
    scenario: String(item.scenario || '').trim(),
    scenario_questions: Array.isArray(item.questions) ? item.questions.map((entry) => String(entry).trim()).filter(Boolean).slice(0, 4) : [],
    key_points: Array.isArray(item.keyPoints) ? item.keyPoints.map((entry) => String(entry).trim()).filter(Boolean) : [],
    is_published: true,
  }))
}

function dedupeRows(rows) {
  const map = new Map()
  for (const row of rows) {
    const type = String(row.type || '').toLowerCase()
    const category = String(row.category || '').toLowerCase()
    const codeSection = String(row.code_section || '').trim().toLowerCase()
    const scenario = String(row.scenario || '').trim().toLowerCase()
    const key =
      type === 'scenario'
        ? `scenario|${category}|${scenario || String(row.id || '').toLowerCase()}`
        : `code|${category}|${codeSection || String(row.id || '').toLowerCase()}`
    if (!map.has(key)) map.set(key, row)
  }
  return [...map.values()]
}

async function main() {
  const contentDir = path.join(projectRoot, 'src', 'content')
  const pc = parseJson(path.join(contentDir, 'pc.json'))
  const hs = parseJson(path.join(contentDir, 'hs.json'))
  const vc = parseJson(path.join(contentDir, 'vc.json'))
  const custom = parseJson(path.join(contentDir, 'custom.json'))
  const scenarios = parseJson(path.join(contentDir, 'scenarios.json'))

  const codeRows = toCodeRows([...pc, ...hs, ...vc, ...custom]).filter(
    (item) => item.id && item.category && item.title && item.question,
  )
  const scenarioRows = toScenarioRows(scenarios).filter(
    (item) => item.id && item.category && item.title && item.scenario && Array.isArray(item.scenario_questions) && item.scenario_questions.length >= 2,
  )

  const payload = dedupeRows([...codeRows, ...scenarioRows])
  if (payload.length === 0) {
    console.error('No valid content rows found in src/content/*.json')
    process.exit(1)
  }

  const { error } = await supabase.from('content_items').upsert(payload, { onConflict: 'id' })
  if (error) {
    console.error(`Sync failed: ${error.message}`)
    process.exit(1)
  }

  console.log(`Synced ${payload.length} content rows to content_items.`)
  console.log(`- Code rows: ${codeRows.length}`)
  console.log(`- Scenario rows: ${scenarioRows.length}`)
}

main().catch((error) => {
  console.error(error?.message || String(error))
  process.exit(1)
})
