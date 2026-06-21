import assert from 'node:assert/strict'
import test from 'node:test'
import {
  getDuelBlasterMotionSpeedBounds,
  normalizeDuelBlasterVelocity,
} from './blasterMotion.ts'

test('normalizes duel blaster asteroid velocity to visible frame-independent motion', () => {
  const velocity = normalizeDuelBlasterVelocity(0.004, 0.003, false)
  const speedPerSecond = Math.hypot(velocity.x, velocity.y) * 1000
  const bounds = getDuelBlasterMotionSpeedBounds(false)

  assert.equal(speedPerSecond >= bounds.minPixelsPerSecond, true)
  assert.equal(speedPerSecond <= bounds.maxPixelsPerSecond, true)
})

test('keeps reduced-motion duel blaster asteroids moving, but slower', () => {
  const velocity = normalizeDuelBlasterVelocity(0, 0, true)
  const speedPerSecond = Math.hypot(velocity.x, velocity.y) * 1000
  const bounds = getDuelBlasterMotionSpeedBounds(true)

  assert.equal(speedPerSecond >= bounds.minPixelsPerSecond, true)
  assert.equal(speedPerSecond <= bounds.maxPixelsPerSecond, true)
  assert.equal(bounds.maxPixelsPerSecond < getDuelBlasterMotionSpeedBounds(false).minPixelsPerSecond, true)
})
