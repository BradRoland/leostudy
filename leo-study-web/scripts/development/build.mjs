// Build a publishable development artifact without including private configuration.
import { execFileSync } from 'node:child_process'
import { readFile, mkdir, writeFile, readdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { parse } from 'dotenv'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const branch = execFileSync('git', ['branch', '--show-current'], { cwd: root, encoding: 'utf8' }).trim()
if (branch !== 'codex/class180-ui-overhaul-test') throw new Error('This artifact is restricted to the isolated UI test branch.')
const commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim()
const dirty = Boolean(execFileSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' }).trim())
const staging = parse(await readFile(path.join(root, '.env.staging.local')))
if (staging.VITE_SUPABASE_URL !== 'http://127.0.0.1:55431') throw new Error('Expected the isolated staging configuration.')
const anon = staging.VITE_SUPABASE_ANON_KEY
const claims = JSON.parse(Buffer.from(anon.split('.')[1], 'base64url').toString())
if (claims.role !== 'anon' || claims.exp * 1000 < Date.now() + 86400000) throw new Error('A valid test anonymous key is required.')
const env = { ...process.env, ...staging,
  COMMIT_SHA: `${commit}${dirty ? `-dev-${Date.now()}` : ''}`,
  VITE_SUPABASE_URL: 'https://dev.180.academy/supabase',
  VITE_AUTH_REDIRECT_BASE_URL: 'https://dev.180.academy',
  VITE_INVITE_BASE_URL: 'https://dev.180.academy/invite',
  VITE_DISABLE_LIVE_INTEGRATIONS: 'true',
  VITE_ROPE_BLASTER_WORKER_URL: '/',
  VITE_ENABLE_VERCEL_TELEMETRY: 'false',
  VITE_STRIPE_LINK_TIER2: '', VITE_STRIPE_LINK_TIER5: '', VITE_STRIPE_LINK_TIER10: '',
}
execFileSync('npm', ['run', 'build:staging'], { cwd: root, env, stdio: 'inherit' })
const output = path.join(root, '.dev-deployment.local')
await mkdir(output, { recursive: true, mode: 0o700 })
const backend = (await readdir(path.join(root, 'backend')))
  .filter(name => name.endsWith('.mjs') && !name.endsWith('.test.mjs') && !name.startsWith('staging-'))
  .map(name => `backend/${name}`)
const artifact = path.join(output, '180-academy-runtime.tar.gz')
execFileSync('tar', ['-czf', artifact, 'dist', 'package.json', 'package-lock.json', ...backend], { cwd: root, env: { ...process.env, COPYFILE_DISABLE: '1' } })
await writeFile(path.join(output, 'manifest.json'), JSON.stringify({ branch, commit, dirty, builtAt: new Date().toISOString(), publicUrl: env.VITE_SUPABASE_URL, liveIntegrationsDisabled: true, artifact }, null, 2), { mode: 0o600 })
console.log('Development artifact ready:', artifact)
