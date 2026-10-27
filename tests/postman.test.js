import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { Script } from 'node:vm'
import { test } from 'node:test'

test('university Postman contract uses real routes and prevents main or unapproved purchases', async () => {
  const read = async (name) =>
    JSON.parse(await readFile(new URL('../docs/postman/' + name, import.meta.url), 'utf8'))
  const collection = await read('University-Checkout.postman_collection.json')
  const main = await read('University-Main.postman_environment.json')
  const isolated = await read('University-Isolated.postman_environment.json')
  for (const environment of [main, isolated]) {
    const values = Object.fromEntries(environment.values.map((v) => [v.key, v.value]))
    assert.equal(values.patronPassword, '')
    assert.equal(values.paymentToken, '')
    assert.equal(values.confirmBody, '')
    assert.equal(values.allowIsolatedPurchase, 'false')
    assert.equal(values.adminPassword, '')
    assert.equal(values.adminUsername, '')
    assert.equal(values.allowIsolatedStockEdit, 'false')
  }
  const urls = collection.item.map((item) => item.request.url)
  assert.ok(urls.includes('{{baseUrl}}/patronLogin'))
  assert.ok(urls.includes('{{baseUrl}}/me'))
  assert.ok(urls.includes('{{baseUrl}}/api/inft3050/ProductsInOrders?limit=100&offset=0'))
  assert.ok(urls.includes('{{baseUrl}}/api/checkout/prepare'))
  assert.ok(!urls.some((url) => url.includes('/api/auth/')))
  for (const item of [collection, ...collection.item])
    for (const event of item.event || []) new Script(event.script.exec.join('\n'))

  const confirm = collection.item.find((item) => item.request.url.endsWith('/checkout/confirm'))
  const script = new Script(
    confirm.event.find((e) => e.listen === 'prerequest').script.exec.join('\n'),
  )
  for (const [url, enabled, allowed] of [
    ['http://localhost:13001/api/checkout/confirm', 'true', false],
    ['http://localhost:13002/api/checkout/confirm', 'false', false],
    ['https://other.example/api/checkout/confirm', 'true', false],
    ['http://localhost:13002/api/checkout/confirm', 'true', true],
  ]) {
    const payload = JSON.stringify({
      token: 'existing-attempt',
      items: [{ itemId: '2', quantity: 1 }],
    })
    const values = {
      allowIsolatedPurchase: enabled,
      attemptId: 'existing-attempt',
      confirmBody: payload,
    }
    let skipped = false,
      body
    const context = {
      pm: {
        environment: { get: (key) => values[key] },
        request: { url: { toString: () => url } },
        variables: {
          replaceIn: (value) => value,
          set: (_key, value) => {
            body = value
          },
        },
        execution: {
          skipRequest: () => {
            skipped = true
          },
        },
      },
    }
    if (allowed) {
      script.runInNewContext(context)
      assert.equal(body, payload, 'Retry must preserve the saved confirmation body')
      assert.equal(skipped, false)
    } else {
      assert.throws(() => script.runInNewContext(context), /Purchase blocked/)
      assert.equal(skipped, true)
      assert.equal(body, undefined)
    }
  }
})

test('Postman stock editing blocks main writes and requires isolated opt-in with integer quantities', async () => {
  const collection = JSON.parse(
    await readFile(
      new URL('../docs/postman/University-Checkout.postman_collection.json', import.meta.url),
      'utf8',
    ),
  )
  const stock = collection.item.find((item) => item.request.method === 'PATCH')
  const script = new Script(stock.event[0].script.exec.join('\n'))
  for (const [baseUrl, allowIsolatedStockEdit, newStock, allowed] of [
    ['http://localhost:13001', 'true', '5', false],
    ['http://localhost:13002', 'false', '5', false],
    ['http://localhost:13002', 'true', '-1', false],
    ['http://localhost:13002', 'true', '', false],
    ['http://localhost:13002', 'true', '0', true],
  ]) {
    const values = { baseUrl, allowIsolatedStockEdit, newStock, expectedStock: '5' }
    let skipped = false,
      body
    const pm = {
      environment: { get: (key) => values[key] },
      execution: {
        skipRequest: () => {
          skipped = true
        },
      },
      variables: {
        set: (_key, value) => {
          body = value
        },
      },
    }
    if (allowed) {
      script.runInNewContext({ pm })
      assert.deepEqual(JSON.parse(body), { quantity: 0, expectedQuantity: 5 })
      assert.equal(skipped, false)
    } else {
      assert.throws(() => script.runInNewContext({ pm }))
      assert.equal(skipped, true)
    }
  }
})
