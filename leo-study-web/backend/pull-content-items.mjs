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

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`)
}

async function main() {
  const { data, error } = await supabase
    .from('content_items')
    .select('*')
    .eq('is_published', true)
    .order('updated_at', { ascending: false })

  if (error) {
    console.error(`Pull failed: ${error.message}`)
    process.exit(1)
  }

  const rows = data || []

  const pc = []
  const hs = []
  const vc = []
  const custom = []
  const scenarios = []
  const scenariosTmas2 = []

  for (const row of rows) {
    const item = row || {}
    const id = String(item.id || '').trim()
    const category = String(item.category || '').trim().toLowerCase()
    const type = String(item.type || '').trim().toLowerCase()
    if (!id || !category) continue

    if (type === 'scenario') {
      const scenario = String(item.scenario || '').trim()
      const questions = Array.isArray(item.scenario_questions) ? item.scenario_questions.map((entry) => String(entry).trim()).filter(Boolean) : []
      const subQuestions = Array.isArray(item.scenario_sub_questions)
        ? item.scenario_sub_questions
            .map((entry) => ({
              id: String(entry?.id || '').trim(),
              prompt: String(entry?.prompt || '').trim(),
              choices: Array.isArray(entry?.choices) ? entry.choices.map((choice) => String(choice).trim()).filter(Boolean) : [],
              expectedAnswer: String(entry?.expectedAnswer || '').trim(),
              explanation: String(entry?.explanation || '').trim() || undefined,
            }))
            .filter(
              (entry) =>
                entry.id &&
                entry.prompt &&
                Array.isArray(entry.choices) &&
                entry.choices.length >= 2 &&
                entry.expectedAnswer &&
                entry.choices.includes(entry.expectedAnswer),
            )
        : []
      if (!scenario || (questions.length === 0 && subQuestions.length === 0)) continue
      const scenarioItem = {
        id,
        category,
        title: String(item.title || 'Scenario').trim(),
        scenario,
        questions,
        tmasSet: String(item.tmas_set || '').trim().toLowerCase() === 'tmas2' ? 'tmas2' : 'tmas1',
        subQuestions: subQuestions.length > 0 ? subQuestions : undefined,
        expectedAnswer: String(item.answer || '').trim() || undefined,
        keyPoints: Array.isArray(item.key_points) ? item.key_points.map((entry) => String(entry).trim()).filter(Boolean) : [],
        tags: Array.isArray(item.tags) ? item.tags.map((entry) => String(entry).trim()).filter(Boolean) : [],
        difficulty: String(item.difficulty || '').trim() || undefined,
        codeSection: String(item.code_section || '').trim() || undefined,
        explanation: String(item.explanation || '').trim() || undefined,
        sourceUrl: String(item.source_url || '').trim() || undefined,
      }
      if (scenarioItem.tmasSet === 'tmas2') scenariosTmas2.push(scenarioItem)
      else scenarios.push(scenarioItem)
      continue
    }

    const codeItem = {
      id,
      category,
      title: String(item.title || '').trim(),
      question: String(item.question || '').trim() || `Which section number matches: ${String(item.title || '').trim()}?`,
      answer: String(item.answer || '').trim() || undefined,
      tags: Array.isArray(item.tags) ? item.tags.map((entry) => String(entry).trim()).filter(Boolean) : [],
      difficulty: String(item.difficulty || '').trim() || undefined,
      codeSection: String(item.code_section || '').trim() || undefined,
      explanation: String(item.explanation || '').trim() || undefined,
      sourceUrl: String(item.source_url || '').trim() || undefined,
    }

    if (category === 'pc') pc.push(codeItem)
    else if (category === 'hs') hs.push(codeItem)
    else if (category === 'vc') vc.push(codeItem)
    else custom.push(codeItem)
  }

  const contentDir = path.join(projectRoot, 'src', 'content')
  writeJson(path.join(contentDir, 'pc.json'), pc)
  writeJson(path.join(contentDir, 'hs.json'), hs)
  writeJson(path.join(contentDir, 'vc.json'), vc)
  writeJson(path.join(contentDir, 'custom.json'), custom)
  writeJson(path.join(contentDir, 'scenarios.json'), scenarios)
  writeJson(path.join(contentDir, 'scenarios-tmas2.json'), scenariosTmas2)

  console.log(`Pulled ${rows.length} rows from content_items into src/content/*.json`)
  console.log(
    `- pc: ${pc.length}, hs: ${hs.length}, vc: ${vc.length}, custom: ${custom.length}, scenarios: ${scenarios.length}, scenarios-tmas2: ${scenariosTmas2.length}`,
  )
}

main().catch((err) => {
  console.error(err?.message || String(err))
  process.exit(1)
})
