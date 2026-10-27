import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  courseAccountRequest,
  courseFetch,
  courseRequest,
  courseResetPassword,
  COURSE_SESSION_EXPIRED,
} from '../src/services/course-api.js'

test('password reset validates before sending and redeems only the supplied code', async (t) => {
  const calls = []
  const mock = t.mock.method(globalThis, 'fetch', async (url, options) => {
    calls.push({ url, options })
    return Response.json({ ok: true })
  })
  const valid = {
    token: 'a'.repeat(64),
    password: 'fixture-password',
    confirmPassword: 'fixture-password',
  }
  await assert.rejects(courseResetPassword({ ...valid, token: '' }), /valid reset code/)
  await assert.rejects(courseResetPassword({ ...valid, password: 'short' }), /8 and 128/)
  await assert.rejects(
    courseResetPassword({ ...valid, confirmPassword: 'different' }),
    /do not match/,
  )
  assert.equal(calls.length, 0)
  await courseResetPassword(valid)
  assert.equal(calls[0].url.pathname, '/resetPassword')
  assert.equal(calls[0].url.search, '')
  assert.deepEqual(JSON.parse(calls[0].options.body), {
    token: valid.token,
    password: valid.password,
  })
  assert.equal(calls[0].options.credentials, 'include')
  mock.mock.mockImplementation(async () =>
    Response.json({ error: 'Invalid or expired token' }, { status: 401 }),
  )
  await assert.rejects(courseResetPassword(valid), /Invalid or expired token/)
})

test('course login uses credentials on login, session and own-profile requests', async (t) => {
  const calls = []
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    calls.push({ path: url.pathname, options })
    return Response.json(
      url.pathname === '/me'
        ? { id: 7, email: 'fixture@example.test', role: 'PATRON' }
        : url.pathname.includes('/Patrons/')
          ? { UserID: 7, Name: 'Fixture', Email: 'fixture@example.test' }
          : { ok: true },
    )
  })
  const result = await courseAccountRequest('/auth/login', {
    login: 'fixture@example.test',
    password: 'fixture-password',
  })
  assert.equal(result.user.role, 'customer')
  assert.equal(result.user.patronId, '7')
  assert.deepEqual(
    calls.map((c) => c.path),
    ['/patronLogin', '/me', '/api/inft3050/Patrons/7'],
  )
  assert.deepEqual(JSON.parse(calls[0].options.body), {
    username: 'fixture@example.test',
    password: 'fixture-password',
  })
  assert.ok(calls.every((c) => c.options.credentials === 'include'))
  assert.ok(calls.every((c) => !('Authorization' in c.options.headers)))
  assert.deepEqual(await courseAccountRequest('/auth/logout'), { user: null })
  assert.equal(calls.at(-1).path, '/logout')
})

test('course session expiration is anonymous, failures are not disguised and unsupported writes fail closed', async (t) => {
  const mock = t.mock.method(globalThis, 'fetch', async () =>
    Response.json({ error: 'Unauthorized' }, { status: 401 }),
  )
  assert.deepEqual(await courseAccountRequest('/auth/session'), { user: null })
  mock.mock.mockImplementation(async () => Response.json({ error: 'SQL details' }, { status: 500 }))
  await assert.rejects(courseAccountRequest('/auth/session'), /service is unavailable/)
  for (const path of ['/profile', '/management/users'])
    await assert.rejects(courseAccountRequest(path, {}), /currently unavailable/)
})

