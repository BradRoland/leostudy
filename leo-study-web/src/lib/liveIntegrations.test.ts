import assert from 'node:assert/strict'
import test from 'node:test'
import { getLiveIntegrations } from './liveIntegrations.ts'

test('preview safety overrides configured live checkout, Worker and telemetry settings', () => {
  const config = getLiveIntegrations({
    VITE_DISABLE_LIVE_INTEGRATIONS: 'true',
    VITE_STRIPE_LINK_TIER2: 'https://buy.stripe.com/live',
    VITE_STRIPE_LINK_TIER5: 'https://buy.stripe.com/live5',
    VITE_STRIPE_LINK_TIER10: 'https://buy.stripe.com/live10',
    VITE_ROPE_BLASTER_WORKER_URL: 'https://live-worker.example',
    VITE_ENABLE_VERCEL_TELEMETRY: 'true',
    VITE_ENABLE_VERCEL_ANALYTICS: 'true',
  })
  assert.equal(config.disabled, true)
  assert.deepEqual(config.stripeLinks, { tier2: '', tier5: '', tier10: '' })
  assert.equal(config.ropeBlasterWorkerUrl, '')
  assert.equal(config.telemetryEnabled, false)
})

test('normal builds retain existing live integration defaults', () => {
  const config = getLiveIntegrations({})
  assert.equal(config.disabled, false)
  assert.equal(config.ropeBlasterWorkerUrl, 'https://leo-rope-blaster.brad-e22.workers.dev')
  assert.equal(config.telemetryEnabled, false)
})

test('normal builds retain explicit checkout and Worker overrides and legacy telemetry alias', () => {
  const config = getLiveIntegrations({
    VITE_DISABLE_LIVE_INTEGRATIONS: 'false',
    VITE_CLOUDFLARE_ROPE_BLASTER_URL: 'https://custom-worker.example/',
    VITE_STRIPE_LINK_TIER5: ' https://buy.stripe.com/custom ',
    VITE_ENABLE_VERCEL_ANALYTICS: 'true',
  })
  assert.equal(config.stripeLinks.tier5, 'https://buy.stripe.com/custom')
  assert.equal(config.ropeBlasterWorkerUrl, 'https://custom-worker.example')
  assert.equal(config.telemetryEnabled, true)
})
