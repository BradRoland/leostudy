import assert from 'node:assert/strict'
const projectName = 'class180-ui-test-20260906'
const privateNetworkName = projectName + '_test'
const reservedServiceNames = ['auth', 'rest', 'storage', 'realtime']
const reservedNetworkNames = [...reservedServiceNames, 'imgproxy', ...reservedServiceNames.map(name => 'supabase-' + name), 'supabase-imgproxy']
const reservedHttpHosts = [...reservedNetworkNames, 'supabase.180.academy']

function httpTargets(service) {
  const targets = { ...(service.http_targets || {}) }
  const environment = Array.isArray(service.environment)
    ? Object.fromEntries(service.environment.filter(value => value.includes('=')).map(value => [value.slice(0, value.indexOf('=')), value.slice(value.indexOf('=') + 1)]))
    : service.environment || {}
  for (const [key, value] of Object.entries(environment)) {
    if (typeof value !== 'string' || !/^https?:\/\//i.test(value.trim())) continue
    try { targets[key] = new URL(value.trim()).hostname } catch { throw new Error('Invalid development HTTP URL in ' + key + '.') }
  }
  return Object.values(targets).map(host => String(host).toLowerCase())
}
export function assertDevelopmentComposeIsolation(compose) {
  assert.equal(compose?.name, projectName, 'Use only the retained development Compose project.')
  const services = compose.services || {}
  const networks = compose.networks || {}
  for (const name of reservedServiceNames) {
    assert.ok(services['academy-test-' + name], 'Development service must be named academy-test-' + name + '.')
    assert.ok(!services[name], 'Development must not define the production service name ' + name + '.')
  }
  for (const [serviceName, service] of Object.entries(services)) {
    assert.ok(!service.network_mode, 'Development services must declare explicit isolated networks.')
    const attachments = Array.isArray(service.networks)
      ? Object.fromEntries(service.networks.map(name => [name, {}]))
      : service.networks || { default: {} }
    let sharedDatabaseNetwork = false
    for (const [networkKey, attachment] of Object.entries(attachments)) {
      const definition = networks[networkKey] || {}
      const actualName = definition.name || (typeof definition.external === 'object' && definition.external?.name) || projectName + '_' + networkKey
      assert.ok(!actualName.includes('${'), 'Development network names must be resolved before deployment.')
      const privateTestNetwork = networkKey === 'test' && !definition.external && actualName === privateNetworkName
      sharedDatabaseNetwork = sharedDatabaseNetwork || actualName === 'supabase_default' || networkKey === 'supabase_default'
      const aliases = [serviceName, service.container_name, service.hostname, ...(attachment?.aliases || [])].filter(Boolean)
      for (const alias of aliases) {
        assert.ok(privateTestNetwork || !reservedNetworkNames.includes(alias),
          'Development alias ' + alias + ' is allowed only on the private test network.')
      }
    }
    if (sharedDatabaseNetwork) {
      assert.ok(!httpTargets(service).some(host => reservedHttpHosts.includes(host)),
        'Shared-network development services must use namespaced development HTTP targets.')
    }
  }
  return true
}
