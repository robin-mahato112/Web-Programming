import { test, expect } from '@playwright/test'

async function fixture(page, options = {}) {
  const model = { userId: 201, requests: [], status: 200, empty: false, ...options }
  await page.route('**/backend/**', async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    const path = url.pathname.replace('/backend', '')
    model.requests.push({
      path,
      method: request.method(),
      query: Object.fromEntries(url.searchParams),
    })
    const reply = (json, status = 200) => route.fulfill({ json, status })
    if (path === '/logout') {
      model.userId = null
      return reply({ ok: true })
    }
    if (path === '/patronLogin') {
      model.userId = model.nextUserId || 201
      return reply({ id: model.userId, role: 'PATRON' })
    }
    if (path === '/me')
      return model.userId
        ? reply({ id: model.userId, role: 'PATRON' })
        : reply({ error: 'Not signed in' }, 401)
    if (path.includes('/Patrons/'))
      return reply({
        UserID: model.userId,
        Name: 'Customer ' + model.userId,
        Email: 'customer@example.test',
      })
    const customerId = model.userId === 202 ? 402 : 301
    if (path === '/api/inft3050/TO')
      return reply({
        list: [
          {
            CustomerID: customerId,
            PatronId: model.userId,
            PhoneNumber: '0412345678',
            StreetAddress: '99 Current Street',
            Suburb: 'Darwin',
            State: 'NT',
            PostCode: 800,
          },
        ],
      })
    if (path === '/api/inft3050/Orders') {
      if (model.status !== 200) return reply({ error: 'History unavailable' }, model.status)
      const orders = model.empty
        ? []
        : model.many
          ? Array.from({ length: 1001 }, (_, i) => ({
              OrderID: 2001 - i,
              Customer: customerId,
              StreetAddress: '12 Original Street',
              Suburb: 'Darwin',
              State: 'NT',
              PostCode: 800,
            }))
          : [
              {
                OrderID: model.userId === 202 ? 902 : 502,
                Customer: model.foreign ? 999 : customerId,
                StreetAddress: '12 Original Street',
                Suburb: 'Darwin',
                State: 'NT',
                PostCode: 800,
              },
              ...(model.userId === 202
                ? []
                : [
                    {
                      OrderID: 501,
                      Customer: customerId,
                      StreetAddress: '1 Previous Road',
                      Suburb: 'Darwin',
                      State: 'NT',
                      PostCode: 800,
                    },
                  ]),
            ]
      if (model.wait) {
        const wait = model.wait
        model.wait = null
        model.pending = true
        await wait
      }
      const offset = Number(url.searchParams.get('offset') || 0)
      return reply({
        list: orders.slice(offset, offset + Number(url.searchParams.get('limit') || 1000)),
      })
    }
    if (path === '/api/inft3050/ProductsInOrders')
      return reply({
        list: [
          { OrderId: model.foreignLines ? 999 : 502, produktId: 11, Quantity: 2 },
          { OrderId: 502, produktId: 12, Quantity: 1 },
          { OrderId: 502, produktId: 13, Quantity: 3 },
        ],
      })
    if (path.startsWith('/api/inft3050/Stocktake/')) {
      const item = Number(path.split('/').at(-1))
      return item === 13
        ? reply({ error: 'Not found' }, 404)
        : reply({ ItemId: item, ProductId: item + 100 })
    }
    if (path.startsWith('/api/inft3050/Product/'))
      return reply({
        ID: Number(path.split('/').at(-1)),
        Name: 'Test product ' + path.split('/').at(-1),
      })
    return reply({ list: [] })
  })
  await page.goto('/account')
  await expect(page.getByRole('heading', { name: 'Hello, Customer 201' })).toBeVisible()
  return model
}
async function history(page) {
  await page.getByRole('button', { name: 'View order history', exact: true }).click()
}

