/** Exercise database mapping and HTTP boundaries with synthetic rows and an injected reader. */
import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { createServer } from 'node:http'
import { Buffer } from 'node:buffer'
import {
  loadCatalogue,
  mapCatalogueRows,
  quoteCart,
  validateCartItems,
} from '../server/catalogue.js'
import { createStoreMiddleware } from '../server/store.js'
import { catalogue } from './fixtures/catalogue.js'

const row = (overrides) => ({
  productId: 1,
  title: ' Test book ',
  category: 'Books',
  description: ' A book. ',
  itemId: 101,
  sourceId: 1,
  sourceName: ' Store A ',
  price: 54.95,
  stock: 12,
  ...overrides,
})

test('catalogue groups source offers and selects cheapest available price with stable ties', () => {
  const rows = [row({ itemId: 105, price: 10, stock: 0 }), row({ itemId: 104, sourceId: 2 }), row()]
  const original = structuredClone(rows)
  const [product] = mapCatalogueRows(rows)
  assert.equal(product.id, '1')
  assert.equal(product.title, 'Test book')
  assert.equal(product.price, 54.95)
  assert.equal(product.stock, 12)
  assert.equal(product.offers[0].itemId, '101')
  assert.equal(product.offers.length, 3)
  assert.deepEqual(rows, original)
  const [soldOut] = mapCatalogueRows(rows.map((item) => ({ ...item, stock: 0 })))
  assert.equal(soldOut.price, 10)
  assert.equal(soldOut.stock, 0)
})

test('catalogue accepts canonical identity strings returned by the ODBC driver', () => {
  const [product] = mapCatalogueRows([
    row({ productId: '1', itemId: '1', sourceId: '1', stock: 29, price: 47.35 }),
  ])
  assert.equal(product.id, '1')
  assert.equal(product.offers[0].itemId, '1')
  assert.equal(product.offers[0].sourceId, '1')
  assert.equal(product.stock, 29)
  assert.equal(product.price, 47.35)
})

test('invalid prices or references cannot become purchasable offers', () => {
  for (const price of [null, '54.95', NaN, Infinity, -1, 1.001, 90071992547409.91]) {
    assert.deepEqual(mapCatalogueRows([row({ price })]), [])
  }
  for (const field of ['productId', 'itemId', 'sourceId']) {
    for (const value of [null, '01', ' 1', '1.0', '1e0', '2147483648', 0, -1, 1.5, 2147483648]) {
      assert.deepEqual(mapCatalogueRows([row({ [field]: value })]), [])
    }
  }
  assert.equal(mapCatalogueRows([row(), row()])[0].offers.length, 1)
})

test('SQL floating point noise is normalized while invalid quantities stay unavailable', () => {
  assert.equal(mapCatalogueRows([row({ price: 0.1 + 0.2 })])[0].price, 0.3)
  for (const stock of [null, '2', -1, 0.5, NaN, Infinity, 2147483648]) {
    assert.equal(mapCatalogueRows([row({ stock })])[0].stock, 0)
  }
  const [product] = mapCatalogueRows([
    row({ title: null, category: null, description: null, sourceName: null }),
  ])
  assert.ok(
    product.title &&
      product.category &&
      product.description &&
      product.accent &&
      product.offers[0].sourceName,
  )
})

test('repository executes only the joined catalogue read', async () => {
  const queries = []
  const database = {
    getPool: async () => ({
      request: () => ({
        query: async (query) => {
          queries.push(query)
          return { recordset: [row()] }
        },
      }),
    }),
  }
  assert.equal((await loadCatalogue(database))[0].offers[0].itemId, '101')
  assert.equal(queries.length, 1)
  assert.match(queries[0], /JOIN dbo\.Stocktake AS st ON st\.ProductId = p\.ID/)
  assert.match(queries[0], /JOIN dbo\.Source AS s ON s\.sourceid = st\.SourceId/)
  assert.doesNotMatch(queries[0], /\b(INSERT|UPDATE|DELETE|ALTER|DROP)\b/i)
})

