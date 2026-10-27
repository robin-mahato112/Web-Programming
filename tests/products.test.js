import assert from 'node:assert/strict'
import test from 'node:test'
import { filterProducts, stockLabel } from '../src/lib/products.js'
import { fetchCatalogue } from '../src/services/catalogue.js'
import { catalogue } from './fixtures/catalogue.js'

/**
 * Filtering uses an explicit database-shaped fixture without relying on runtime sample products.
 * Catalogue-loading tests mock HTTP and exercise the real response checks, including failure and retry.
 */
test('search trims whitespace, ignores case and includes categories', () => {
  assert.deepEqual(
    filterProducts(catalogue, { query: '  GaMe  ' }).map((product) => product.id),
    ['2'],
  )
  assert.equal(filterProducts(catalogue, { query: 'Books' }).length, 1)
  assert.equal(filterProducts(catalogue, { query: '   ' }).length, catalogue.length)
})

test('category, stock and inclusive price filters apply together', () => {
  assert.equal(filterProducts(catalogue, { category: 'Movies', inStockOnly: true }).length, 0)
  assert.deepEqual(
    filterProducts(catalogue, { category: 'Books', maxPrice: 54.95 }).map((product) => product.id),
    ['1'],
  )
  assert.equal(filterProducts(catalogue, { category: 'Books', maxPrice: 54.94 }).length, 0)
  assert.equal(filterProducts(catalogue, { maxPrice: 0 }).length, 0)
  assert.equal(filterProducts([{ ...catalogue[0], price: 250 }], { maxPrice: 250 }).length, 1)
})

test('sorting leaves the source catalogue and featured order unchanged', () => {
  const original = structuredClone(catalogue)
  assert.equal(filterProducts(catalogue, { sort: 'price-low' })[0].id, '3')
  assert.equal(filterProducts(catalogue, { sort: 'price-high' })[0].id, '1')
  assert.equal(filterProducts(catalogue, { sort: 'name' })[0].id, '1')
  assert.deepEqual(catalogue, original)
  assert.deepEqual(filterProducts(catalogue), original)
})

test('empty catalogues and unmatched searches return no results', () => {
  assert.deepEqual(filterProducts([]), [])
  assert.deepEqual(filterProducts(catalogue, { query: 'unlisted title' }), [])
  assert.deepEqual(filterProducts(catalogue, { category: 'Unknown' }), [])
  assert.equal(stockLabel(0), 'Out of stock')
  assert.equal(stockLabel(2), 'Only 2 left')
})

test('catalogue load reads the API and accepts a genuinely empty database result', async (context) => {
  context.mock.method(globalThis, 'fetch', async (url) => {
    assert.equal(url, '/api/products')
    return Response.json({ products: catalogue })
  })
  assert.deepEqual(await fetchCatalogue(), catalogue)
  context.mock.method(globalThis, 'fetch', async () => Response.json({ products: [] }))
  assert.deepEqual(await fetchCatalogue(), [])
})

test('catalogue load rejects malformed and duplicate entries without sample fallback', async (context) => {
  for (const body of [
    {},
    { products: 'invalid' },
    { products: [null] },
    { products: [{ ...catalogue[0], offers: [] }] },
    { products: [{ ...catalogue[0], price: NaN }] },
    { products: [catalogue[0], catalogue[0]] },
  ]) {
    context.mock.method(globalThis, 'fetch', async () => Response.json(body))
    await assert.rejects(fetchCatalogue(), /invalid|duplicate/)
  }
})

test('catalogue failure remains visible and a later request can succeed', async (context) => {
  context.mock.method(globalThis, 'fetch', async () =>
    Response.json({ error: 'Database unavailable.' }, { status: 503 }),
  )
  await assert.rejects(fetchCatalogue(), /Database unavailable/)
  context.mock.method(globalThis, 'fetch', async () => Response.json({ products: catalogue }))
  assert.deepEqual(await fetchCatalogue(), catalogue)
})

test('catalogue responses arriving after cancellation are not accepted', async (context) => {
  const controller = new AbortController()
  context.mock.method(globalThis, 'fetch', async () => {
    controller.abort()
    return Response.json({ products: catalogue })
  })
  await assert.rejects(fetchCatalogue(controller.signal), { name: 'AbortError' })
})
