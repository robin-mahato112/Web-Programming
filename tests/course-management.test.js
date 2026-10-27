import assert from 'node:assert/strict'
import { test } from 'node:test'
import { once } from 'node:events'
import express from 'express'
import {
  listingValues,
  newProductValues,
  mountCourseManagement,
} from '../server/course-management.js'

test('management validates amounts, dates and unique source listings', () => {
  for (const quantity of [-1, 1.2, '2', 2147483648])
    assert.throws(() => listingValues({ price: 2, quantity }))
  for (const price of [-1, Infinity, '2', 1.234])
    assert.throws(() => listingValues({ price, quantity: 2 }))
  assert.deepEqual(listingValues({ price: 0, quantity: 0 }), { price: 0, quantity: 0 })
  const product = {
    title: 'Book',
    author: 'Author',
    genreId: 1,
    subGenreId: 1,
    published: '2024-02-29',
    listings: [{ sourceId: 1, price: 3, quantity: 2 }],
  }
  assert.equal(newProductValues(product).published, '2024-02-29')
  assert.throws(() => newProductValues({ ...product, published: '2023-02-29' }))
  assert.throws(() =>
    newProductValues({ ...product, listings: [...product.listings, ...product.listings] }),
  )
})

// The transaction fixture intentionally fails a later row to verify that no partial edit commits.
async function setup(t) {
  const state = {
    rows: [{ ItemId: 2, quantity: 5, price: 10 }],
    commits: 0,
    rollbacks: 0,
    ordered: false,
  }
  const database = {
    getPool: async () => ({
      transaction() {
        let draft
        return {
          async begin() {
            draft = structuredClone(state.rows)
          },
          async commit() {
            state.rows = draft
            state.commits++
          },
          async rollback() {
            state.rollbacks++
          },
          request() {
            const values = {}
            return {
              input(key, value) {
                values[key] = value
                return this
              },
              async query(sql) {
                if (sql.includes('SELECT UserID,UserName'))
                  return {
                    recordset: [
                      { UserID: 1, UserName: 'admin', isAdmin: true },
                      { UserID: 2, UserName: 'employee', isAdmin: false },
                    ],
                  }
                if (sql.includes('UPDATE dbo.Stocktake')) {
                  const row = draft.find(
                    (row) =>
                      row.ItemId === values.id &&
                      row.quantity === values.oldQuantity &&
                      row.price === values.oldPrice,
                  )
                  if (!row) return { recordset: [] }
                  row.quantity = values.quantity
                  row.price = values.price
                  return { recordset: [{ ItemId: row.ItemId }] }
                }
                if (sql.includes('SELECT ID FROM dbo.Product')) return { recordset: [{ ID: 1 }] }
                if (sql.includes('SELECT ItemId FROM dbo.Stocktake')) return { recordset: draft }
                if (sql.includes('SELECT TOP 1 OrderId'))
                  return { recordset: state.ordered ? [{ OrderId: 10 }] : [] }
                return { recordset: [] }
              },
            }
          },
        }
      },
    }),
  }
  const app = express()
  app.use(express.json())
  mountCourseManagement(app, {
    database,
    origins: ['http://localhost:3000'],
    requireAuth(req, res, next) {
      if (!req.get('Test-Role')) return res.sendStatus(401)
      req.user = { role: req.get('Test-Role'), sub: req.get('Test-Id') || '1' }
      next()
    },
  })
  const server = app.listen(0, '127.0.0.1')
  await once(server, 'listening')
  t.after(() => {
    server.closeAllConnections()
    server.close()
  })
  const request = (path, body = {}, extra = {}, method = 'PATCH') =>
    fetch(`http://127.0.0.1:${server.address().port}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        Origin: 'http://localhost:3000',
        'X-Management-Request': '1',
        'Test-Role': 'ADMIN',
        ...extra,
      },
      body: JSON.stringify(body),
    })
  return { state, request }
}

test('management rejects customer, employee, stale admin and cross-origin writes', async (t) => {
  const { request, state } = await setup(t)
  for (const role of ['PATRON', 'STAFF'])
    assert.equal((await request('/api/admin/products/1', {}, { 'Test-Role': role })).status, 403)
  assert.equal((await request('/api/admin/products/1', {}, { 'Test-Id': '2' })).status, 403)
  assert.equal(
    (await request('/api/admin/products/1', {}, { Origin: 'https://other.test' })).status,
    403,
  )
  assert.equal((await request('/api/inft3050/Stocktake/2', { Quantity: 100 })).status, 403)
  assert.equal(state.commits, 0)
})

test('product changes commit together and roll back on stale listings', async (t) => {
  const { request, state } = await setup(t)
  const item = { itemId: 2, quantity: 4, price: 12, expected: { quantity: 5, price: 10 } }
  assert.equal(
    (await request('/api/admin/products/1', { listings: [item, { ...item, itemId: 999 }] })).status,
    409,
  )
  assert.equal(state.rows[0].quantity, 5)
  assert.equal(state.commits, 0)
  assert.equal((await request('/api/admin/products/1', { listings: [item] })).status, 200)
  assert.equal(state.rows[0].quantity, 4)
  assert.equal((await request('/api/admin/products/1', { listings: [item] })).status, 409)
  assert.equal(state.commits, 1)
})

test('ordered products and self-demotion cannot destroy checkout or administrator access', async (t) => {
  const { request, state } = await setup(t)
  state.ordered = true
  assert.equal((await request('/api/admin/products/1', {}, {}, 'DELETE')).status, 409)
  assert.equal(
    (await request('/api/admin/users/1', { name: 'Admin', role: 'employee' })).status,
    409,
  )
  assert.equal((await request('/api/admin/users/1', {}, {}, 'DELETE')).status, 409)
  assert.equal(state.commits, 0)
})
