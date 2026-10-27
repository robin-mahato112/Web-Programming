import assert from 'node:assert/strict'
import { test } from 'node:test'
import { validateConfirmation } from '../server/checkout.js'
import { randomUUID } from 'node:crypto'
import { CheckoutError, saveOrder, validateCustomer, writeOrder } from '../server/orders.js'
import { quoteCart } from '../server/catalogue.js'
import { consumeCartItems } from '../src/lib/cart.js'
import { catalogue } from './fixtures/catalogue.js'

const customer = {
  name: "Robin O'Neil",
  email: 'fixture.customer@example.test',
  phone: '',
  street: '12 Test Street',
  suburb: 'Newcastle',
  postcode: '2300',
  state: 'NSW',
}
const items = [
  { itemId: '101', quantity: 2 },
  { itemId: '104', quantity: 1 },
]
const quote = quoteCart(items, catalogue)
test('customer validation preserves Unicode and leading-zero postcodes but rejects invalid fields', () => {
  assert.equal(validateCustomer({ ...customer, name: ' 李明 ', postcode: '0800' }).name, '李明')
  for (const change of [
    { email: 'bad' },
    { postcode: '230' },
    { state: 'XX' },
    { suburb: 'a'.repeat(51) },
    { name: '' },
    { street: 'a\nb' },
    { phone: 'abcdef' },
  ])
    assert.throws(() => validateCustomer({ ...customer, ...change }), CheckoutError)
})

// Simulate SQL requests at the transaction boundary so failures can be injected after an insert.
function databaseDouble({ stock = {}, failInsert = false, failCommit = false } = {}) {
  const calls = []
  const transaction = {
    async begin() {
      calls.push('begin')
    },
    async commit() {
      calls.push('commit')
      if (failCommit) throw new Error('lost acknowledgement')
    },
    async rollback() {
      calls.push('rollback')
    },
    request() {
      const inputs = {}
      return {
        input(key, value) {
          inputs[key] = value
          return this
        },
        async query(sql) {
          calls.push({ sql, inputs })
          if (sql.includes('SELECT ItemId')) {
            const offer = catalogue[0].offers.find(
              (entry) => Number(entry.itemId) === inputs.itemId,
            )
            return {
              recordset:
                stock === null
                  ? []
                  : [
                      {
                        ItemId: inputs.itemId,
                        ProductId: '1',
                        SourceId: offer.sourceId,
                        Quantity: offer.stock,
                        Price: offer.price,
                        ...stock,
                      },
                    ],
            }
          }
          if (sql.includes('INSERT dbo.ProductsInOrders') && failInsert)
            throw new Error('insert failed')
          return { recordset: [{ id: '10' }] }
        },
      }
    },
  }
  return {
    calls,
    transaction,
    async getPool() {
      return { transaction: () => transaction }
    },
  }
}

test('approved order binds customer data, uses Stocktake IDs and commits once', async () => {
  const db = databaseDouble()
  const order = await saveOrder(db, quote, customer, 1)
  assert.equal(order.total, 169.85)
  assert.equal(db.calls.at(-1), 'commit')
  const queries = db.calls.filter((call) => call.sql)
  assert.deepEqual(
    queries.filter((call) => call.sql.includes('UPDLOCK')).map((call) => call.inputs.itemId),
    [101, 104],
  )
  assert.deepEqual(
    queries.filter((call) => call.sql.includes('produktId')).map((call) => call.inputs.itemId),
    [101, 104],
  )
  assert.ok(queries.some((call) => call.inputs.patron === 1))
  assert.ok(
    queries.every((call) => !call.sql.includes(customer.name) && !/CardNumber|CVV/.test(call.sql)),
  )
})

test('missing stock, changed prices and changed sources abort before customer inserts', async () => {
  for (const stock of [
    null,
    { Quantity: 1 },
    { Price: 1 },
    { SourceId: '99' },
    { ProductId: '99' },
  ]) {
    const db = databaseDouble({ stock })
    await assert.rejects(saveOrder(db, quote, customer, 1), { status: 409 })
    assert.equal(db.calls.at(-1), 'rollback')
    assert.ok(!db.calls.some((call) => call.sql?.includes('INSERT')))
  }
})

test('write failures roll back and lost commit acknowledgements require reconciliation', async () => {
  const db = databaseDouble({ failInsert: true })
  await assert.rejects(saveOrder(db, quote, customer, 1), /insert failed/)
  assert.equal(db.calls.at(-1), 'rollback')
  assert.ok(!db.calls.includes('commit'))
  await assert.rejects(saveOrder(databaseDouble({ failCommit: true }), quote, customer, 1), {
    status: 502,
  })
})

test('transaction writer can be exercised without committing database changes', async () => {
  const db = databaseDouble()
  await writeOrder(db.transaction, quote, customer, 1)
  assert.ok(!db.calls.includes('commit'))
})

test('approved cart cleanup preserves unrelated listings and later added units', () => {
  assert.deepEqual(
    consumeCartItems(
      [
        { itemId: '101', quantity: 3 },
        { itemId: '102', quantity: 2 },
      ],
      items,
    ),
    [
      { itemId: '101', quantity: 1 },
      { itemId: '102', quantity: 2 },
    ],
  )
})

test('confirmation binds a reviewed listing to a valid customer and stable request', () => {
  const user = { email: customer.email }
  const request = {
    token: randomUUID(),
    paymentToken: 'signed-demo-reference',
    customer,
    items: [{ itemId: '101', productId: '1', sourceId: '1', quantity: 1, priceCents: 5495 }],
  }
  assert.equal(validateConfirmation(request, user).items[0].priceCents, 5495)
  for (const change of [
    { token: 'bad' },
    { outcome: 'approved' },
    { paymentToken: '' },
    { items: [] },
    { items: [...request.items, ...request.items] },
    { customer: { ...customer, email: 'someone@example.test' } },
  ])
    assert.throws(() => validateConfirmation({ ...request, ...change }, user), { status: 400 })
})