test('featured order is deterministic without sorting long descriptions in SQL Server', async () => {
  const database = {
    getPool: async () => ({
      request: () => ({
        query: async (sql) => {
          assert.doesNotMatch(sql, /ORDER BY/i)
          return {
            recordset: [row({ productId: 12, itemId: 112 }), row({ productId: 2, itemId: 102 })],
          }
        },
      }),
    }),
  }
  assert.deepEqual(
    (await loadCatalogue(database)).map((product) => product.id),
    ['2', '12'],
  )
})

test('cart quote uses the chosen source price and quantity, including empty carts', () => {
  const result = quoteCart([{ itemId: '104', quantity: 2 }], catalogue)
  assert.equal(result.subtotal, 119.9)
  assert.equal(result.items[0].productId, '1')
  assert.equal(result.items[0].product.price, 59.95)
  assert.equal(result.items[0].product.stock, 4)
  assert.equal(result.items[0].product.sourceName, 'Store B')
  assert.deepEqual(quoteCart([], catalogue), { items: [], subtotal: 0 })
  assert.equal(
    quoteCart(
      [
        { itemId: '101', quantity: 1 },
        { itemId: '104', quantity: 1 },
      ],
      catalogue,
    ).subtotal,
    114.9,
  )
})

test('cart validation requires a catalogue, canonical SQL IDs and valid stock quantities', () => {
  assert.ok(validateCartItems([]).items)
  assert.deepEqual(validateCartItems([], catalogue), {})
  for (const itemId of [
    101,
    '0101',
    ' 101',
    '+101',
    '1e2',
    '0',
    '-1',
    '2147483648',
    '101; DROP TABLE Product',
  ]) {
    assert.ok(validateCartItems([{ itemId, quantity: 1 }], catalogue).items)
  }
  for (const quantity of [0, -1, 0.5, '1', null, NaN, Infinity, 13, Number.MAX_SAFE_INTEGER + 1]) {
    assert.ok(validateCartItems([{ itemId: '101', quantity }], catalogue).items)
  }
  assert.deepEqual(validateCartItems([{ itemId: '101', quantity: 12 }], catalogue), {})
})

let server,
  url,
  snapshot,
  unavailable = false
before(async () => {
  snapshot = structuredClone(catalogue)
  const middleware = createStoreMiddleware(async () => {
    if (unavailable) throw new Error('Private SQL connection details must not escape')
    return snapshot
  })
  server = createServer((req, res) =>
    middleware(req, res, () => {
      res.writeHead(404)
      res.end()
    }),
  )
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  url = `http://127.0.0.1:${server.address().port}`
})
after(
  () =>
    new Promise((resolve) => {
      server.close(resolve)
      server.closeAllConnections()
    }),
)
const post = (path, payload) =>
  fetch(url + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })

test('products route exposes the catalogue and cart accepts selected offers and empty lists', async () => {
  const response = await fetch(url + '/api/products')
  assert.equal(response.status, 200)
  assert.equal(response.headers.get('content-type'), 'application/json')
  assert.equal(response.headers.get('cache-control'), 'no-store')
  assert.deepEqual(await response.json(), { products: catalogue })
  const cart = await post('/api/cart', {
    items: [{ itemId: '104', quantity: 1, price: 0 }],
    subtotal: 0,
  })
  assert.equal(cart.status, 200)
  assert.equal((await cart.json()).subtotal, 59.95)
  assert.deepEqual(await (await post('/api/cart', { items: [] })).json(), {
    items: [],
    subtotal: 0,
  })
})

test('cart rejects invalid types, SQL IDs, duplicate offers and unavailable quantities', async () => {
  for (const items of [
    null,
    [null],
    [{ itemId: 101, quantity: 1 }],
    [{ itemId: '0101', quantity: 1 }],
    [{ itemId: '999', quantity: 1 }],
    [{ itemId: '103', quantity: 1 }],
    [{ itemId: '104', quantity: 5 }],
    [{ itemId: '101', quantity: '1' }],
    [{ itemId: '101', quantity: 0.5 }],
    [
      { itemId: '101', quantity: 1 },
      { itemId: '101', quantity: 1 },
    ],
  ]) {
    const response = await post('/api/cart', { items })
    assert.equal(response.status, 400)
    assert.ok((await response.json()).errors.items)
  }
})