test('history shows all order lines and original addresses without writes or invented prices', async ({
  page,
}, testInfo) => {
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  const model = await fixture(page)
  await history(page)
  const section = page.getByRole('region', { name: 'Order history', exact: true })
  await expect(section.getByRole('heading', { level: 3 })).toHaveText(['Order #502', 'Order #501'])
  await expect(section).toContainText('12 Original Street, Darwin, NT, 0800')
  await expect(section).not.toContainText('99 Current Street')
  await page.getByRole('button', { name: 'View items for order #502', exact: true }).click()
  await expect(section.getByText('Test product 111', { exact: true })).toBeVisible()
  await expect(section.getByText('Test product 112', { exact: true })).toBeVisible()
  await expect(section.getByText('Product no longer available', { exact: true })).toBeVisible()
  await expect(section).toContainText('Item #13 · Quantity: 3')
  await expect(section).not.toContainText('$')
  expect(model.requests.filter((r) => r.method !== 'GET')).toHaveLength(0)
  const lineRequest = model.requests.find((r) => r.path === '/api/inft3050/ProductsInOrders')
  expect(lineRequest.query.where).toBe('(OrderId,eq,502)')
  expect(model.requests.some((r) => /ProductsInOrders\/\d/.test(r.path))).toBe(false)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await section.scrollIntoViewIfNeeded()
  await page.screenshot({ path: testInfo.outputPath('order-history.png'), fullPage: true })
  expect(errors).toEqual([])
  await page.reload()
  await history(page)
  await expect(section.getByRole('heading', { name: 'Order #502' })).toBeVisible()
})

test('empty orders and a server outage have different states and retry recovers', async ({
  page,
}) => {
  const model = await fixture(page, { status: 503 })
  await history(page)
  const section = page.getByRole('region', { name: 'Order history', exact: true })
  await expect(section.getByRole('alert')).toContainText('temporarily unavailable')
  await expect(section).not.toContainText('You have no orders yet')
  model.status = 200
  model.empty = true
  await section.getByRole('button', { name: 'Retry order history' }).click()
  await expect(section.getByRole('status')).toHaveText('You have no orders yet.')
  model.empty = false
  await section.getByRole('button', { name: 'Refresh order history' }).click()
  await expect(section.getByRole('heading', { name: 'Order #502' })).toBeVisible()
})

test('foreign ownership or order lines fail closed without showing another order', async ({
  page,
}) => {
  const model = await fixture(page, { foreign: true })
  await history(page)
  const section = page.getByRole('region', { name: 'Order history', exact: true })
  await expect(section.getByRole('alert')).toContainText('ownership could not be verified')
  await expect(section.getByRole('heading', { level: 3 })).toHaveCount(0)
  model.foreign = false
  model.foreignLines = true
  await section.getByRole('button', { name: 'Retry order history' }).click()
  await section.getByRole('button', { name: 'View items for order #502' }).click()
  await expect(section.getByRole('alert')).toContainText('ownership could not be verified')
  await expect(section.getByText('Test product 111')).toHaveCount(0)
  expect(model.requests.filter((r) => r.method !== 'GET')).toHaveLength(0)
})

test('history reads later API pages and renders a bounded number of cards', async ({ page }) => {
  const model = await fixture(page, { many: true })
  await history(page)
  const section = page.getByRole('region', { name: 'Order history', exact: true })
  await expect(section.getByRole('status')).toHaveText('1001 orders found.')
  await expect(section.getByRole('heading', { level: 3 })).toHaveCount(10)
  await section.getByRole('button', { name: 'Show more orders' }).click()
  await expect(section.getByRole('heading', { level: 3 })).toHaveCount(20)
  expect(
    model.requests.filter((r) => r.path.endsWith('/Orders')).map((r) => r.query.offset),
  ).toEqual(['0', '1000'])
})

test('switching accounts cancels late history and displays only the next customer orders', async ({
  page,
}) => {
  let release
  const wait = new Promise((resolve) => {
    release = resolve
  })
  const model = await fixture(page, { wait })
  await history(page)
  await expect.poll(() => model.pending).toBe(true)
  model.nextUserId = 202
  await page.evaluate(async () => {
    const { signOut, signInCustomer } = await import('/src/data/session.js')
    await signOut()
    await signInCustomer('customer@example.test', 'Testing123')
  })
  release()
  await page.goto('/account')
  await expect(page.getByRole('heading', { name: 'Hello, Customer 202' })).toBeVisible()
  await history(page)
  const section = page.getByRole('region', { name: 'Order history', exact: true })
  await expect(section.getByRole('heading', { level: 3 })).toHaveText(['Order #902'])
  await expect(section).not.toContainText('Order #502')
  const storage = await page.evaluate(() => JSON.stringify({ ...localStorage, ...sessionStorage }))
  expect(storage).not.toContain('Original Street')
})

test('expired authentication cannot leave order history visible', async ({ page }) => {
  const model = await fixture(page)
  await history(page)
  await expect(page.getByRole('heading', { name: 'Order #502' })).toBeVisible()
  model.status = 401
  await page.getByRole('button', { name: 'Refresh order history' }).click()
  await expect(page).toHaveURL(/\/login$/)
  await expect(page.getByRole('heading', { name: 'Order #502' })).toHaveCount(0)
})
