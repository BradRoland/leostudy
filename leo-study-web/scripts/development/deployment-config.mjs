// This contract is used only by the separate GitHub development deployment.
// The normal production Dockerfile and backend entry point remain unchanged.
export const developmentOrigin = 'https://dev.180.academy'
export const developmentPublicApi = `${developmentOrigin}/supabase`

function requireValue(env, key, expected) {
  if (env[key] !== expected) {
    const requirement = /KEY|TOKEN|PASSWORD/.test(key) ? `${key} to match the isolated deployment` : `${key}=${expected}`
    throw new Error(`Development deployment requires ${requirement}.`)
  }
}

function validateJwt(value, role, now) {
  try {
    const parts = String(value || '').split('.')
    if (parts.length !== 3 || !parts.every(part => /^[A-Za-z0-9_-]+$/.test(part))) throw new Error()
    const header = JSON.parse(Buffer.from(parts[0], 'base64url'))
    const claims = JSON.parse(Buffer.from(parts[1], 'base64url'))
    if (header.alg !== 'HS256' || claims.role !== role || !Number.isFinite(claims.exp) || claims.exp <= now / 1000) throw new Error()
  } catch {
    // Never include a credential or decoded claims in deployment logs.
    throw new Error(`Development deployment requires an unexpired ${role} JWT.`)
  }
}

export function developmentBuildEnvironment(input, now = Date.now()) {
  if (!/^[a-f0-9]{40}$/i.test(input.SOURCE_COMMIT || '')) throw new Error('Development build requires a full SOURCE_COMMIT SHA.')
  validateJwt(input.VITE_SUPABASE_ANON_KEY, 'anon', now + 86400000)
  // Allow only build necessities. In particular, do not forward runtime secrets,
  // injected VITE_* values, or provider commit variables that override COMMIT_SHA.
  return {
    ...Object.fromEntries(['PATH', 'HOME', 'LANG', 'LC_ALL', 'TMPDIR'].filter(key => input[key]).map(key => [key, input[key]])),
    CI: 'true',
    COMMIT_SHA: input.SOURCE_COMMIT.toLowerCase(),
    VITE_SUPABASE_URL: developmentPublicApi,
    VITE_SUPABASE_ANON_KEY: input.VITE_SUPABASE_ANON_KEY,
    VITE_AUTH_REDIRECT_BASE_URL: developmentOrigin,
    VITE_INVITE_BASE_URL: `${developmentOrigin}/invite`,
    VITE_DISABLE_LIVE_INTEGRATIONS: 'true',
    VITE_ROPE_BLASTER_WORKER_URL: '/',
    VITE_ENABLE_VERCEL_TELEMETRY: 'false',
    VITE_ENABLE_VERCEL_ANALYTICS: 'false',
    VITE_STRIPE_LINK_TIER2: '', VITE_STRIPE_LINK_TIER5: '', VITE_STRIPE_LINK_TIER10: '',
  }
}

export function validateDevelopmentRuntime(env, now = Date.now()) {
  const required = {
    NODE_ENV: 'production', HOST: '0.0.0.0', PORT: '8789',
    SUPABASE_URL: 'http://gateway',
    DISABLE_LIVE_INTEGRATIONS: 'true',
    CLASS_REQUEST_APP_URL: developmentOrigin,
    CLASS_REQUEST_EMAIL_ENABLED: 'true',
    CLASS_REQUEST_SMTP_HOST: 'mail', CLASS_REQUEST_SMTP_PORT: '1025',
    CLASS_REQUEST_SMTP_SECURE: 'false', CLASS_REQUEST_SMTP_REQUIRE_TLS: 'false',
  }
  for (const [key, value] of Object.entries(required)) requireValue(env, key, value)
  for (const key of ['CLASS_REQUEST_EMAIL_FROM', 'CLASS_REQUEST_OWNER_EMAIL']) {
    if (!env[key]?.trim() || /[\r\n]/.test(env[key])) throw new Error(`Development deployment requires ${key}.`)
  }
  validateJwt(env.SUPABASE_ANON_KEY, 'anon', now)
  validateJwt(env.SUPABASE_SERVICE_ROLE_KEY, 'service_role', now)
  // JWT signatures are verified by the isolated gateway during normal backend
  // startup/API calls; these checks reject swapped roles and stale config early.
  for (const [key, value] of Object.entries(env)) {
    if (!value) continue
    if (/^(STRIPE_|VITE_STRIPE_|DISCORD_|RESEND_|COOLIFY_WEBHOOK_|DOTENV_)/.test(key)
      || ['CLASS_REQUEST_SMTP_USER', 'CLASS_REQUEST_SMTP_PASSWORD', 'SMTP_USER', 'SMTP_PASS', 'SMTP_PASSWORD'].includes(key)) {
      throw new Error(`Development deployment forbids ${key}.`)
    }
  }
  const optional = {
    SMTP_HOST: 'mail', SMTP_PORT: '1025', SMTP_SECURE: 'false',
    VITE_SUPABASE_URL: developmentPublicApi,
    VITE_AUTH_REDIRECT_BASE_URL: developmentOrigin,
    VITE_INVITE_BASE_URL: `${developmentOrigin}/invite`,
    VITE_DISABLE_LIVE_INTEGRATIONS: 'true', VITE_ROPE_BLASTER_WORKER_URL: '/',
    VITE_ENABLE_VERCEL_TELEMETRY: 'false', VITE_ENABLE_VERCEL_ANALYTICS: 'false',
    VITE_SUPABASE_ANON_KEY: env.SUPABASE_ANON_KEY,
  }
  for (const [key, value] of Object.entries(optional)) if (env[key]) requireValue(env, key, value)
  return true
}
