import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { developmentBuildEnvironment } from './deployment-config.mjs'

const env = developmentBuildEnvironment(process.env)
execFileSync('npm', ['run', 'build'], {
  cwd: fileURLToPath(new URL('../../', import.meta.url)), env, stdio: 'inherit',
})
