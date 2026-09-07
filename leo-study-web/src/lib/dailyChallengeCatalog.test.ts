import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
const catalog = JSON.parse(readFileSync(new URL('../data/dailyChallengeCatalog.json', import.meta.url), 'utf8')) as Array<{id:string;title:string;position:number;metric:string;target:number;xp:number;game_mode:string|null;code_filter:string|null;min_accuracy:number;min_answers:number;practice_path:string;description:string}>
test('100 distinct daily goals cover all practice modes and code sets with unique conditions', () => {
  assert.equal(catalog.length,100)
  assert.equal(new Set(catalog.map(c=>c.id)).size,100)
  assert.equal(new Set(catalog.map(c=>c.title)).size,100)
  assert.equal(new Set(catalog.map(c=>JSON.stringify([c.metric,c.target,c.game_mode,c.code_filter,c.min_accuracy,c.min_answers]))).size,100)
  assert.deepEqual(new Set(catalog.map(c=>c.game_mode)),new Set([null,'study_test','matching','speed','blaster']))
  assert.deepEqual(new Set(catalog.map(c=>c.code_filter)),new Set([null,'penal','hs','vehicle']))
  assert.ok(new Set(catalog.map(c=>c.metric)).size>=10)
})
test('catalog is attainable, explicit, and limited to free practice routes', () => {
  for(const c of catalog){
    assert.equal(c.min_answers,5)
    assert.ok(c.target>=1&&c.target<=25)
    assert.ok(c.xp>=25&&c.xp<=120)
    assert.ok(['/study/test','/games/matching','/games/speed','/games/blaster'].includes(c.practice_path))
    assert.ok(c.description.length>45)
  }
})
test('migration carries the exact reviewed catalog, so server and source cannot drift', () => {
  const sql=readFileSync(new URL('../../supabase/migrations/20260907183017_rotating_daily_challenge_catalog.sql',import.meta.url),'utf8')
  const embedded=sql.split('$catalog$')[1]
  assert.deepEqual(JSON.parse(embedded),catalog)
})
