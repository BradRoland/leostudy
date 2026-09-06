/** Build-time safeguards for an isolated preview. Supabase and its mail sink remain available. */
export function getLiveIntegrations(env: Record<string, unknown>) {
  const disabled = String(env.VITE_DISABLE_LIVE_INTEGRATIONS || '').trim().toLowerCase() === 'true'
  return {
    disabled,
    telemetryEnabled: !disabled && String(env.VITE_ENABLE_VERCEL_TELEMETRY || env.VITE_ENABLE_VERCEL_ANALYTICS || '').toLowerCase() === 'true',
    stripeLinks: {
      tier2: disabled ? '' : String(env.VITE_STRIPE_LINK_TIER2 || '').trim(),
      tier5: disabled ? '' : String(env.VITE_STRIPE_LINK_TIER5 || '').trim(),
      tier10: disabled ? '' : String(env.VITE_STRIPE_LINK_TIER10 || '').trim(),
    },
    ropeBlasterWorkerUrl: disabled ? '' : String(
      env.VITE_ROPE_BLASTER_WORKER_URL || env.VITE_CLOUDFLARE_ROPE_BLASTER_URL || 'https://leo-rope-blaster.brad-e22.workers.dev',
    ).replace(/\/+$/, ''),
  }
}
