export type AcademyThemeVars = {
  bg: string
  panel: string
  panelStrong: string
  text: string
  muted: string
  border: string
  accent: string
  good: string
  bad: string
}

function hexChannels(value: string): number[] | null {
  const hex = value.replace(/^#/, '')
  if (!/^[0-9a-f]{6}$/i.test(hex)) return null
  return [0, 2, 4].map((offset) => parseInt(hex.slice(offset, offset + 2), 16))
}

function luminance(channels: number[]): number {
  const linear = channels.map((channel) => {
    const srgb = channel / 255
    return srgb <= 0.04045 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4
  })
  return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722
}

/** Local custom properties bridge saved palettes into the refreshed design.
 * Empty output lets stylesheet defaults win and clears prior inline overrides.
 */
export function academyThemeOverrides(eligible: boolean, themeId: string, vars: AcademyThemeVars): Record<string, string> {
  if (!eligible || themeId === 'midnight') return {}
  const accent = hexChannels(vars.accent)
  if (!accent) return {} // Presets use opaque hex accents; invalid future presets keep the safe default.
  const lightness = luminance(accent)
  const useBlack = (lightness + 0.05) / 0.05 >= 1.05 / (lightness + 0.05)
  // Move hover away from the chosen foreground, so contrast cannot decrease.
  const hoverTarget = useBlack ? 255 : 0
  const hover = `#${accent.map((channel) => Math.round(channel * 0.92 + hoverTarget * 0.08).toString(16).padStart(2, '0')).join('')}`
  return {
    '--academy-canvas': vars.bg,
    '--academy-surface': vars.panelStrong,
    '--academy-surface-soft': vars.panel,
    '--academy-ink': vars.text,
    '--academy-muted': vars.muted,
    '--academy-line': vars.border,
    '--academy-accent': vars.accent,
    '--academy-accent-hover': hover,
    '--academy-accent-soft': `color-mix(in srgb, ${vars.accent} 12%, ${vars.panelStrong})`,
    '--academy-on-accent': useBlack ? '#000000' : '#ffffff',
    '--academy-positive': vars.good,
    '--academy-danger': vars.bad,
  }
}
