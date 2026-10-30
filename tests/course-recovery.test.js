import assert from 'node:assert/strict'
import { test } from 'node:test'
import { requestRecoveryEmail, resetCustomerPassword } from '../src/data/passwordRecovery.js'

test('course recovery uses only original endpoints and returns only validated development codes', async (t) => {
  const calls = []
  const token = 'A'.repeat(64)
  const mock = t.mock.method(globalThis, 'fetch', async (url, options) => {
    calls.push({ path: url.pathname, ...options })
    return Response.json({ ok: true, token, expiresIn: '15 minutes' })
  })
  await assert.rejects(requestRecoveryEmail('invalid'), /valid email/)
  assert.equal(calls.length, 0)
  assert.deepEqual(await requestRecoveryEmail(' Legacy..Customer@example.test '), {
    code: token.toLowerCase(),
  })
  assert.equal(calls[0].path, '/requestPasswordReset')
  assert.equal(calls[0].credentials, 'include')
  assert.equal(calls[0].headers['X-Customer-Request'], undefined)
  assert.deepEqual(JSON.parse(calls[0].body), { email: 'legacy..customer@example.test' })
  mock.mock.mockImplementation(async () => Response.json({ ok: true }))
  assert.deepEqual(await requestRecoveryEmail('unknown@example.test'), { code: '' })
  await resetCustomerPassword({ token, password: 'NewPassword123' })
})

test('course recovery rejects malformed responses and never displays backend HTML as a code', async (t) => {
  const mock = t.mock.method(globalThis, 'fetch', async () => Response.json({}))
  for (const response of [
    {},
    { ok: false },
    { ok: true, token: '<script>bad</script>' },
    { ok: true, token: 123 },
    { ok: true, token: null },
  ]) {
    mock.mock.mockImplementation(async () => Response.json(response))
    await assert.rejects(requestRecoveryEmail('customer@example.test'))
  }
  mock.mock.mockImplementation(async () =>
    Response.json({ error: 'private database details' }, { status: 500 }),
  )
  await assert.rejects(requestRecoveryEmail('customer@example.test'), /service is unavailable/)
})
