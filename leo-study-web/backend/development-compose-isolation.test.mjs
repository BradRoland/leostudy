import assert from 'node:assert/strict'
import test from 'node:test'
import { assertDevelopmentComposeIsolation } from '../scripts/development/compose-isolation.mjs'
const serviceNames = ['auth', 'rest', 'storage', 'realtime']
const topology = () => ({
  name: 'class180-ui-test-20260906',
  networks: { test: { internal: true }, database: { external: true, name: 'supabase_default' }, edge: {} },
  services: {
    ...Object.fromEntries(serviceNames.map(name => ['academy-test-' + name, {
      networks: { test: { aliases: [name] }, database: {} },
    }])),
    gateway: { networks: ['test', 'edge'] },
    mail: { networks: ['test', 'edge'] },
  },
})
test('short aliases stay exclusively on the private test network', () => {
  assert.equal(assertDevelopmentComposeIsolation(topology()), true)
})
test('implicit service names cannot bypass empty explicit aliases on the shared network', () => {
  for (const name of serviceNames) {
    const config = topology()
    config.services[name] = { networks: { database: { aliases: [] } } }
    assert.throws(() => assertDevelopmentComposeIsolation(config), /production service name/)
  }
})
test('renamed services cannot restore production network, container or host aliases', () => {
  for (const name of serviceNames) for (const property of ['network', 'container_name', 'hostname']) {
    const config = topology()
    const service = config.services['academy-test-' + name]
    if (property === 'network') service.networks.database.aliases = [name]
    else service[property] = name
    assert.throws(() => assertDevelopmentComposeIsolation(config), /private test network/)
  }
})
test('a test label cannot disguise an external or production network', () => {
  for (const network of [{ external: true, name: 'class180-ui-test-20260906_test' }, { name: 'supabase_default' }]) {
    const config = topology()
    config.networks.test = network
    assert.throws(() => assertDevelopmentComposeIsolation(config), /private test network/)
  }
})
test('default and array attachments cannot bypass alias checks', () => {
  const config = topology()
  config.services.gateway.container_name = 'auth'
  assert.throws(() => assertDevelopmentComposeIsolation(config), /private test network/)
  delete config.services.gateway.networks
  config.networks.default = { external: true, name: 'supabase_default' }
  assert.throws(() => assertDevelopmentComposeIsolation(config), /private test network/)
})
test('wrong projects, missing namespaced services and shared namespaces fail closed', () => {
  const wrong = topology()
  wrong.name = 'supabase'
  assert.throws(() => assertDevelopmentComposeIsolation(wrong), /retained development/)
  const missing = topology()
  delete missing.services['academy-test-auth']
  assert.throws(() => assertDevelopmentComposeIsolation(missing), /academy-test-auth/)
  const shared = topology()
  shared.services['academy-test-auth'].network_mode = 'container:supabase-auth'
  assert.throws(() => assertDevelopmentComposeIsolation(shared), /explicit isolated networks/)
})
test('dual-homed HTTP targets cannot resolve production service aliases', () => {
  for (const host of ['auth', 'rest', 'storage', 'realtime', 'imgproxy', 'supabase-rest', 'supabase.180.academy']) {
    const config = topology()
    config.services['academy-test-storage'].environment = { POSTGREST_URL: 'http://' + host + ':3000/private?token=never-print-this' }
    assert.throws(() => assertDevelopmentComposeIsolation(config), error =>
      /namespaced development HTTP targets/.test(error.message) && !error.message.includes('never-print-this'))
  }
})
test('namespaced HTTP targets and disabled image transformation are accepted', () => {
  const config = topology()
  config.services['academy-test-storage'].environment = ['POSTGREST_URL=http://academy-test-rest:3000', 'IMGPROXY_URL=', 'ENABLE_IMAGE_TRANSFORMATION=false']
  assert.equal(assertDevelopmentComposeIsolation(config), true)
})
test('sanitized topology HTTP hosts receive the same shared-network guard', () => {
  const config = topology()
  config.services['academy-test-storage'].http_targets = { POSTGREST_URL: 'rest' }
  assert.throws(() => assertDevelopmentComposeIsolation(config), /namespaced development HTTP targets/)
})
test('test-only gateway may retain short upstream names without reaching the shared database network', () => {
  const config = topology()
  config.services.gateway.environment = { AUTH_URL: 'http://auth:9999', REST_URL: 'http://rest:3000' }
  assert.equal(assertDevelopmentComposeIsolation(config), true)
})
