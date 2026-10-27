import assert from 'node:assert/strict'
import { once } from 'node:events'
import { test } from 'node:test'
import express from 'express'
import { mountCourseStock } from '../server/course-stock.js'

async function setup(t) {
  const calls = []
  let quantity = 5
  const database = {
    getPool: async () => ({
      request: () => {
        const params = {}
        return {
          input(k, v) {
            params[k] = v
            return this
          },
          async query(sql) {
            calls.push({ sql, params })
            if (sql.includes('dbo.[User]'))
              return { recordset: params.id === 1 ? [{ UserID: 1 }] : [] }
            if (sql.startsWith('UPDATE')) {
              if (params.id !== 2 || params.expected !== quantity) return { recordset: [] }
              quantity = params.quantity
              return { recordset: [{ itemId: 2, quantity }] }
            }
            return { recordset: [] }
          },
        }
      },
    }),
  }
  const app = express()
  app.use(express.json())
  mountCourseStock(app, {
    database,
    origins: ['http://localhost:3000'],
    requireAuth: (req, res, next) => {
      if (!req.get('X-Test-Role')) return res.sendStatus(401)
      req.user = { role: req.get('X-Test-Role'), sub: req.get('X-Test-Id') || '1' }
      next()
    },
  })
  const server = app.listen(0, '127.0.0.1')
  await once(server, 'listening')
  t.after(() => {
    server.closeAllConnections()
    server.close()
  })
  const base = `http://127.0.0.1:${server.address().port}`
  const headers = {
    'X-Test-Role': 'ADMIN',
    Origin: 'http://localhost:3000',
    'X-Stock-Request': '1',
    'Content-Type': 'application/json',
  }
  const edit = (body, extra = {}, id = '2') =>
    fetch(base + '/api/admin/stock/' + id, {
      method: 'PATCH',
      headers: { ...headers, ...extra },
      body: JSON.stringify(body),
    })
  return { base, headers, edit, calls }
}

test('stock writes enforce verified admin role, origin, JSON and quantity validation', async (t) => {
  const { base, edit, calls } = await setup(t)
  assert.equal((await fetch(base + '/api/admin/stock')).status, 401)
  const body = { quantity: 6, expectedQuantity: 5 }
  for (const role of ['PATRON', 'STAFF', 'ANON'])
    assert.equal((await edit(body, { 'X-Test-Role': role })).status, 403)
  assert.equal((await edit(body, { 'X-Test-Id': '99' })).status, 403)
  assert.equal((await edit(body, { Origin: 'https://untrusted.test' })).status, 403)
  assert.equal((await edit(body, { 'X-Stock-Request': '' })).status, 403)
  assert.equal((await edit(body, { 'Content-Type': 'text/plain' })).status, 415)
  for (const value of [-1, 1.5, '6', null, 2147483648])
    assert.equal((await edit({ ...body, quantity: value })).status, 400)
  assert.equal((await edit({ ...body, expectedQuantity: -1 })).status, 400)
  assert.equal((await edit({ ...body, price: 0 })).status, 400)
  assert.equal((await edit(body, {}, '2;DROP')).status, 400)
  assert.ok(!calls.some((call) => call.sql.startsWith('UPDATE')))
})

test('stock changes bind listing IDs, accept zero and reject stale or duplicate saves', async (t) => {
  const { edit, calls } = await setup(t)
  assert.equal((await edit({ quantity: 6, expectedQuantity: 5 })).status, 200)
  assert.equal((await edit({ quantity: 6, expectedQuantity: 5 })).status, 409)
  assert.equal((await edit({ quantity: 0, expectedQuantity: 6 })).status, 200)
  assert.equal((await edit({ quantity: 1, expectedQuantity: 0 }, {}, '999')).status, 409)
  const updates = calls.filter((call) => call.sql.startsWith('UPDATE'))
  assert.deepEqual(updates[0].params, { id: 2, quantity: 6, expected: 5 })
  assert.ok(
    updates.every(
      ({ sql }) =>
        sql.includes('WHERE ItemId=@id AND Quantity=@expected') && !/DELETE|Price=|EGRv/.test(sql),
    ),
  )
})

test('course search queries SQL using bound keywords and rejects oversized or repeated queries', async (t) => {
  const { base, calls } = await setup(t)
  const response = await fetch(
    base + '/api/products?' + new URLSearchParams({ q: "King O'Brien%" }),
  )
  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), { products: [] })
  assert.equal(calls[0].params.keyword1, "%O'Brien~%%")
  assert.ok(!calls[0].sql.includes("O'Brien"))
  for (const query of ['q=a&q=b', 'q=' + 'x'.repeat(201), 'q=%00'])
    assert.equal((await fetch(base + '/api/products?' + query)).status, 400)
})

test('competing stock edits cannot both replace the same displayed quantity', async (t) => {
  const { edit } = await setup(t)
  const responses = await Promise.all([
    edit({ quantity: 6, expectedQuantity: 5 }),
    edit({ quantity: 4, expectedQuantity: 5 }),
  ])
  assert.deepEqual(responses.map((response) => response.status).sort(), [200, 409])
})
