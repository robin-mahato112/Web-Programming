import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { writeFile } from 'node:fs/promises'

if (process.env.CUSTOMER_ISOLATED_WRITE_TEST !== 'yes')
  throw new Error('Set CUSTOMER_ISOLATED_WRITE_TEST=yes for the isolated original API test.')
const base = 'http://localhost:13003'
const password = 'CourseTest1!' + randomUUID()
const nextPassword = password + 'New1'
const email = `baseline-${randomUUID()}@example.test`
async function call(path, { method = 'GET', body, cookie, status = 200 } = {}) {
  const response = await fetch(base + path, {
    method,
    headers: {
      Origin: 'http://localhost:3003',
      'Content-Type': 'application/json',
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  })
  assert.equal(response.status, status, `${method} ${path}: unexpected HTTP status`)
  return { data: await response.json(), cookie: response.headers.get('set-cookie')?.split(';')[0] }
}
const post = (path, body, options) => call(path, { ...options, method: 'POST', body })
await call('/api/inft3050/Genre')
const patron = await post(
  '/api/inft3050/Patrons',
  { Name: 'Course Test Customer', Email: email, HashPW: password },
  { status: 201 },
)
const actor = await post('/patronLogin', { username: email, password })
const cookie = actor.cookie
assert.ok(cookie)
assert.equal((await call('/me', { cookie })).data.id, patron.data.UserID)
await call(`/api/inft3050/Patrons/${patron.data.UserID}`, {
  cookie,
  method: 'PATCH',
  body: { Name: 'Must remain unchanged' },
  status: 403,
})
const details = await post(
  '/api/inft3050/TO',
  {
    PatronId: patron.data.UserID,
    Email: email,
    PhoneNumber: '0400000000',
    StreetAddress: '1 Test Road',
    Suburb: 'Darwin',
    State: 'NT',
    PostCode: 800,
  },
  { cookie, status: 201 },
)
const contactId = details.data.CustomerID ?? details.data.customerID
assert.ok(contactId)
await call(`/api/inft3050/TO/${contactId}`, {
  cookie,
  method: 'PATCH',
  body: { StreetAddress: '2 Test Road' },
})
assert.equal(
  (await call(`/api/inft3050/TO/${contactId}`, { cookie })).data.StreetAddress,
  '2 Test Road',
)
const order = await post(
  '/api/inft3050/Orders',
  {
    Customer: contactId,
    StreetAddress: '1 Test Road',
    Suburb: 'Darwin',
    State: 'NT',
    PostCode: 800,
  },
  { cookie, status: 201 },
)
const stock = (await call('/api/inft3050/Stocktake', { cookie })).data.list[0]
assert.ok(stock?.ItemId)
await post(
  '/api/inft3050/ProductsInOrders',
  { OrderId: order.data.OrderID, produktId: stock.ItemId, Quantity: 2 },
  { cookie, status: 201 },
)
const orders = (await call('/api/inft3050/Orders', { cookie })).data.list
assert.ok(orders.some((row) => row.OrderID === order.data.OrderID))
assert.ok(orders.every((row) => (row.Customer ?? row.customer) === contactId))
const lines = (await call('/api/inft3050/ProductsInOrders', { cookie })).data.list
assert.ok(lines.some((row) => row.OrderId === order.data.OrderID && row.Quantity === 2))
const secondEmail = `baseline-other-${randomUUID()}@example.test`
await post(
  '/api/inft3050/Patrons',
  { Name: 'Other Course Customer', Email: secondEmail, HashPW: password },
  { status: 201 },
)
const other = await post('/patronLogin', { username: secondEmail, password })
assert.equal((await call('/api/inft3050/Orders', { cookie: other.cookie })).data.list.length, 0)
assert.equal(
  (await call('/api/inft3050/ProductsInOrders', { cookie: other.cookie })).data.list.length,
  0,
)
const unknown = await post('/requestPasswordReset', {
  email: `unknown-${randomUUID()}@example.test`,
})
assert.equal(unknown.data.token, undefined)
const recovery = await post('/requestPasswordReset', { email })
assert.match(recovery.data.token, /^[a-f0-9]{64}$/)
await post('/resetPassword', { token: '0'.repeat(64), password: nextPassword }, { status: 401 })
assert.equal(
  (await post('/resetPassword', { token: recovery.data.token, password: nextPassword })).data.ok,
  true,
)
await post('/resetPassword', { token: recovery.data.token, password }, { status: 401 })
await post('/patronLogin', { username: email, password }, { status: 401 })
const changed = await post('/patronLogin', { username: email, password: nextPassword })
assert.equal((await call('/me', { cookie: changed.cookie })).data.email, email)
await writeFile(
  '.cache/course-baseline.local/browser-fixture.json',
  JSON.stringify({
    email,
    password: nextPassword,
    nextPassword: nextPassword + 'Browser1',
    orderId: order.data.OrderID,
  }),
)
console.log(
  'PASS original teacher API: registration/login, read-only identity permission, delivery save/read, own order/lines, other-account isolation, reset request, invalid/reused code rejection, new-password login and old-password rejection. Only isolated fixture records were written; no checkout or real email was used.',
)