test('registration checks availability, uses university hashing and restores the new session', async (t) => {
  const calls = []
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    calls.push({ path: url.pathname, ...options })
    if (url.pathname === '/patronLookup') return Response.json({}, { status: 404 })
    if (url.pathname === '/api/inft3050/Patrons')
      return Response.json({ UserID: 9, HashPW: 'server-hash' }, { status: 201 })
    if (url.pathname === '/me')
      return Response.json({ id: 9, email: 'new@example.test', role: 'PATRON' })
    return Response.json({ Name: 'New Customer' })
  })
  const result = await courseAccountRequest('/auth/register', {
    name: ' New Customer ',
    email: 'new@example.test',
    password: 'fixture-password',
    confirmPassword: 'fixture-password',
  })
  assert.equal(result.user.name, 'New Customer')
  assert.deepEqual(
    calls.map((call) => call.path),
    ['/patronLookup', '/api/inft3050/Patrons', '/patronLogin', '/me', '/api/inft3050/Patrons/9'],
  )
  assert.deepEqual(JSON.parse(calls[1].body), {
    Name: 'New Customer',
    Email: 'new@example.test',
    HashPW: 'fixture-password',
  })
  assert.ok(calls.every((call) => call.credentials === 'include'))
  assert.doesNotMatch(JSON.stringify(result), /fixture-password|server-hash/)
})

test('invalid or mismatched registration fields never reach the API', async (t) => {
  const request = t.mock.method(globalThis, 'fetch', async () => {
    throw new Error('Unexpected request')
  })
  const valid = {
    name: 'Customer',
    email: 'new@example.test',
    password: 'fixture-password',
    confirmPassword: 'fixture-password',
  }
  for (const fields of [
    { name: ' ' },
    { email: 'invalid' },
    { password: 'short' },
    { confirmPassword: 'different' },
  ]) {
    await assert.rejects(courseAccountRequest('/auth/register', { ...valid, ...fields }))
  }
  assert.equal(request.mock.callCount(), 0)
})

test('registration stops on duplicates and lookup failures without creating or resetting accounts', async (t) => {
  const fields = {
    name: 'Customer',
    email: 'new@example.test',
    password: 'fixture-password',
    confirmPassword: 'fixture-password',
  }
  const request = t.mock.method(globalThis, 'fetch', async () => Response.json({ UserID: 9 }))
  await assert.rejects(courseAccountRequest('/auth/register', fields), /Sign in instead/)
  assert.equal(request.mock.callCount(), 1)
  request.mock.mockImplementation(async () => Response.json({}, { status: 503 }))
  await assert.rejects(courseAccountRequest('/auth/register', fields), /service is unavailable/)
  assert.equal(request.mock.callCount(), 2)
})

test('registration distinguishes successful creation from an unavailable login', async (t) => {
  t.mock.method(globalThis, 'fetch', async (url) =>
    Response.json(
      {},
      {
        status:
          url.pathname === '/patronLookup'
            ? 404
            : url.pathname === '/api/inft3050/Patrons'
              ? 201
              : 503,
      },
    ),
  )
  await assert.rejects(
    courseAccountRequest('/auth/register', {
      name: 'Customer',
      email: 'new@example.test',
      password: 'fixture-password',
      confirmPassword: 'fixture-password',
    }),
    /account was created.*Please sign in/,
  )
})

test('course public reads also use the shared credentialed client', async (t) => {
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(url.pathname, '/api/inft3050/Product')
    assert.equal(options.credentials, 'include')
    assert.equal(options.mode, undefined)
    return Response.json({ list: [] })
  })
  await courseFetch('/api/inft3050/Product')
})

test('checkout 401 requests reauthentication; invalid login and server failure do not discard the session', async (t) => {
  const events = []
  const previous = globalThis.dispatchEvent
  globalThis.dispatchEvent = (event) => {
    events.push(event.type)
    return true
  }
  t.after(() => {
    if (previous) globalThis.dispatchEvent = previous
    else delete globalThis.dispatchEvent
  })
  const fetch = t.mock.method(globalThis, 'fetch', async () =>
    Response.json({ error: 'Expired' }, { status: 401 }),
  )
  await assert.rejects(
    courseRequest('/api/checkout/prepare', { body: {} }),
    (e) => e.status === 401,
  )
  assert.deepEqual(events, [COURSE_SESSION_EXPIRED])
  await assert.rejects(courseRequest('/patronLogin', { body: {} }), (e) => e.status === 401)
  fetch.mock.mockImplementation(async () => Response.json({ error: 'Internal' }, { status: 503 }))
  await assert.rejects(
    courseRequest('/api/checkout/confirm', { body: {} }),
    (e) => e.status === 503,
  )
  assert.equal(events.length, 1)
})
