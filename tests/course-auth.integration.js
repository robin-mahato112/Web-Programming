import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { test } from 'node:test'

// Existing patron only: login and catalogue/own-record reads; no password, order or stock writes.
test('course authentication retains cookies and permissions without leaking credentials into logs', async () => {
  const api = process.env.COURSE_API_URL
  const container = process.env.COURSE_API_CONTAINER
  const email = process.env.TEST_PATRON_EMAIL
  const password = process.env.TEST_PATRON_PASSWORD
  assert.ok(
    api && container && email && password,
    'Supply API URL/container and private patron credentials',
  )
  const since = new Date().toISOString()
  const post = (path, body) =>
    fetch(api + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  assert.equal((await fetch(api + '/api/inft3050/BookGenre')).status, 200)
  assert.equal((await fetch(api + '/me')).status, 401)
  assert.equal((await post('/patronLogin', {})).status, 400)
  const malformed = await fetch(api + '/patronLogin', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{"password": SECR3T}',
  })
  assert.equal(malformed.status, 400)
  assert.doesNotMatch(await malformed.text(), /SECR3T|SyntaxError|at JSON.parse/)
  assert.equal(
    (await post('/patronLogin', { username: email, password: 'invalid-security-test-password' }))
      .status,
    401,
  )
  const login = await post('/patronLogin', { username: email, password })
  assert.equal(login.status, 200)
  const customer = await login.json()
  assert.equal(customer.role, 'PATRON')
  const setCookie = login.headers.get('set-cookie')
  assert.match(setCookie, /HttpOnly/i)
  assert.match(setCookie, /SameSite=Lax/i)
  const cookie = setCookie.split(';')[0]
  const headers = { Cookie: cookie }
  const me = await fetch(api + '/me', { headers })
  assert.equal(me.status, 200)
  assert.equal((await me.json()).id, customer.id)
  assert.equal((await fetch(api + '/me', { headers: { Cookie: 'token=invalid' } })).status, 401)
  const own = await fetch(api + '/api/inft3050/Patrons/' + customer.id, { headers })
  assert.equal(own.status, 200)
  const record = await own.json()
  assert.ok(record.HashPW && record.Salt, 'Need actual hash and salt values for the log scan')
  // v1.1 exposes order lines; public reads must fail and patron reads stay within their orders.
  assert.equal((await fetch(api + '/api/inft3050/ProductsInOrders')).status, 401)
  const orders = await fetch(api + '/api/inft3050/Orders?limit=100', { headers })
  const lines = await fetch(api + '/api/inft3050/ProductsInOrders?limit=100', { headers })
  assert.equal(orders.status, 200)
  assert.equal(lines.status, 200)
  const blockedWrite = await fetch(api + '/api/inft3050/ProductsInOrders', {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: '{}',
  })
  assert.equal(
    blockedWrite.status,
    403,
    'Patrons must use transactional checkout, not generic line writes',
  )
  const orderRows = await orders.json()
  const lineRows = await lines.json()
  const orderIds = new Set(orderRows.list.map((row) => String(row.OrderID ?? row.OrderId)))
  assert.ok(lineRows.list.every((row) => orderIds.has(String(row.OrderId))))
  const logout = await fetch(api + '/logout', { method: 'POST', headers })
  assert.equal(logout.status, 200)
  assert.match(logout.headers.get('set-cookie'), /token=;/)
  const output = spawnSync('docker', ['logs', '--since', since, container], { encoding: 'utf8' })
  assert.equal(output.status, 0, 'Unable to read API logs')
  const logs = output.stdout + output.stderr
  for (const secret of ['SECR3T', email, password, cookie.slice(6), record.HashPW, record.Salt]) {
    if (secret) assert.ok(!logs.includes(secret), 'Sensitive account value appeared in API logs')
  }
  assert.doesNotMatch(logs, /PatronLogin Debug|RLS Debug|Password reset token for/)
})
