import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'

// This creates and removes its own fixtures only on the isolated installation.
const base = process.env.COURSE_API_URL
if (base !== 'http://localhost:13002' || process.env.COURSE_MANAGEMENT_WRITES !== '1')
  throw new Error('Set isolated API 13002 and COURSE_MANAGEMENT_WRITES=1.')
if (!process.env.TEST_ADMIN_USERNAME || !process.env.TEST_ADMIN_PASSWORD)
  throw new Error('Supply private admin credentials.')
const login = await fetch(base + '/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    username: process.env.TEST_ADMIN_USERNAME,
    password: process.env.TEST_ADMIN_PASSWORD,
  }),
})
assert.equal(login.status, 200, 'Admin login')
const cookie = login.headers.get('set-cookie')?.split(';')[0]
const request = async (path, body, method = 'POST') => {
  const response = await fetch(base + path, {
    method,
    headers: {
      Cookie: cookie,
      Origin: 'http://localhost:3002',
      'Content-Type': 'application/json',
      'X-Management-Request': '1',
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  return { status: response.status, body: await response.json() }
}
let productId, userId
try {
  const fixture = 'Integration ' + randomBytes(5).toString('hex')
  const created = await request('/api/admin/products', {
    title: fixture,
    author: 'Integration fixture',
    description: 'Temporary isolated verification',
    genreId: 1,
    subGenreId: 1,
    published: '2024-02-29',
    listings: [{ sourceId: 1, price: 7.25, quantity: 3 }],
  })
  assert.equal(created.status, 200, created.body.error)
  productId = created.body.productId
  const stock = await request(
    '/api/inft3050/Stocktake?where=' + encodeURIComponent(`(ProductId,eq,${productId})`),
    undefined,
    'GET',
  )
  const itemId = stock.body.list[0].ItemId
  const edit = {
    listings: [{ itemId, price: 8, quantity: 2, expected: { price: 7.25, quantity: 3 } }],
  }
  assert.equal((await request('/api/admin/products/' + productId, edit, 'PATCH')).status, 200)
  assert.equal((await request('/api/admin/products/' + productId, edit, 'PATCH')).status, 409)
  const changed = await request('/api/inft3050/Stocktake/' + itemId, undefined, 'GET')
  assert.equal(changed.body.Quantity, 2)
  assert.equal(changed.body.Price, 8)
  assert.equal(
    (await request('/api/inft3050/Stocktake/' + itemId, { Quantity: 9 }, 'PATCH')).status,
    403,
  )
  const employeePassword = randomBytes(16).toString('hex') + 'A1'
  const user = await request('/api/inft3050/User', {
    UserName: fixture.replace(' ', '_'),
    Name: fixture,
    Email: 'fixture@example.test',
    IsAdmin: false,
    HashPW: employeePassword,
  })
  assert.equal(user.status, 201, user.body.error)
  userId = user.body.UserID
  const staffLogin = await fetch(base + '/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: fixture.replace(' ', '_'), password: employeePassword }),
  })
  assert.equal(staffLogin.status, 200)
  assert.equal((await staffLogin.json()).role, 'STAFF')
  const staffCookie = staffLogin.headers.get('set-cookie').split(';')[0]
  assert.equal(
    (await fetch(base + '/api/inft3050/Product?limit=1', { headers: { Cookie: staffCookie } }))
      .status,
    200,
  )
  assert.equal(
    (await fetch(base + '/api/admin/stock', { headers: { Cookie: staffCookie } })).status,
    403,
  )
  assert.equal(
    (
      await fetch(base + '/api/checkout/prepare', {
        method: 'POST',
        headers: {
          Cookie: staffCookie,
          Origin: 'http://localhost:3002',
          'Content-Type': 'application/json',
          'X-Checkout-Request': '1',
        },
        body: '{}',
      })
    ).status,
    403,
  )
  assert.equal(
    (
      await request(
        '/api/admin/users/' + userId,
        { name: 'Isolated employee', role: 'employee' },
        'PATCH',
      )
    ).status,
    200,
  )
  console.log(
    'Isolated product create/edit, stale-save rejection, CRUD bypass protection and employee create/edit passed.',
  )
} finally {
  if (productId)
    assert.equal(
      (await request('/api/admin/products/' + productId, {}, 'DELETE')).status,
      200,
      'Remove fixture product',
    )
  if (userId)
    assert.equal(
      (await request('/api/admin/users/' + userId, {}, 'DELETE')).status,
      200,
      'Remove fixture employee',
    )
  console.log('Created fixtures removed. No orders placed or existing stock edited.')
}
