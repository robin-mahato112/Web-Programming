import assert from 'node:assert/strict'
import { test } from 'node:test'
import { setupCustomer } from '../scripts/setup-customer.js'

const settings = {
  api: 'http://localhost:13002',
  name: 'Customer',
  email: 'customer@example.test',
  password: 'fixture-password',
}
function responses(sequence) {
  const calls = []
  return {
    calls,
    request: async (url, options) => {
      calls.push({ url, ...options })
      assert.ok(sequence.length, 'Unexpected API request')
      const [status, body = {}] = sequence.shift()
      return new Response(JSON.stringify(body), { status })
    },
  }
}
const identity = { email: settings.email, role: 'PATRON' }
test('customer setup verifies existing accounts without writes or password resets', async () => {
  const api = responses([[200], [200, identity]])
  assert.deepEqual(await setupCustomer(settings, api.request), { created: false })
  assert.equal(api.calls.length, 2)
  assert.ok(api.calls.every((call) => !call.url.includes('/api/inft3050/Patrons')))
})
test('customer setup creates only a missing patron through the university hashing endpoint', async () => {
  const api = responses([[404], [201], [200, identity]])
  assert.deepEqual(await setupCustomer(settings, api.request), { created: true })
  assert.equal(api.calls[1].url, settings.api + '/api/inft3050/Patrons')
  assert.deepEqual(JSON.parse(api.calls[1].body), {
    Name: settings.name,
    Email: settings.email,
    HashPW: settings.password,
  })
})
test('customer setup stops on lookup failure, duplicate and invalid existing password', async () => {
  for (const sequence of [[[503]], [[404], [409]], [[200], [401]]]) {
    const api = responses(sequence)
    await assert.rejects(setupCustomer(settings, api.request))
    assert.ok(api.calls.every((call) => !['PATCH', 'PUT', 'DELETE'].includes(call.method)))
  }
})
test('customer setup rejects remote targets and incomplete credentials before sending requests', async () => {
  for (const override of [
    { api: 'https://other.example' },
    { password: '' },
    { email: 'invalid' },
    { name: '' },
  ]) {
    const api = responses([])
    await assert.rejects(setupCustomer({ ...settings, ...override }, api.request))
    assert.equal(api.calls.length, 0)
  }
})
