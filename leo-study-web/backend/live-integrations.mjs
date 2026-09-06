export function liveIntegrationsDisabled(env = process.env) {
  return String(env.DISABLE_LIVE_INTEGRATIONS || '').trim().toLowerCase() === 'true'
}

export function isLiveIntegrationPath(url) {
  const pathname = new URL(url || '/', 'http://localhost').pathname.replace(/\/+$/, '')
  return [
    '/api/stripe/webhook', '/stripe/webhook', '/stripe/test/apply',
    '/api/class-requests/notify-discord', '/webhooks/source/github/events/manual',
  ].includes(pathname)
}
