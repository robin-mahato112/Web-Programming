import assert from 'node:assert/strict'
import { test } from 'node:test'
import { once } from 'node:events'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import express from 'express'
import { mountCourseCheckout } from '../server/course-checkout.js'

test('purchase browser test rejects missing, main and mixed targets before sending requests', () => {
  for (const [website, api] of [
    ['', ''],
    ['http://localhost:3000', 'http://localhost:13001'],
    ['http://localhost:3002', 'http://localhost:13001'],
  ]) {
    const result = spawnSync(
      process.execPath,
      [fileURLToPath(new URL('./course-checkout.browser.js', import.meta.url))],
      {
        env: { ...process.env, REVIEW_URL: website, COURSE_API_URL: api },
        encoding: 'utf8',
        timeout: 10000,
      },
    )
    assert.equal(result.status, 1)
    assert.match(result.stderr, /Purchase testing requires isolated frontend 3002 and API 13002/)
  }
})

// Only the middleware's upstream identity is faked here. Live cookie authentication is tested separately.
test('course checkout adapter enforces customer identity, origin and JSON without widening generic permissions', async (t) => {
  const reads = []
  const database = {
    getPool: async () => ({
      request: () => {
        const params = {}
        return {
          input(k, v) {
            params[k] = v
            return this
          },
          async query(query) {
            reads.push({ query, params })
            if (query.includes('Patrons'))
              return { recordset: params.id === 2 ? [{ Email: 'customer@example.test' }] : [] }
            if (query.includes('EGCheckoutAttempts')) return { recordset: [] }
            throw new Error('Unexpected SQL')
          },
        }
      },
    }),
  }
  const app = express()
  app.use(express.json())
  mountCourseCheckout(app, {
    database,
    origins: ['http://localhost:3000'],
    paymentKey: 'fixture'.repeat(16),
    requireAuth: (req, res, next) => {
      if (!req.headers['x-test-role']) return res.status(401).json({ error: 'Sign in' })
      req.user = { role: req.headers['x-test-role'], sub: req.headers['x-test-id'] || '2' }
      next()
    },
  })
  const server = app.listen(0, '127.0.0.1')
  await once(server, 'listening')
  t.after(() => {
    server.closeAllConnections()
    server.close()
  })
  const endpoint = `http://127.0.0.1:${server.address().port}/api/checkout`
  const headers = {
    'x-test-role': 'PATRON',
    Origin: 'http://localhost:3000',
    'X-Checkout-Request': '1',
    'Content-Type': 'application/json',
  }
  const call = (path, body, extra = {}) =>
    fetch(endpoint + path, {
      method: body ? 'POST' : 'GET',
      headers: { ...headers, ...extra },
      ...(body ? { body: JSON.stringify(body) } : {}),
    })
  assert.equal((await fetch(endpoint + '/prepare', { method: 'POST' })).status, 401)
  assert.equal((await call('/prepare', {}, { 'x-test-role': 'ADMIN' })).status, 403)
  assert.equal((await call('/prepare', {}, { Origin: 'https://other.example' })).status, 403)
  assert.equal((await call('/prepare', {}, { 'X-Checkout-Request': '' })).status, 403)
  assert.equal((await call('/prepare', {}, { 'Content-Type': 'text/plain' })).status, 415)
  assert.equal((await call('/prepare', {}, { 'x-test-id': '999' })).status, 401)
  const token = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
  const status = await call('/' + token)
  assert.equal(status.headers.get('Cache-Control'), 'no-store')
  assert.equal((await status.json()).status, 'not-found')
  assert.equal(reads.at(-1).params.patron, 2)
  const card = { holder: 'Test Customer', number: '4242424242424242', expiry: '12/99', cvc: '123' }
  const payment = await call('/payment-method', { token, card })
  assert.equal(payment.status, 200)
  const value = await payment.json()
  assert.equal(value.last4, '4242')
  assert.ok(value.paymentToken)
  assert.ok(!JSON.stringify(value).includes(card.number))
  assert.equal(
    (await call('/payment-method', { token, card: { ...card, expiry: '01/20' } })).status,
    400,
  )
})
