import { build } from 'esbuild'
import { mkdir, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
const root = fileURLToPath(new URL('../', import.meta.url))
const result = await build({ stdin: {
  contents: "import {loadLocalContentBundle} from './backend/membership-content-source.ts'; import {practiceTestModules} from './src/content/practiceTests.ts'; export default {modules:practiceTestModules,scenarios:loadLocalContentBundle().scenarioItems};",
  resolveDir: root, loader: 'ts',
}, bundle: true, platform: 'node', format: 'esm', write: false })
const { default: content } = await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`)
await mkdir(new URL('../backend/data/', import.meta.url), { recursive: true })
await writeFile(new URL('../backend/data/membership-content.json', import.meta.url), JSON.stringify(content))
console.log(`Prepared private membership content: ${content.modules.length} practice modules and ${content.scenarios.length} scenarios.`)
