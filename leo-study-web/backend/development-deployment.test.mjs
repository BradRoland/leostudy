import assert from 'node:assert/strict'
import test from 'node:test'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { developmentBuildEnvironment, validateDevelopmentRuntime } from '../scripts/development/deployment-config.mjs'

const now = 1800000000000
const token = (role, exp = now / 1000 + 7 * 86400, alg = 'HS256') => [
  Buffer.from(JSON.stringify({ alg, typ: 'JWT' })).toString('base64url'),
  Buffer.from(JSON.stringify({ role, exp })).toString('base64url'),
  'synthetic-test-signature',
].join('.')
const runtime = () => ({
  NODE_ENV: 'production', HOST: '0.0.0.0', PORT: '8789',
  SUPABASE_URL: 'http://gateway', DISABLE_LIVE_INTEGRATIONS: 'true',
  SUPABASE_ANON_KEY: token('anon'), SUPABASE_SERVICE_ROLE_KEY: token('service_role'),
  CLASS_REQUEST_APP_URL: 'https://dev.180.academy',
  CLASS_REQUEST_EMAIL_ENABLED: 'true', CLASS_REQUEST_EMAIL_FROM: '180 Academy <preview@example.invalid>',
  CLASS_REQUEST_OWNER_EMAIL: 'review@example.invalid', CLASS_REQUEST_SMTP_HOST: 'mail', CLASS_REQUEST_SMTP_PORT: '1025',
  CLASS_REQUEST_SMTP_SECURE: 'false', CLASS_REQUEST_SMTP_REQUIRE_TLS: 'false',
})

test('development build fixes preview URLs and excludes injected live settings, runtime secrets and provider SHA overrides', () => {
  const env = developmentBuildEnvironment({
    PATH: '/bin', SOURCE_COMMIT: 'a'.repeat(40), VITE_SUPABASE_ANON_KEY: token('anon'),
    SUPABASE_SERVICE_ROLE_KEY: 'private-runtime-value', GITHUB_SHA: 'b'.repeat(40), NODE_OPTIONS: '--require unsafe-file',
    VITE_SUPABASE_URL: 'https://production.invalid', VITE_DISABLE_LIVE_INTEGRATIONS: 'false',
    VITE_STRIPE_LINK_TIER2: 'https://buy.stripe.com/live', VITE_ENABLE_VERCEL_TELEMETRY: 'true', VITE_CUSTOM_SECRET: 'private',
  }, now)
  assert.equal(env.VITE_SUPABASE_URL, 'https://dev.180.academy/supabase')
  assert.equal(env.VITE_AUTH_REDIRECT_BASE_URL, 'https://dev.180.academy')
  assert.equal(env.VITE_INVITE_BASE_URL, 'https://dev.180.academy/invite')
  assert.equal(env.VITE_DISABLE_LIVE_INTEGRATIONS, 'true')
  assert.equal(env.VITE_ROPE_BLASTER_WORKER_URL, '/')
  assert.equal(env.VITE_STRIPE_LINK_TIER2, '')
  assert.equal(env.VITE_ENABLE_VERCEL_TELEMETRY, 'false')
  assert.equal(env.COMMIT_SHA, 'a'.repeat(40))
  for (const key of ['SUPABASE_SERVICE_ROLE_KEY', 'GITHUB_SHA', 'NODE_OPTIONS', 'VITE_CUSTOM_SECRET']) assert.equal(key in env, false)
})

test('development build refuses untraceable source and invalid or soon-expiring public keys', () => {
  const env = { SOURCE_COMMIT: 'a'.repeat(40), VITE_SUPABASE_ANON_KEY: token('anon') }
  for (const SOURCE_COMMIT of ['', 'main', 'dev', 'abc1234', 'x'.repeat(40)]) {
    assert.throws(() => developmentBuildEnvironment({ ...env, SOURCE_COMMIT }, now), /SOURCE_COMMIT/)
  }
  for (const key of ['', 'malformed', token('service_role'), token('anon', now / 1000 + 60), token('anon', undefined, 'none')]) {
    assert.throws(() => developmentBuildEnvironment({ ...env, VITE_SUPABASE_ANON_KEY: key }, now), /anon JWT/)
  }
})

