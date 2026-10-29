import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import { setTimeout } from 'node:timers/promises'

// AI-assisted: explicit opt-in; synthetic records in the isolated AccountVerification stack only.
if (process.env.CUSTOMER_ISOLATED_WRITE_TEST !== 'yes')
  throw new Error('Set CUSTOMER_ISOLATED_WRITE_TEST=yes for the isolated fixture stack.')
const base = 'http://localhost:13002'
const inbox = 'http://localhost:18025'
const config = JSON.parse(await readFile('.cache/account-verification.local/test-config.json'))
const password = config.password
const nextPassword = password + 'New1'
const suffix = randomUUID()
const email = `account-${suffix}@example.test`
const secondEmail = `other-${suffix}@example.test`
const changedEmail = `changed-${suffix}@example.test`
const origin = 'http://localhost:3002'
// Compose may report "Started" before Node has connected to SQL and opened its HTTP port.
let ready = false
for (let attempt = 0; attempt < 20; attempt++) {
  try {
    ready = (await fetch(base + '/api/products', { signal: AbortSignal.timeout(2000) })).ok
  } catch {
    /* Startup is allowed to retry; no write has been sent yet. */
  }
  if (ready) break
  await setTimeout(1000)
}
assert.ok(ready, 'The isolated API and SQL fixture must be ready before write tests.')
async function call(path, { method = 'GET', body, cookie, status = 200, headers = {} } = {}) {
  const response = await fetch(base + path, {
    method,
    headers: {
      Origin: origin,
      'Content-Type': 'application/json',
      'X-Customer-Request': '1',
      'X-Checkout-Request': '1',
      ...(cookie ? { Cookie: cookie } : {}),
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const data = await response.json()
  assert.equal(response.status, status, `${method} ${path}: ${JSON.stringify(data)}`)
  return { data, cookie: response.headers.get('set-cookie')?.split(';')[0] }
}
const post = (path, body, options = {}) => call(path, { method: 'POST', body, ...options })
const login = (username, secret = password, status = 200) =>
  post('/patronLogin', { username, password: secret }, { status })
for (const address of [email, secondEmail])
  await post(
    '/api/inft3050/Patrons',
    { Name: 'Integration Customer', Email: address, HashPW: password },
    { status: 201 },
  )
let actor = await login(email)
const other = await login(secondEmail)
const oldCookie = actor.cookie
const profile = { name: 'Updated Customer', email: changedEmail, currentPassword: password }
await call('/api/customer/profile', { method: 'PATCH', body: profile, status: 401 })
await call('/api/customer/profile', {
  method: 'PATCH',
  cookie: actor.cookie,
  body: { ...profile, currentPassword: 'Wrong123' },
  status: 403,
})
await call('/api/customer/profile', {
  method: 'PATCH',
  cookie: actor.cookie,
  body: { ...profile, email: secondEmail },
  status: 409,
})
await call('/api/customer/profile', {
  method: 'PATCH',
  cookie: actor.cookie,
  body: { ...profile, UserID: other.data.id },
  status: 400,
})
actor = await call('/api/customer/profile', {
  method: 'PATCH',
  cookie: actor.cookie,
  body: profile,
})
assert.equal(actor.data.email, changedEmail)
assert.equal((await call('/me', { cookie: actor.cookie })).data.email, changedEmail)
const expiredSession = await call('/me', { cookie: oldCookie, status: 401 })
assert.equal(expiredSession.cookie, 'token=')
await call('/api/products', { cookie: expiredSession.cookie })
await login(email, password, 401)
actor = await login(changedEmail)
assert.equal((await call('/me', { cookie: other.cookie })).data.email, secondEmail)
console.log(
  'PASS SQL profile: own record only, password check, duplicate email, unknown fields, new login and old-session invalidation.',
)

// Complete the existing team's simulated checkout after the account email changes.
const customer = {
  name: profile.name,
  email: changedEmail,
  phone: '0400000000',
  street: '1 Test Street',
  suburb: 'Newcastle',
  state: 'NSW',
  postcode: '2300',
}
const prepared = (
  await post(
    '/api/checkout/prepare',
    { customer, items: [{ itemId: '1', quantity: 1 }] },
    { cookie: actor.cookie },
  )
).data
const payment = (
  await post(
    '/api/checkout/payment-method',
    {
      token: prepared.token,
      card: { holder: profile.name, number: '4242424242424242', expiry: '12/39', cvc: '123' },
    },
    { cookie: actor.cookie },
  )
).data
const receipt = (
  await post(
    '/api/checkout/confirm',
    {
      token: prepared.token,
      paymentToken: payment.paymentToken,
      customer,
      items: prepared.reviewedItems,
    },
    { cookie: actor.cookie },
  )
).data
assert.equal(receipt.status, 'approved')
const orders = (await call('/api/inft3050/Orders', { cookie: actor.cookie })).data.list
assert.ok(orders.some((order) => String(order.OrderID) === String(receipt.orderId)))
assert.equal((await call('/api/inft3050/Orders', { cookie: other.cookie })).data.list.length, 0)
const lines = (await call('/api/inft3050/ProductsInOrders', { cookie: actor.cookie })).data.list
assert.ok(lines.some((line) => String(line.OrderID ?? line.OrderId) === String(receipt.orderId)))
assert.equal(
  (await call('/api/inft3050/ProductsInOrders', { cookie: other.cookie })).data.list.length,
  0,
)
await call('/api/inft3050/Orders/' + receipt.orderId, { cookie: other.cookie, status: 404 })
console.log(
  'PASS actual SQL checkout and order history: changed identity works, order/lines persisted, another customer cannot read them.',
)

assert.deepEqual((await call('/api/customer/recovery')).data, { enabled: true, delivery: 'local' })
const known = await post('/requestPasswordReset', { email: changedEmail })
const unknown = await post('/requestPasswordReset', { email: `missing-${suffix}@example.test` })
assert.deepEqual(known.data, unknown.data)
assert.ok(!JSON.stringify(known.data).match(/[a-f0-9]{64}/))
const message = await (await fetch(inbox + '/api/v1/message/latest')).json()
assert.equal(message.To[0].Address, changedEmail)
const code = message.Text.match(/\b[a-f0-9]{64}\b/)[0]
await post('/resetPassword', { token: code, password: 'weak' }, { status: 400 })
await post('/resetPassword', { token: code, password: nextPassword })
await post('/resetPassword', { token: code, password: nextPassword }, { status: 400 })
await call('/me', { cookie: actor.cookie, status: 401 })
await post(
  '/api/checkout/prepare',
  { customer, items: [{ itemId: '1', quantity: 1 }] },
  { cookie: actor.cookie, status: 401 },
)
await login(changedEmail, password, 401)
actor = await login(changedEmail, nextPassword)
assert.equal(
  (await call('/api/inft3050/Orders', { cookie: actor.cookie })).data.list.length,
  orders.length,
)
console.log(
  'PASS real SMTP capture and password reset: no response code, weak-password rejection, single use, old password/session rejected, history retained.',
)

for (const [username, role, stockStatus] of [
  ['teststaff', 'STAFF', 403],
  ['testadmin', 'ADMIN', 200],
]) {
  const staff = await post('/login', { username, password })
  assert.equal((await call('/me', { cookie: staff.cookie })).data.role, role)
  await call('/api/products', { cookie: staff.cookie })
  await call('/api/admin/stock', { cookie: staff.cookie, status: stockStatus })
  await call('/api/customer/profile', {
    cookie: staff.cookie,
    method: 'PATCH',
    body: profile,
    status: 403,
  })
}
const preflight = await fetch(base + '/api/customer/profile', {
  method: 'OPTIONS',
  headers: {
    Origin: origin,
    'Access-Control-Request-Method': 'PATCH',
    'Access-Control-Request-Headers': 'content-type,x-customer-request',
  },
})
assert.equal(preflight.status, 204)
assert.match(preflight.headers.get('access-control-allow-headers'), /x-customer-request/i)
console.log(
  'PASS staff/admin sessions, stock permissions, public catalogue and browser CORS remain compatible.',
)
// Private synthetic fixture for optional live browser verification; ignored by Git.
await writeFile(
  '.cache/account-verification.local/browser-fixture.json',
  JSON.stringify({ email: changedEmail, password: nextPassword, orderId: receipt.orderId }),
)
