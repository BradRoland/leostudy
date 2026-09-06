import assert from 'node:assert/strict'
import test from 'node:test'
import { academyThemeOverrides } from './academyTheme.ts'

const palette = {
  bg: '#fff6fb', panel: 'rgba(255, 237, 245, 0.88)', panelStrong: 'rgba(255, 230, 240, 0.96)',
  text: '#2f1b30', muted: '#6f5270', border: 'rgba(188, 123, 150, 0.28)', accent: '#c35f92', good: '#2c9b6e', bad: '#cc5163',
}

function contrast(a: string, b: string) {
  const luminance = (hex: string) => {
    const channels = [1, 3, 5].map((index) => parseInt(hex.slice(index, index + 2), 16) / 255)
    const linear = channels.map((value) => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4)
    return linear.reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index], 0)
  }
  const values = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (values[0] + 0.05) / (values[1] + 0.05)
}

test('free accounts and the saved default leave the new Academy palette untouched', () => {
  assert.deepEqual(academyThemeOverrides(false, 'pastel-rose', palette), {})
  assert.deepEqual(academyThemeOverrides(true, 'midnight', palette), {})
  assert.deepEqual(academyThemeOverrides(true, 'future-invalid', { ...palette, accent: 'invalid' }), {})
})

test('eligible custom themes provide local design tokens without mutating the saved preset', () => {
  const original = structuredClone(palette)
  const tokens = academyThemeOverrides(true, 'pastel-rose', Object.freeze(palette))
  assert.equal(tokens['--academy-canvas'], '#fff6fb')
  assert.equal(tokens['--academy-surface'], palette.panelStrong)
  assert.equal(tokens['--academy-ink'], palette.text)
  assert.equal(tokens['--academy-accent'], '#c35f92')
  assert.deepEqual(palette, original)
  // A return to the default yields no inline palette keys, allowing React to
  // remove the previous custom theme rather than leaving old overrides behind.
  assert.equal(Object.keys(academyThemeOverrides(true, 'midnight', palette)).length, 0)
})

test('all custom preset accents and contrast-boundary colors have readable normal and hover button text', () => {
  const accents = ['#2f74e5', '#c35f92', '#2f70e1', '#5f97ff', '#e3bc68', '#47c4b2', '#9a87ff', '#70b69a', '#de6cb5', '#767676', '#777777', '#000000', '#ffffff']
  for (const accent of accents) {
    const tokens = academyThemeOverrides(true, 'custom', { ...palette, accent })
    const normal = contrast(tokens['--academy-on-accent'], accent)
    const hover = contrast(tokens['--academy-on-accent'], tokens['--academy-accent-hover'])
    assert.ok(normal >= 4.5, `${accent} normal button contrast is ${normal}`)
    assert.ok(hover >= normal, `${accent} hover must not reduce contrast`)
  }
  assert.equal(academyThemeOverrides(true, 'custom', { ...palette, accent: '#000000' })['--academy-on-accent'], '#ffffff')
  assert.equal(academyThemeOverrides(true, 'custom', { ...palette, accent: '#ffffff' })['--academy-on-accent'], '#000000')
})

test('light-mode computed surfaces remain in the same custom palette', () => {
  const light = { ...palette, bg: 'color-mix(in srgb, #fff1f8 10%, #f6f9ff)', panelStrong: 'color-mix(in srgb, rgba(255,230,240,.96) 20%, #f2f6ff)', text: '#18233d' }
  const tokens = academyThemeOverrides(true, 'pastel-rose', light)
  assert.equal(tokens['--academy-canvas'], light.bg)
  assert.equal(tokens['--academy-surface'], light.panelStrong)
  assert.equal(tokens['--academy-ink'], light.text)
  assert.equal(tokens['--academy-accent'], palette.accent)
})
