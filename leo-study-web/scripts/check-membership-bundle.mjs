// Paid scenarios must never be shipped in public JavaScript or source maps.
import assert from 'node:assert/strict'
import {readFile,readdir} from 'node:fs/promises'
const root=new URL('../',import.meta.url)
const bank=JSON.parse(await readFile(new URL('backend/data/membership-content.json',root)))
const files=await readdir(new URL('dist/assets/',root))
const bundles=(await Promise.all(files.filter(name=>/\.(js|map)$/.test(name)).map(name=>readFile(new URL(`dist/assets/${name}`,root),'utf8')))).join('\n')
const stems=[...bank.modules.flatMap(module=>module.scenarios.map(scenario=>scenario.stem)),...bank.scenarios.map(scenario=>scenario.scenario)].filter(value=>typeof value==='string'&&value.length>80)
assert.ok(stems.length>100,'Verify a meaningful sample of the private question bank')
for(const stem of stems){assert.ok(!bundles.includes(stem), 'Paid scenario found in the public bundle');assert.ok(!bundles.includes(JSON.stringify(stem).slice(1,-1)),'Escaped paid scenario found in the public bundle')}
console.log(`PASS: ${stems.length} private scenario stems are absent from the public build.`)
