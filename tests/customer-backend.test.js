import assert from 'node:assert/strict'
import { once } from 'node:events'
import { createHash } from 'node:crypto'
import { test } from 'node:test'
import { setImmediate } from 'node:timers/promises'
import express from 'express'
import { mountCourseCustomerAccounts } from '../server/course-customer-accounts.js'
import {
  accountError,
  fingerprint,
  matchesPassword,
  profileValues,
} from '../server/customer-identity.js'
import { createCustomerMailer, customerMailOptions } from '../server/customer-mail.js'
import {
  installCustomerCompose,
  installCustomerDockerfile,
  installCustomerSource,
} from '../scripts/customer-api-install.js'

const password = 'Original123'
const makeRow = (id, email) => ({
  UserID: id,
  Name: 'Test Customer',
  Email: email,
  Salt: 's'.repeat(32),
  HashPW: createHash('sha256')
    .update('s'.repeat(32) + password)
    .digest('hex'),
})
async function fixture(t, options = {}) {
  let time = Date.now()
  const rows = [makeRow(1, 'one@example.test'), makeRow(2, 'two@example.test')]
  const sent = []
  let verifications = 0
  const mailer = {
    local: true,
    async verify() {
      verifications++
      if (options.offline) throw new Error('SMTP private details')
    },
    async sendReset(email, token) {
      if (options.rejected) throw new Error('mail rejected')
      sent.push({ email, token })
      if (options.deliver) await options.deliver(email, token)
    },
  }
  const repository = {
    async findById(id) {
      const row = rows.find((r) => r.UserID === id)
      return row && { ...row }
    },
    async findByEmail(email) {
      const row = rows.find((r) => r.Email === email)
      return row && { ...row }
    },
    async updateProfile(id, values) {
      const row = rows.find((r) => r.UserID === id)
      if (!matchesPassword(values.currentPassword, row))
        throw accountError('Your current password is incorrect.', 403)
      if (rows.some((r) => r.UserID !== id && r.Email === values.email))
        throw accountError('That email address is already in use.', 409)
      Object.assign(row, { Name: values.name, Email: values.email })
      return row
    },
    async resetPassword(previous, next) {
      const row = rows.find((r) => r.UserID === previous.UserID)
      if (fingerprint(row) !== fingerprint(previous))
        throw accountError('Invalid or expired reset code.')
      row.Salt = 'n'.repeat(32)
      row.HashPW = createHash('sha256')
        .update(row.Salt + next)
        .digest('hex')
    },
  }
  const app = express()
  app.use(express.json())
  app.use((req, _res, next) => {
    req.cookies = { token: req.get('X-Test-Identity') }
    next()
  })
  const decode = (value) => JSON.parse(Buffer.from(value, 'base64').toString())
  mountCourseCustomerAccounts(app, {
    repository,
    database: null,
    origins: ['http://localhost:3000'],
    verifyToken: decode,
    requireAuth: (req, res, next) => {
      if (!req.cookies.token) return res.status(401).json({ error: 'Sign in' })
      req.user = decode(req.cookies.token)
      next()
    },
    signToken: (identity) => Buffer.from(JSON.stringify(identity)).toString('base64'),
    mailer: options.disabled ? null : mailer,
    now: () => time,
    limit: options.limit || 100,
  })
  app.get('/api/checkout/test', (_req, res) => res.json({ teammate: true }))
  app.get('/api/admin/test', (_req, res) => res.json({ teammate: true }))
  // Verify the supplied insecure handlers can never be reached after this mount.
  app.post('/requestPasswordReset', (_req, res) => res.json({ token: 'LEAK' }))
  const server = app.listen(0, '127.0.0.1')
  await once(server, 'listening')
  t.after(() => {
    server.closeAllConnections()
    server.close()
  })
  const base = 'http://127.0.0.1:' + server.address().port
  const identity = (id = 1, role = 'PATRON', legacy = false) =>
    Buffer.from(
      JSON.stringify({
        sub: id,
        role,
        ...(legacy ? {} : { accountVersion: fingerprint(rows[id - 1]) }),
      }),
    ).toString('base64')
  const call = async (path, body, extra = {}, method = body === undefined ? 'GET' : 'POST') => {
    const res = await fetch(base + path, {
      method,
      signal: AbortSignal.timeout(5000),
      headers: {
        Origin: 'http://localhost:3000',
        'X-Customer-Request': '1',
        'Content-Type': 'application/json',
        ...extra,
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    })
    return { status: res.status, body: await res.json(), headers: res.headers }
  }
  return {
    call,
    rows,
    sent,
    identity,
    clock: (delta) => {
      time += delta
    },
    verified: () => verifications,
  }
}

test('recovery sends codes only through SMTP, with the same public response for unknown addresses', async (t) => {
  const f = await fixture(t)
  const known = await f.call('/requestPasswordReset', { email: ' ONE@example.test ' })
  const unknown = await f.call('/requestPasswordReset', { email: 'none@example.test' })
  assert.equal(known.status, 200)
  assert.deepEqual(known.body, unknown.body)
  assert.equal(f.verified(), 2)
  assert.equal(f.sent.length, 1)
  assert.equal(f.sent[0].email, 'one@example.test')
  assert.match(f.sent[0].token, /^[a-f0-9]{64}$/)
  assert.equal(known.headers.get('cache-control'), 'no-store')
  assert.ok(!JSON.stringify(known.body).includes(f.sent[0].token))
})
test('recovery acknowledges a delayed delivery and invalidates its code when sending fails', async (t) => {
  let rejectDelivery
  const delivery = new Promise((_resolve, reject) => {
    rejectDelivery = reject
  })
  t.after(() => rejectDelivery(new Error('test cleanup')))
  const errors = t.mock.method(console, 'error', () => {})
  const f = await fixture(t, { deliver: () => delivery })
  const known = await f.call('/requestPasswordReset', { email: 'one@example.test' })
  const unknown = await f.call('/requestPasswordReset', { email: 'missing@example.test' })
  assert.equal(known.status, 200)
  assert.deepEqual(known.body, unknown.body)
  assert.equal(f.sent.length, 1)
  const token = f.sent[0].token
  rejectDelivery(new Error('private SMTP failure'))
  await setImmediate()
  const reset = await f.call('/resetPassword', { token, password: 'NewPassword123' })
  assert.equal(reset.status, 400)
  assert.ok(matchesPassword(password, f.rows[0]))
  assert.equal(errors.mock.callCount(), 1)
  assert.doesNotMatch(JSON.stringify(errors.mock.calls[0].arguments), /private SMTP failure/)
})

test('an older delayed delivery failure cannot invalidate a newer recovery code', async (t) => {
  const deliveries = []
  const f = await fixture(t, {
    deliver: () =>
      new Promise((resolve, reject) => {
        deliveries.push({ resolve, reject })
      }),
  })
  t.after(() => deliveries.forEach(({ resolve }) => resolve()))
  t.mock.method(console, 'error', () => {})
  await f.call('/requestPasswordReset', { email: 'one@example.test' })
  await f.call('/requestPasswordReset', { email: 'one@example.test' })
  deliveries[0].reject(new Error('older send failed'))
  await setImmediate()
  assert.equal(
    (await f.call('/resetPassword', { token: f.sent[0].token, password: 'NewPassword123' })).status,
    400,
  )
  deliveries[1].resolve()
  await setImmediate()
  assert.equal(
    (await f.call('/resetPassword', { token: f.sent[1].token, password: 'NewPassword123' })).status,
    200,
  )
})

test('recovery can locate an existing account with a legacy email format', async (t) => {
  const f = await fixture(t)
  f.rows[0].Email = 'customer@bücher.example'
  assert.equal((await f.call('/requestPasswordReset', { email: f.rows[0].Email })).status, 200)
  assert.equal(f.sent[0].email, f.rows[0].Email)
  assert.equal(
    (await f.call('/resetPassword', { token: f.sent[0].token, password: 'NewPassword123' })).status,
    200,
  )
})

test('email configuration errors never pretend delivery is enabled or expose internals', async (t) => {
  for (const options of [{ disabled: true }, { offline: true }]) {
    const f = await fixture(t, options)
    if (options.disabled) assert.equal((await f.call('/api/customer/recovery')).body.enabled, false)
    const result = await f.call('/requestPasswordReset', { email: 'one@example.test' })
    assert.equal(result.status, 503)
    assert.doesNotMatch(JSON.stringify(result.body), /SMTP private details/)
    assert.equal(f.sent.length, 0)
    assert.equal(
      (await f.call('/api/checkout/test', undefined, { 'X-Test-Identity': f.identity() })).status,
      200,
    )
    assert.equal(
      (await f.call('/api/admin/test', undefined, { 'X-Test-Identity': f.identity(1, 'STAFF') }))
        .status,
      200,
    )
    assert.equal(
      (
        await f.call(
          '/api/customer/profile',
          {
            name: 'Mail Independent Customer',
            email: 'one@example.test',
            currentPassword: password,
          },
          { 'X-Test-Identity': f.identity() },
          'PATCH',
        )
      ).status,
      200,
    )
  }
})
test('requests enforce origin, custom header, JSON, email validity and rate limits', async (t) => {
  const f = await fixture(t, { limit: 2 })
  const body = { email: 'one@example.test' }
  assert.equal(
    (await f.call('/requestPasswordReset', body, { Origin: 'https://evil.example' })).status,
    403,
  )
  assert.equal(
    (await f.call('/requestPasswordReset', body, { 'X-Customer-Request': '' })).status,
    403,
  )
  assert.equal(
    (await f.call('/requestPasswordReset', body, { 'Content-Type': 'text/plain' })).status,
    415,
  )
  assert.equal((await f.call('/requestPasswordReset', { email: 'a@@a.com' })).status, 400)
  assert.equal((await f.call('/requestPasswordReset', body)).status, 200)
  const limited = await f.call('/requestPasswordReset', body)
  assert.equal(limited.status, 429)
  assert.equal(limited.headers.get('retry-after'), '900')
})
test('reset requires a strong valid code, expires and cannot be replayed or raced', async (t) => {
  const f = await fixture(t)
  await f.call('/requestPasswordReset', { email: 'one@example.test' })
  const token = f.sent[0].token
  assert.equal((await f.call('/resetPassword', { token, password: 'abcdefgh' })).status, 400)
  assert.equal(
    (await f.call('/resetPassword', { token: 'f'.repeat(64), password: 'NextPassword123' })).status,
    400,
  )
  const attempts = await Promise.all(
    [1, 2].map(() => f.call('/resetPassword', { token, password: 'NextPassword123' })),
  )
  assert.deepEqual(attempts.map((r) => r.status).sort(), [200, 400])
  assert.ok(matchesPassword('NextPassword123', f.rows[0]))
  assert.ok(!matchesPassword(password, f.rows[0]))
  assert.equal((await f.call('/resetPassword', { token, password: 'Another123' })).status, 400)
  await f.call('/requestPasswordReset', { email: 'one@example.test' })
  f.clock(15 * 60 * 1000)
  assert.equal(
    (await f.call('/resetPassword', { token: f.sent.at(-1).token, password: 'Another123' })).status,
    400,
  )
})
test('new requests retire earlier codes and password reset invalidates old customer checkout sessions', async (t) => {
  const f = await fixture(t)
  const old = f.identity()
  await f.call('/requestPasswordReset', { email: 'one@example.test' })
  await f.call('/requestPasswordReset', { email: 'one@example.test' })
  assert.equal(
    (await f.call('/resetPassword', { token: f.sent[0].token, password: 'Another123' })).status,
    400,
  )
  assert.equal(
    (await f.call('/resetPassword', { token: f.sent[1].token, password: 'Another123' })).status,
    200,
  )
  assert.equal(
    (await f.call('/api/checkout/test', undefined, { 'X-Test-Identity': old })).status,
    401,
  )
  assert.equal(
    (await f.call('/api/checkout/test', undefined, { 'X-Test-Identity': f.identity() })).status,
    200,
  )
  assert.equal(
    (
      await f.call('/api/admin/test', undefined, {
        'X-Test-Identity': f.identity(1, 'ADMIN', true),
      })
    ).status,
    200,
  )
  assert.equal(
    (
      await f.call('/api/admin/test', undefined, {
        'X-Test-Identity': f.identity(1, 'STAFF', true),
      })
    ).status,
    200,
  )
})
test('profile only updates the signed-in customer and refreshes the cookie without widening generic access', async (t) => {
  const f = await fixture(t)
  const body = { name: 'New Name', email: 'new@example.test', currentPassword: password }
  const old = f.identity()
  const headers = { 'X-Test-Identity': old }
  assert.equal((await f.call('/api/customer/profile', body, {}, 'PATCH')).status, 401)
  assert.equal(
    (
      await f.call(
        '/api/customer/profile',
        body,
        { 'X-Test-Identity': f.identity(1, 'STAFF') },
        'PATCH',
      )
    ).status,
    403,
  )
  for (const extra of [{ userId: 2 }, { role: 'ADMIN' }, { HashPW: 'x' }])
    assert.equal(
      (await f.call('/api/customer/profile', { ...body, ...extra }, headers, 'PATCH')).status,
      400,
    )
  assert.equal(
    (await f.call('/api/customer/profile', { ...body, currentPassword: 'wrong' }, headers, 'PATCH'))
      .status,
    403,
  )
  assert.equal(
    (
      await f.call(
        '/api/customer/profile',
        { ...body, email: 'two@example.test' },
        headers,
        'PATCH',
      )
    ).status,
    409,
  )
  await f.call('/requestPasswordReset', { email: 'one@example.test' })
  const result = await f.call('/api/customer/profile', body, headers, 'PATCH')
  assert.equal(result.status, 200)
  assert.deepEqual(result.body, {
    userId: 1,
    name: 'New Name',
    email: 'new@example.test',
    role: 'customer',
  })
  assert.match(result.headers.get('set-cookie'), /HttpOnly/)
  assert.equal(f.rows[1].Name, 'Test Customer')
  assert.equal((await f.call('/api/checkout/test', undefined, headers)).status, 401)
  assert.equal(
    (await f.call('/resetPassword', { token: f.sent[0].token, password: 'Another123' })).status,
    400,
  )
})
test('profile and mail configuration validation rejects injection and unsafe SMTP modes', () => {
  assert.throws(() =>
    profileValues({ name: 'x\nInjected', email: 'a@b.com', currentPassword: password }),
  )
  assert.throws(() => profileValues({ name: 'X', email: 'a@@b.com', currentPassword: password }))
  assert.equal(createCustomerMailer({}), null)
  assert.throws(() =>
    customerMailOptions({
      CUSTOMER_MAIL_MODE: 'local',
      SMTP_HOST: 'external.example',
      SMTP_FROM: 'test@example.test',
    }),
  )
  assert.throws(() =>
    customerMailOptions({
      CUSTOMER_MAIL_MODE: 'local',
      NODE_ENV: 'production',
      SMTP_HOST: 'mailpit',
      SMTP_FROM: 'test@example.test',
    }),
  )
})
test('installer preserves teammate mounts and is idempotent; refuses unknown source layouts', () => {
  const source = `import express from 'express';\n// Data API routes\nmountCourseManagement(app, options);\nconst tokenPayload = { sub: patron.UserID, email: patron.Email, username: patron.Name, role };\n// Request a password reset - generates a token and returns it\napp.post('/requestPasswordReset', oldHandler);\napp.get('/me', requireAuth, me);\nmountCourseCheckout(app, options);`
  const installed = installCustomerSource(source)
  assert.equal(installCustomerSource(installed), installed)
  assert.ok(installed.includes('mountCourseCheckout(app, options);'))
  assert.ok(installed.includes('mountCourseManagement(app, options);'))
  assert.ok(!installed.includes('oldHandler'))
  assert.ok(installed.includes('accountVersion: fingerprint(patron)'))
  assert.throws(() => installCustomerSource('unrecognised server'))
  const compose =
    'services:\n  db:\n    image: mssql\n  auth:\n    env_file:\n      - .checkout.env\n'
  assert.equal(
    installCustomerCompose(installCustomerCompose(compose)),
    installCustomerCompose(compose),
  )
  const docker = 'COPY server.js ./\nCOPY checkout-extension ./checkout-extension\n'
  assert.equal(
    installCustomerDockerfile(installCustomerDockerfile(docker)),
    installCustomerDockerfile(docker),
  )
})
