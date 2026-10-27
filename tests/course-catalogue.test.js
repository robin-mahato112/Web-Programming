import assert from 'node:assert/strict'
import { test } from 'node:test'
import { once } from 'node:events'
import { loadCourseCatalogue, readCourseTable } from '../server/course-catalogue.js'
import { createApp } from '../server/app.js'
import { cartPriceNotice } from '../src/lib/cart.js'

test('course pagination reads past the first page and the last exact-size page', async () => {
  const offsets = []
  const rows = await readCourseTable('http://course.test', 'Product', {
    fetcher: async (url) => {
      const offset = Number(url.searchParams.get('offset'))
      offsets.push(offset)
      assert.equal(url.pathname, '/api/inft3050/Product')
      return Response.json({
        list: offset < 200 ? Array.from({ length: 100 }, (_, i) => ({ ID: offset + i + 1 })) : [],
        pageInfo: { pageSize: 100, isLastPage: offset === 200, totalRows: null },
      })
    },
  })
  assert.equal(rows.length, 200)
  assert.deepEqual(offsets, [0, 100, 200])
})

test('course pagination rejects failed, malformed and repeated pages instead of returning partial data', async () => {
  for (const body of [
    { list: [] },
    { list: [], pageInfo: { pageSize: 100, isLastPage: false } },
    { list: [{ ID: 1 }, { ID: 1 }], pageInfo: { pageSize: 100, isLastPage: true } },
  ])
    await assert.rejects(
      readCourseTable('http://course.test', 'Product', {
        fetcher: async () => Response.json(body),
      }),
    )
  let requests = 0
  await assert.rejects(
    readCourseTable('http://course.test', 'Product', {
      fetcher: async () => {
        if (requests++) return Response.json({ error: 'offline' }, { status: 503 })
        return Response.json({ list: [{ ID: 1 }], pageInfo: { pageSize: 1, isLastPage: false } })
      },
    }),
  )
})

test('course records preserve listing IDs, different sources, stock and keyword searching', async () => {
  const data = {
    Product: [
      {
        ID: 8,
        Name: 'Course Book',
        Author: 'Test Author',
        Description: 'A description',
        Genre: 1,
        SubGenre: 4,
      },
    ],
    Genre: [{ GenreID: 1, Name: 'Books' }],
    Source: [
      { Sourceid: 1, Source_name: 'Print' },
      { Sourceid: 2, Source_name: 'Audio' },
    ],
    Stocktake: [
      { ItemId: 51, ProductId: 8, SourceId: 1, Quantity: 0, Price: 12 },
      { ItemId: 52, ProductId: 8, SourceId: 2, Quantity: 5, Price: 7.25 },
    ],
  }
  const options = {
    fetcher: async (url) =>
      Response.json({
        list: data[url.pathname.split('/').at(-1)],
        pageInfo: { pageSize: 100, isLastPage: true },
      }),
  }
  const [product] = await loadCourseCatalogue('http://course.test', 'author books', options)
  assert.equal(product.id, '8')
  assert.equal(product.author, 'Test Author')
  assert.equal(product.subGenreId, '4')
  assert.deepEqual(
    product.offers.map((o) => [o.itemId, o.price, o.stock]),
    [
      ['52', 7.25, 5],
      ['51', 12, 0],
    ],
  )
  assert.deepEqual(await loadCourseCatalogue('http://course.test', "' OR 1=1 --", options), [])
  data.Stocktake[0].Price = '12'
  await assert.rejects(loadCourseCatalogue('http://course.test', '', options), /price or stock/)
  data.Stocktake[0].Price = 12
  data.Source = []
  await assert.rejects(loadCourseCatalogue('http://course.test', '', options), /missing/)
})

test('course mode blocks checkout before accessing a different database', async (t) => {
  // A GET needs no CSRF but must still be blocked before session/SQL lookup in course mode.
  const app = createApp(
    {
      getPool() {
        throw new Error('SQL must not be used')
      },
    },
    { courseApiUrl: 'http://course.test' },
  )
  const server = app.listen(0, '127.0.0.1')
  await once(server, 'listening')
  t.after(() => {
    server.closeAllConnections()
    server.close()
  })
  const r = await fetch(`http://127.0.0.1:${server.address().port}/api/checkout/reference`)
  assert.equal(r.status, 503)
  assert.match((await r.json()).error, /cart has been kept/)
})

test('cart price feedback compares accepted quotes without treating quantity edits as stock reductions', () => {
  const before = [{ itemId: '51', quantity: 2, product: { title: 'Book', price: 12 } }]
  assert.equal(cartPriceNotice(before, [{ ...before[0], quantity: 1 }]), '')
  assert.match(
    cartPriceNotice(before, [{ ...before[0], product: { title: 'Book', price: 13 } }]),
    /\$12.00 to \$13.00/,
  )
  assert.equal(cartPriceNotice([], before), '')
})
