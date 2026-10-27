import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createServer } from 'node:http'
import { readSearch, searchQuery, catalogueQuery, defaultFilters } from '../src/lib/search.js'
import { loadCatalogue } from '../server/catalogue.js'
import { createStoreMiddleware } from '../server/store.js'
import { fetchCatalogue } from '../src/services/catalogue.js'
import { cartAdjustmentNotice } from '../src/lib/cart.js'

test('all submitted search controls round-trip through a details or cart URL', () => {
  const filters = {
    query: 'King & queen',
    category: 'Books',
    maxPrice: 35,
    inStockOnly: true,
    sort: 'price-low',
  }
  const query = searchQuery(filters)
  assert.deepEqual(readSearch(query), filters)
  assert.equal(catalogueQuery(query + '&item=2&return=https://example.com'), query)
  assert.equal(searchQuery(defaultFilters), '')
})

test('untrusted URL controls use safe defaults without discarding valid search', () => {
  for (const price of ['-1', 'Infinity', 'NaN', '', '9007199254740992']) {
    const filters = readSearch('?q=%20king%20&price=' + price + '&sort=bad&stock=yes')
    assert.equal(filters.query, 'king')
    assert.equal(filters.maxPrice, null)
    assert.equal(filters.sort, 'featured')
    assert.equal(filters.inStockOnly, false)
  }
  assert.equal(readSearch('?price=0').maxPrice, 0)
  assert.equal(readSearch('?q=' + 'x'.repeat(201)).query.length, 200)
})

test('database search binds keywords and escapes LIKE syntax without interpolating user text', async () => {
  const parameters = []
  let sql
  const request = {
    input(name, value) {
      parameters.push([name, value])
      return this
    },
    async query(text) {
      sql = text
      return { recordset: [] }
    },
  }
  await loadCatalogue({ getPool: async () => ({ request: () => request }) }, "King O'Brien%_[]~")
  assert.deepEqual(parameters, [
    ['keyword0', '%King%'],
    ['keyword1', "%O'Brien~%~_~[]~~%"],
  ])
  assert.match(sql, /p\.Name LIKE @keyword0 ESCAPE '~'/)
  assert.match(sql, /p\.Description LIKE @keyword1/)
  assert.match(sql, /p\.Author LIKE @keyword1/)
  assert.match(sql, /\) AND \(/)
  assert.ok(!sql.includes("O'Brien"))
})

test('search API validates keywords and cart validation never uses the search subset', async () => {
  const queries = []
  const middleware = createStoreMiddleware(async (query) => {
    queries.push(query)
    return []
  })
  const server = createServer((req, res) => middleware(req, res, () => res.end()))
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const url = `http://127.0.0.1:${server.address().port}`
  try {
    const response = await fetch(url + '/api/products?q=%20king%20')
    assert.equal(response.status, 200)
    assert.deepEqual(await response.json(), { products: [] })
    assert.equal(queries.at(-1), 'king')
    for (const query of ['q=a&q=b', 'q=' + 'x'.repeat(201)])
      assert.equal((await fetch(url + '/api/products?' + query)).status, 400)
    const cart = await fetch(url + '/api/cart?q=king', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items: [] }),
    })
    assert.equal(cart.status, 200)
    assert.equal(queries.at(-1), '')
  } finally {
    await new Promise((resolve) => {
      server.close(resolve)
      server.closeAllConnections()
    })
  }
})

test('search client sends encoded keywords to the backend rather than filtering locally', async (context) => {
  context.mock.method(globalThis, 'fetch', async (url) => {
    assert.equal(url, '/api/products?q=King+%26+queen')
    return Response.json({ products: [] })
  })
  assert.deepEqual(await fetchCatalogue(undefined, 'King & queen'), [])
})

test('stock recovery explains each removed listing and reduced quantity', () => {
  const before = [
    { itemId: '2', quantity: 20 },
    { itemId: '3', quantity: 1 },
  ]
  const after = [{ itemId: '2', quantity: 15 }]
  const notice = cartAdjustmentNotice(before, after)
  assert.match(notice, /Listing 2 was reduced from 20 to 15/)
  assert.match(notice, /Listing 3 was removed/)
  assert.doesNotMatch(notice, /discontinued|Back soon/)
  assert.equal(cartAdjustmentNotice(after, after), '')
})
