/**
 * Exercise immutable offer-based cart changes against an explicitly supplied catalogue.
 * HTTP cases mock fetch while running the real quote parser and money checks.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  addCartItem,
  CART_STORAGE_KEY,
  cartStorageItems,
  getCartProduct,
  mergeQuotedProducts,
  readSavedCart,
  reconcileCart,
  removeCartItem,
  saveCart,
  setCartQuantity,
} from '../src/lib/cart.js'
import { quoteCart } from '../src/services/catalogue.js'
import { catalogue } from './fixtures/catalogue.js'

const initial = () => Object.freeze([Object.freeze({ itemId: '101', quantity: 1 })])
const validQuote = () => ({
  items: [
    {
      itemId: '104',
      productId: '1',
      quantity: 1,
      product: {
        ...catalogue[0],
        price: 59.95,
        stock: 4,
        sourceName: 'Store B',
      },
    },
  ],
  subtotal: 59.95,
})

test('cart additions are immutable and keep two sources of one product separate', () => {
  const items = initial()
  const increased = addCartItem(items, '101', 2, catalogue)
  assert.deepEqual(increased, [{ itemId: '101', quantity: 3 }])
  assert.equal(items[0].quantity, 1)
  const secondSource = addCartItem(items, '104', 1, catalogue)
  assert.deepEqual(secondSource, [
    { itemId: '101', quantity: 1 },
    { itemId: '104', quantity: 1 },
  ])
  assert.equal(secondSource[0], items[0])
})

test('cumulative additions use the selected offer stock and require a supplied catalogue', () => {
  let items = addCartItem([], '104', 3, catalogue)
  items = addCartItem(items, '104', 1, catalogue)
  assert.equal(items[0].quantity, 4)
  assert.equal(addCartItem(items, '104', 1, catalogue), items)
  const empty = []
  assert.equal(addCartItem(empty, '101'), empty)
})

test('invalid quantities and unavailable offers leave the cart unchanged', () => {
  const items = initial()
  for (const quantity of [
    NaN,
    Infinity,
    -Infinity,
    0,
    -1,
    0.5,
    '2',
    true,
    null,
    13,
    Number.MAX_SAFE_INTEGER + 1,
  ]) {
    assert.equal(addCartItem(items, '101', quantity, catalogue), items)
    assert.equal(setCartQuantity(items, '101', quantity, catalogue), items)
  }
  for (const itemId of ['missing', '103', null, 1]) {
    assert.equal(addCartItem(items, itemId, 1, catalogue), items)
    assert.equal(setCartQuantity(items, itemId, 1, catalogue), items)
  }
  assert.equal(setCartQuantity(items, '102', 1, catalogue), items)
})

test('quantity changes and removal preserve identities for unchanged lines', () => {
  const items = initial()
  assert.deepEqual(setCartQuantity(items, '101', 12, catalogue), [{ itemId: '101', quantity: 12 }])
  assert.equal(setCartQuantity(items, '101', 1, catalogue), items)
  assert.deepEqual(removeCartItem(items, '101'), [])
  assert.equal(removeCartItem(items, 'missing'), items)
  assert.deepEqual(items, [{ itemId: '101', quantity: 1 }])
})

test('offer lookup derives the selected price and source without mutating the product summary', () => {
  const product = getCartProduct(catalogue, '104')
  assert.equal(product.id, '1')
  assert.equal(product.price, 59.95)
  assert.equal(product.stock, 4)
  assert.equal(product.sourceName, 'Store B')
  assert.equal(catalogue[0].price, 54.95)
  assert.equal(getCartProduct(catalogue, 'missing'), null)
})

test('fresh quote stock permits the next update without replacing the canonical source summary', () => {
  const original = structuredClone(catalogue)
  const offers = catalogue[0].offers.map((offer) =>
    offer.itemId === '101' ? { ...offer, stock: 20, price: 64.95 } : offer,
  )
  const items = [
    {
      itemId: '101',
      productId: '1',
      quantity: 12,
      product: {
        ...catalogue[0],
        offers,
        stock: 20,
        price: 64.95,
        sourceName: 'Store A',
      },
    },
  ]
  assert.equal(setCartQuantity(items, '101', 13, catalogue), items)
  const refreshed = mergeQuotedProducts(catalogue, items)
  assert.equal(setCartQuantity(items, '101', 13, refreshed)[0].quantity, 13)
  assert.equal(addCartItem(items, '101', 1, refreshed)[0].quantity, 13)
  assert.equal(refreshed[0].price, 59.95)
  assert.equal(refreshed[0].stock, 4)
  assert.equal(refreshed[0].sourceName, undefined)
  assert.equal(refreshed[1], catalogue[1])
  assert.deepEqual(catalogue, original)
})

test('cart quote sends only offer IDs and quantities and accepts the selected source price', async (context) => {
  const signal = new AbortController().signal
  context.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(url, '/api/cart')
    assert.equal(options.method, 'POST')
    assert.equal(options.signal, signal)
    assert.deepEqual(JSON.parse(options.body), { items: [{ itemId: '104', quantity: 1 }] })
    return Response.json(validQuote())
  })
  assert.deepEqual(
    await quoteCart([{ itemId: '104', quantity: 1, price: 0, productId: 'fake' }], signal),
    validQuote(),
  )
})

test('cart quote rejects malformed rows, mismatched items and totals', async (context) => {
  const correct = validQuote()
  const row = correct.items[0]
  for (const body of [
    null,
    {},
    { items: 'invalid', subtotal: 0 },
    { ...correct, items: [null] },
    { ...correct, subtotal: 0 },
    { ...correct, items: [{ ...row, quantity: 2 }] },
    { ...correct, items: [{ ...row, product: { ...row.product, price: 1 } }] },
    { ...correct, items: [{ ...row, productId: '2' }] },
  ]) {
    context.mock.method(globalThis, 'fetch', async () => Response.json(body))
    await assert.rejects(quoteCart([{ itemId: '104', quantity: 1 }]), /invalid/)
  }
})

test('cart quote supports an empty cart and surfaces service errors', async (context) => {
  context.mock.method(globalThis, 'fetch', async () => Response.json({ items: [], subtotal: 0 }))
  assert.deepEqual(await quoteCart([]), { items: [], subtotal: 0 })
  context.mock.method(globalThis, 'fetch', async () =>
    Response.json(
      { error: 'Unavailable', errors: { items: 'Only 2 units remain.' } },
      { status: 400 },
    ),
  )
  await assert.rejects(quoteCart([{ itemId: '104', quantity: 1 }]), /Only 2 units remain/)
})

test('a late cart response is rejected after its request is aborted', async (context) => {
  const controller = new AbortController()
  context.mock.method(globalThis, 'fetch', async () => {
    controller.abort()
    return Response.json(validQuote())
  })
  await assert.rejects(quoteCart([{ itemId: '104', quantity: 1 }], controller.signal), {
    name: 'AbortError',
  })
})

test('saved cart normalization keeps only unique valid offer IDs and integer quantities', () => {
  const valid = Object.freeze({ itemId: '101', quantity: 2, price: 0, productId: 'wrong' })
  const saved = [
    valid,
    { itemId: '104', quantity: 1 },
    { itemId: '101', quantity: 3 },
    null,
    {},
    [],
    ...[101, '0', '-1', ' 101 ', '1e2', '2147483648'].map((itemId) => ({ itemId, quantity: 1 })),
    ...[0, -1, 1.5, '1', null, true, Infinity, 2147483648].map((quantity) => ({
      itemId: '102',
      quantity,
    })),
  ]
  assert.deepEqual(cartStorageItems(saved), [
    { itemId: '101', quantity: 2 },
    { itemId: '104', quantity: 1 },
  ])
  assert.equal(valid.price, 0)
  for (const value of [null, undefined, {}, 'cart']) assert.deepEqual(cartStorageItems(value), [])
})

test('storage writes contain only offer IDs and quantities and support clearing', () => {
  const writes = []
  const storage = { setItem: (key, value) => writes.push({ key, value }) }
  const item = { ...validQuote().items[0], customer: { name: 'Not stored' }, payment: 'Not stored' }
  assert.equal(saveCart([item], storage), true)
  assert.deepEqual(writes[0], {
    key: CART_STORAGE_KEY,
    value: JSON.stringify([{ itemId: '104', quantity: 1 }]),
  })
  assert.equal(saveCart([], storage), true)
  assert.deepEqual(JSON.parse(writes[1].value), [])
})

test('saved cart reads normalize data and report invalid JSON or blocked storage without throwing', () => {
  assert.deepEqual(readSavedCart({ getItem: () => null }), { items: [], adjusted: false })
  for (const raw of ['not json', '{}', 'null', '[null]']) {
    assert.deepEqual(readSavedCart({ getItem: () => raw }), { items: [], adjusted: true })
  }
  assert.deepEqual(
    readSavedCart({
      getItem: () =>
        JSON.stringify([
          { itemId: '101', quantity: 2, product: { price: 0 } },
          { itemId: '101', quantity: 1 },
        ]),
    }),
    { items: [{ itemId: '101', quantity: 2 }], adjusted: true },
  )
  const blocked = {
    getItem() {
      throw new Error('Storage blocked')
    },
    setItem() {
      throw new Error('Storage blocked')
    },
  }
  assert.deepEqual(readSavedCart(blocked), { items: [], unavailable: true })
  assert.equal(saveCart(initial(), blocked), false)
  assert.deepEqual(readSavedCart(), { items: [], adjusted: false })
  assert.equal(saveCart(initial()), false)
})

test('saved quantities are capped to current source stock and unavailable offers are removed', () => {
  const saved = [
    { itemId: '101', quantity: 20 },
    { itemId: '104', quantity: 4 },
    { itemId: '103', quantity: 1 },
    { itemId: '999', quantity: 1 },
  ]
  assert.deepEqual(reconcileCart(saved, catalogue), {
    items: [
      { itemId: '101', quantity: 12 },
      { itemId: '104', quantity: 4 },
    ],
    adjusted: true,
  })
  assert.deepEqual(reconcileCart(initial(), catalogue), { items: [...initial()], adjusted: false })
  assert.deepEqual(reconcileCart(saved, []), { items: [], adjusted: true })
  assert.equal(saved[0].quantity, 20)
})

test('restoration uses a fresh quote instead of trusting saved prices or product details', async (context) => {
  const saved = readSavedCart({
    getItem: () =>
      JSON.stringify([
        { itemId: '104', quantity: 1, productId: 'wrong', product: { price: 0 }, subtotal: 0 },
      ]),
  })
  const restored = reconcileCart(saved.items, catalogue)
  const quote = validQuote()
  quote.items[0].product.offers = quote.items[0].product.offers.map((offer) =>
    offer.itemId === '104' ? { ...offer, price: 64.95 } : offer,
  )
  quote.items[0].product.price = 64.95
  quote.subtotal = 64.95
  context.mock.method(globalThis, 'fetch', async (_url, options) => {
    assert.deepEqual(JSON.parse(options.body), { items: [{ itemId: '104', quantity: 1 }] })
    return Response.json(quote)
  })
  const accepted = await quoteCart(restored.items)
  assert.equal(accepted.items[0].product.price, 64.95)
  assert.equal(accepted.items[0].productId, '1')
  assert.equal(accepted.subtotal, 64.95)
})
