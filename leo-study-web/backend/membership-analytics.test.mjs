import test from 'node:test'
import assert from 'node:assert/strict'
import { buildMembershipAnalytics } from './membership-analytics.mjs'
const now = Date.parse('2026-09-09T12:00:00Z')
test('weekly reports use Monday boundaries, exclude future sessions, and compare actual study records', () => {
 const result=buildMembershipAnalytics({profile_details:{stats:{sessionTimeline:[
 {at:Date.parse('2026-09-06T23:59:00Z'),accuracy:50},
 {at:Date.parse('2026-09-07T00:00:00Z'),accuracy:75},
 {at:now,accuracy:85},{at:now+1,accuracy:100},{at:-1,accuracy:100},
 ]}}},now)
 assert.deepEqual(result.current,{sessions:2,accuracy:80});assert.deepEqual(result.previous,{sessions:1,accuracy:50})
 assert.equal(result.sessionDelta,1);assert.equal(result.accuracyDelta,30);assert.equal(result.weekStart,'2026-09-07')
 assert.equal(result.calendar.length,28);assert.equal(result.calendar.at(-1).count,1)
})
test('empty reports show no invented accuracy and prioritize practiced weaknesses', () => {
 assert.equal(buildMembershipAnalytics({},now).current.accuracy,null)
 const result=buildMembershipAnalytics({profile_details:{algorithmSnapshot:{a:{codeSet:'penal',sectionNumber:'1',accuracy:75,attempts:4},b:{codeSet:'hs',sectionNumber:'2',accuracy:25,attempts:2},c:{codeSet:'vehicle',accuracy:0,attempts:0}}}},now)
 assert.deepEqual(result.weaknesses.map(row=>row.sectionNumber),['2','1'])
})
