type MotionSpeedBounds = {
  minPixelsPerSecond: number
  maxPixelsPerSecond: number
}

const standardDuelBlasterMotion: MotionSpeedBounds = {
  minPixelsPerSecond: 72,
  maxPixelsPerSecond: 138,
}

const reducedDuelBlasterMotion: MotionSpeedBounds = {
  minPixelsPerSecond: 28,
  maxPixelsPerSecond: 56,
}

export function getDuelBlasterMotionSpeedBounds(reducedMotion: boolean): MotionSpeedBounds {
  return reducedMotion ? reducedDuelBlasterMotion : standardDuelBlasterMotion
}

export function normalizeDuelBlasterVelocity(velocityX: number, velocityY: number, reducedMotion: boolean) {
  const bounds = getDuelBlasterMotionSpeedBounds(reducedMotion)
  const minSpeed = bounds.minPixelsPerSecond / 1000
  const maxSpeed = bounds.maxPixelsPerSecond / 1000
  const speed = Math.hypot(velocityX, velocityY)

  if (!Number.isFinite(speed) || speed <= 0) {
    const fallbackY = minSpeed * 0.65
    const fallbackSpeed = Math.hypot(minSpeed, fallbackY)
    const multiplier = minSpeed / fallbackSpeed
    return {
      x: minSpeed * multiplier,
      y: fallbackY * multiplier,
    }
  }

  if (speed < minSpeed) {
    const multiplier = minSpeed / speed
    return {
      x: velocityX * multiplier,
      y: velocityY * multiplier,
    }
  }

  if (speed > maxSpeed) {
    const multiplier = maxSpeed / speed
    return {
      x: velocityX * multiplier,
      y: velocityY * multiplier,
    }
  }

  return {
    x: velocityX,
    y: velocityY,
  }
}
