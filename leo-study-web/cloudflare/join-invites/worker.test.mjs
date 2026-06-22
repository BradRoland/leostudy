import assert from 'node:assert/strict'
import test from 'node:test'
import worker from './worker.js'

async function redirectedLocation(url) {
  const response = await worker.fetch(new Request(url))
  return {
    status: response.status,
    location: response.headers.get('location'),
  }
}

test('redirects invite code paths to the main app invite route', async () => {
  const result = await redirectedLocation('https://join.180.academy/pa181-x7kq2?utm_source=whatsapp')

  assert.equal(result.status, 302)
  assert.equal(result.location, 'https://180.academy/invite/PA181-X7KQ2?utm_source=whatsapp')
})

test('redirects permanent five-digit codes to the main app invite route', async () => {
  const result = await redirectedLocation('https://join.180.academy/12345')

  assert.equal(result.status, 302)
  assert.equal(result.location, 'https://180.academy/invite/12345')
})

test('redirects empty join domain to manual join page', async () => {
  const result = await redirectedLocation('https://join.180.academy/')

  assert.equal(result.status, 302)
  assert.equal(result.location, 'https://180.academy/classes/join')
})

test('rejects unsafe invite path segments', async () => {
  const response = await worker.fetch(new Request('https://join.180.academy/%2E%2E%2Fbad'))

  assert.equal(response.status, 400)
  assert.equal(await response.text(), 'Invalid invite code')
})
