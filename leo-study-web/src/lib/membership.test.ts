import test from 'node:test'
import assert from 'node:assert/strict'
import { effectiveMembership, freeMembership } from './membership.ts'
import { membershipPalette, themeAllowed, themeContrast } from './membershipTheme.ts'
import { getEffectiveProfileDecorationForLevel, autoDecorationKeyForLevel } from './profileDecorationData.ts'

test('paid access expires exactly at its paid boundary and invalid entitlements fail closed', () => {
 const end = Date.parse('2026-10-01T00:00:00Z')
 const paid = { ...freeMembership, tier: 'tier10' as const, paidThrough: new Date(end).toISOString() }
 assert.equal(effectiveMembership(paid, end-1).tier, 'tier10')
 assert.equal(effectiveMembership(paid, end).tier, 'free')
 assert.equal(effectiveMembership({...paid,paidThrough:'invalid'},end).tier,'free')
 assert.equal(effectiveMembership({...paid,paidThrough:null},end).tier,'free')
})
test('Plus gets selected themes, Pro all themes, and original supporter purchases keep cosmetics', () => {
 assert.equal(themeAllowed('midnight','free'),true)
 for(const theme of ['pastel-sky','ocean-mint','pure-black'])assert.equal(themeAllowed(theme,'tier5'),true)
 for(const theme of ['royal-gold','rose']){assert.equal(themeAllowed(theme,'tier5'),false);assert.equal(themeAllowed(theme,'tier10'),true);assert.equal(themeAllowed(theme,'free','tier5'),true)}
 assert.equal(themeAllowed('ocean-mint','free'),false)
})
test('all accent families generate readable text and selected controls in both modes', () => {
 for(const light of [true,false])for(const accent of ['#3b82f6','#a78bfa','#f9a8d4','#38bdf8','#34d399','#fb923c','#facc15','#f87171','#22d3ee','#94a3b8']) {
  const palette=membershipPalette(accent,light)
  for(const surface of [palette.bg,palette.panel,palette.sidebar]) {
   assert.ok(themeContrast(palette.text,surface)>=4.5,`${accent} text`)
   assert.ok(themeContrast(palette.muted,surface)>=4.5,`${accent} muted`)
  }
  assert.ok(themeContrast(palette.accent,palette.panel)>=4.5,`${accent} accent`)
 }
})
test('Pro frames are subscription perks and can never become automatic earned rank rewards', () => {
 for(const level of [1,50,10000])assert.ok(autoDecorationKeyForLevel(level).startsWith('rank_'))
 for(const frame of ['pro_crest','pro_laurel']){
  assert.ok(getEffectiveProfileDecorationForLevel(50,frame,false).key.startsWith('rank_'))
  assert.equal(getEffectiveProfileDecorationForLevel(1,frame,true).key,frame)
 }
 assert.equal(getEffectiveProfileDecorationForLevel(1,'rank_15',true).key,'rank_01')
})

test('expired access still retains the billing link so a payment problem can be resolved', () => {
 const result=effectiveMembership({...freeMembership,tier:'tier10',paidThrough:'2020-01-01T00:00:00Z',subscriptionId:'sub_own',status:'past_due'})
 assert.equal(result.tier,'free');assert.equal(result.subscriptionId,'sub_own');assert.equal(result.status,'past_due')
})