test('cart reads current stock and prices again and hides database failures', async () => {
  snapshot[0].offers[0].stock = 0
  assert.equal((await post('/api/cart', { items: [{ itemId: '101', quantity: 1 }] })).status, 400)
  snapshot = structuredClone(catalogue)
  snapshot[0].offers[0].price = 55.95
  const repriced = await (
    await post('/api/cart', { items: [{ itemId: '101', quantity: 1 }] })
  ).json()
  assert.equal(repriced.subtotal, 55.95)
  snapshot = structuredClone(catalogue)
  unavailable = true
  try {
    for (const path of ['/api/products', '/api/cart']) {
      const response =
        path === '/api/products' ? await fetch(url + path) : await post(path, { items: [] })
      assert.equal(response.status, 503)
      assert.deepEqual(await response.json(), {
        error: 'The product service is unavailable. Please try again.',
      })
    }
  } finally {
    unavailable = false
  }
})

test('oversized monetary totals are validation errors rather than database failures', async () => {
  snapshot[0].offers[0].price = 90071992547409.9
  try {
    const response = await post('/api/cart', { items: [{ itemId: '101', quantity: 2 }] })
    assert.equal(response.status, 400)
    assert.match((await response.json()).errors.items, /total/)
  } finally {
    snapshot = structuredClone(catalogue)
  }
})

test('store routes enforce methods, content type, JSON validity and request limits', async () => {
  assert.equal((await post('/api/products', {})).status, 405)
  const method = await fetch(url + '/api/cart')
  assert.equal(method.status, 405)
  assert.equal(method.headers.get('allow'), 'POST')
  assert.equal((await fetch(url + '/api/cart', { method: 'POST', body: '{}' })).status, 415)
  assert.equal(
    (
      await fetch(url + '/api/cart', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{',
      })
    ).status,
    400,
  )
  assert.equal((await post('/api/cart', { items: [], extra: 'x'.repeat(16384) })).status, 413)
  assert.equal((await fetch(url + '/api/missing')).status, 404)
})

test('cart body limits count UTF-8 bytes and include the exact 16 KiB boundary', async () => {
  const payload = { items: [], extra: '' }
  payload.extra = 'x'.repeat(16384 - Buffer.byteLength(JSON.stringify(payload)))
  assert.equal((await post('/api/cart', payload)).status, 200)
  payload.extra += 'x'
  assert.equal((await post('/api/cart', payload)).status, 413)
  payload.extra = '\u{1F3B2}'.repeat(5000)
  assert.ok(JSON.stringify(payload).length < 16384)
  assert.equal((await post('/api/cart', payload)).status, 413)
})

test('cart supports JSON charset parameters and rejects malformed payload shapes', async () => {
  const response = await fetch(url + '/api/cart?source=test', {
    method: 'POST',
    headers: { 'Content-Type': 'Application/JSON; charset=utf-8' },
    body: JSON.stringify({ items: [] }),
  })
  assert.equal(response.status, 200)
  for (const payload of [null, [], {}, 'cart', 12]) {
    assert.equal((await post('/api/cart', payload)).status, 400)
  }
})

test('removed and unknown API routes return JSON 404 instead of a page or confirmation', async () => {
  for (const path of ['/api', '/api/checkout', '/api/missing']) {
    for (const response of [await fetch(url + path), await post(path, { items: [] })]) {
      assert.equal(response.status, 404)
      assert.equal(response.headers.get('content-type'), 'application/json')
      assert.deepEqual(await response.json(), { error: 'API endpoint not found.' })
    }
  }
  const page = await fetch(url + '/products')
  assert.equal(page.headers.get('content-type'), null)
})
