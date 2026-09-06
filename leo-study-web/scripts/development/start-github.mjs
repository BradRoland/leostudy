import { validateDevelopmentRuntime } from './deployment-config.mjs'

try {
  validateDevelopmentRuntime(process.env)
} catch (error) {
  console.error(error.message)
  process.exit(1)
}
// Configuration must come from the isolated runtime, never an inherited file.
process.env.DOTENV_CONFIG_PATH = '/dev/null'
await import('../../backend/coolify-server.mjs')