test('development runtime accepts the exact isolated API and sink configuration', () => {
  assert.equal(validateDevelopmentRuntime(runtime(), now), true)
  assert.equal(validateDevelopmentRuntime({ ...runtime(), SMTP_HOST: 'mail', SMTP_PORT: '1025' }, now), true)
})

test('development runtime rejects wrong API, mail server, live integrations and fallback credentials', () => {
  const cases = {
    SUPABASE_URL: ['https://supabase.180.academy', 'http://gateway.evil', 'http://gateway/', ''],
    DISABLE_LIVE_INTEGRATIONS: ['false', ''], CLASS_REQUEST_APP_URL: ['https://180.academy'],
    CLASS_REQUEST_SMTP_HOST: ['smtp.external.invalid', ''], CLASS_REQUEST_SMTP_PORT: ['587'],
    CLASS_REQUEST_SMTP_SECURE: ['true'], CLASS_REQUEST_SMTP_REQUIRE_TLS: ['true'],
    SMTP_HOST: ['smtp.external.invalid'], SMTP_PORT: ['587'], SMTP_USER: ['secret'], SMTP_PASS: ['secret'],
    CLASS_REQUEST_SMTP_PASSWORD: ['secret'], STRIPE_SECRET_KEY: ['sk_live_private'], RESEND_API_KEY: ['private'],
    DISCORD_CLASS_REQUEST_WEBHOOK_URL: ['https://discord.com/private'], COOLIFY_WEBHOOK_HOST: ['coolify'],
    VITE_SUPABASE_URL: ['https://supabase.180.academy'], VITE_SUPABASE_ANON_KEY: ['another-key'],
    VITE_ENABLE_VERCEL_TELEMETRY: ['true'], VITE_STRIPE_LINK_TIER2: ['https://buy.stripe.com/live'],
    DOTENV_CONFIG_PATH: ['/private/config'], CLASS_REQUEST_OWNER_EMAIL: ['bad\naddress'],
  }
  for (const [key, values] of Object.entries(cases)) for (const value of values) {
    assert.throws(() => validateDevelopmentRuntime({ ...runtime(), [key]: value }, now), undefined, key)
  }
})

test('development runtime refuses swapped or expired credentials without printing them', () => {
  for (const [key, value] of [
    ['SUPABASE_ANON_KEY', token('service_role')], ['SUPABASE_SERVICE_ROLE_KEY', token('anon')],
    ['SUPABASE_SERVICE_ROLE_KEY', token('service_role', now / 1000)], ['SUPABASE_ANON_KEY', 'private-malformed-value'],
  ]) {
    assert.throws(() => validateDevelopmentRuntime({ ...runtime(), [key]: value }, now), error => !error.message.includes(value) && /JWT/.test(error.message))
  }
  const env = runtime()
  assert.throws(() => validateDevelopmentRuntime({ ...env, VITE_SUPABASE_ANON_KEY: 'mismatched-private-value' }, now),
    error => !error.message.includes(env.SUPABASE_ANON_KEY) && !error.message.includes('mismatched-private-value'))
})

test('development entry point fails before importing the backend when isolation settings are missing', () => {
  const result = spawnSync(process.execPath, ['scripts/development/start-github.mjs'], {
    cwd: fileURLToPath(new URL('../', import.meta.url)), env: { NODE_ENV: 'production', HOST: '0.0.0.0', PORT: '8789' }, encoding: 'utf8',
  })
  assert.equal(result.status, 1)
  assert.match(result.stderr, /SUPABASE_URL=http:\/\/gateway/)
  assert.doesNotMatch(result.stderr, /Missing env vars|STRIPE_SECRET_KEY/)
})
