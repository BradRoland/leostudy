import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const manifestPath = resolve(rootDir, 'public/app-version.json')
const packageJson = JSON.parse(await readFile(resolve(rootDir, 'package.json'), 'utf8'))
const commit =
  process.env.VERCEL_GIT_COMMIT_SHA ||
  process.env.CF_PAGES_COMMIT_SHA ||
  process.env.GITHUB_SHA ||
  process.env.COMMIT_SHA ||
  ''
const builtAt = new Date().toISOString()
const buildId = commit || `${packageJson.version || 'local'}-${builtAt}`

await mkdir(dirname(manifestPath), { recursive: true })
await writeFile(
  manifestPath,
  `${JSON.stringify(
    {
      buildId,
      commit: commit || null,
      version: packageJson.version || '0.0.0',
      builtAt,
    },
    null,
    2,
  )}\n`,
)

console.log(`Wrote app version manifest: ${buildId}`)
