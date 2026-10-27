import assert from 'node:assert/strict'
import { chromium, expect } from '@playwright/test'
import { loadCourseCatalogue } from '../src/services/course-catalogue.js'

// Fail before any request unless the caller selects the verified isolated installation.
const base = process.env.REVIEW_URL
const api = process.env.COURSE_API_URL
if (base !== 'http://localhost:3002' || api !== 'http://localhost:13002')
  throw new Error('Purchase testing requires isolated frontend 3002 and API 13002.')
// Opt-in: one approved order is retained in that isolated database.
const email = process.env.TEST_PATRON_EMAIL
const password = process.env.TEST_PATRON_PASSWORD
if (process.env.COURSE_CHECKOUT_WRITES !== '1' || !email || !password)
  throw new Error(
    'Set COURSE_CHECKOUT_WRITES=1 and private TEST_PATRON_EMAIL/TEST_PATRON_PASSWORD to allow one real local test order.',
  )
const products = await loadCourseCatalogue(api)
const product = products.find((p) => p.id === '2')
assert.ok(product, 'Need two available sources of one product')
const offers = product.offers.filter((o) => ['2', '3'].includes(o.itemId) && o.stock > 2)
assert.equal(offers.length, 2, 'Need both explicitly approved test listings')
const browser = await chromium.launch({ channel: 'msedge', headless: true })
const context = await browser.newContext()
const page = await context.newPage()
const cartKey = 'entertainment-guild.cart.v1.course-2026'
const requests = []
page.on('request', (r) => requests.push({ url: r.url(), method: r.method() }))
let payload, committed
async function enterCard(number) {
  await page.getByRole('button', { name: 'Continue to payment', exact: true }).click()
  await page.getByLabel('Cardholder name', { exact: true }).fill('Robin Checkout Test')
  await page.getByLabel('Card number', { exact: true }).fill(number)
  await page.getByLabel('Expiry (MM/YY)', { exact: true }).fill('12/99')
  await page.getByLabel('Security code (CVC)', { exact: true }).fill('123')
  await page.getByRole('button', { name: 'Review order', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Review your order', exact: true })).toBeVisible()
}
try {
  await page.goto(base + '/products')
  await page.getByRole('searchbox').fill(product.title)
  await page.getByRole('button', { name: 'Search', exact: true }).click()
  await expect(page.locator('.product-card')).toHaveCount(1)
  await page.getByRole('link', { name: 'View ' + product.title, exact: true }).click()
  for (const offer of offers) {
    await page.getByRole('combobox', { name: 'Source', exact: true }).selectOption(offer.itemId)
    await page.getByRole('button', { name: 'Add to cart', exact: true }).click()
  }
  await page.getByRole('link', { name: 'View cart', exact: true }).click()
  await expect(page.locator('.cart-item')).toHaveCount(2)
  await page.reload()
  await expect(page.locator('.cart-item')).toHaveCount(2)
  for (const line of await page.locator('.cart-item output').all())
    await expect(line).toHaveText('1')
  await page.getByRole('link', { name: 'Proceed to checkout', exact: true }).click()
  await page.getByLabel('Email address', { exact: true }).fill(email)
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page.getByLabel('Email', { exact: true })).toHaveValue(email)
  assert.ok((await context.cookies(api)).some((c) => c.name === 'token' && c.httpOnly))
  await page.reload()
  await expect(page.getByLabel('Email', { exact: true })).toHaveValue(email)
  await page.getByLabel('Street address', { exact: true }).fill('12 Test Street')
  await page.getByLabel('Suburb', { exact: true }).fill('Newcastle')
  await page.getByLabel('Postcode', { exact: true }).fill('2300')
  await enterCard('4000000000000002')
  await page.getByRole('button', { name: /Pay .* AUD/ }).click()
  await expect(page.getByRole('status').filter({ hasText: /Payment declined/ })).toBeVisible()
  assert.equal(JSON.parse(await page.evaluate((k) => localStorage.getItem(k), cartKey)).length, 2)
  await page.screenshot({ path: 'test-results/course-payment-declined.png', fullPage: true })
  await page.getByRole('button', { name: 'Review checkout again', exact: true }).click()
  await enterCard('4111111111111111')
  await page.getByRole('button', { name: /Pay .* AUD/ }).click()
  await expect(page.getByRole('status').filter({ hasText: /timed out/i })).toBeVisible()
  assert.equal(JSON.parse(await page.evaluate((k) => localStorage.getItem(k), cartKey)).length, 2)
  const unchanged = (await loadCourseCatalogue(api)).find((p) => p.id === product.id)
  for (const offer of offers)
    assert.equal(unchanged.offers.find((o) => o.itemId === offer.itemId).stock, offer.stock)
  await page.screenshot({ path: 'test-results/course-payment-timeout.png', fullPage: true })
  await page.getByRole('button', { name: 'Review checkout again', exact: true }).click()
  await enterCard('4242424242424242')
  // Capture only the masked review, after raw card inputs have been unmounted.
  await expect(page.getByLabel('Card number', { exact: true })).toHaveCount(0)
  await page.screenshot({ path: 'test-results/course-checkout-review.png', fullPage: true })
  // Commit for real, then drop only the response. Refresh must recover this same order.
  await page.route(
    api + '/api/checkout/confirm',
    async (route) => {
      payload = route.request().postDataJSON()
      const response = await route.fetch()
      committed = await response.json()
      await route.abort('failed')
    },
    { times: 1 },
  )
  await page.getByRole('button', { name: /Pay .* AUD/ }).click()
  await expect(page.getByRole('alert')).toContainText('interrupted')
  assert.equal(committed?.status, 'approved', JSON.stringify(committed))
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Order confirmed', exact: true })).toBeVisible()
  await expect
    .poll(async () => JSON.parse(await page.evaluate((k) => localStorage.getItem(k), cartKey)))
    .toEqual([])
  assert.equal(committed.total, Math.round(offers.reduce((sum, o) => sum + o.price, 0) * 100) / 100)
  const duplicate = await context.request.post(api + '/api/checkout/confirm', {
    headers: { Origin: base, 'X-Checkout-Request': '1' },
    data: payload,
  })
  assert.equal(duplicate.status(), 200)
  assert.deepEqual(await duplicate.json(), committed)
  await page.screenshot({ path: 'test-results/course-order-confirmed.png', fullPage: true })
  await page.setViewportSize({ width: 390, height: 844 })
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
  await page.screenshot({ path: 'test-results/course-order-confirmed-mobile.png', fullPage: true })
  const fresh = (await loadCourseCatalogue(api)).find((p) => p.id === product.id)
  for (const offer of offers)
    assert.equal(fresh.offers.find((o) => o.itemId === offer.itemId).stock, offer.stock - 1)
  await page.getByRole('button', { name: 'Menu', exact: true }).click()
  await page.getByRole('button', { name: 'Sign out', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible()
  assert.ok(!requests.some((r) => /:3001|:3101|:5175/.test(r.url)))
  console.log(
    JSON.stringify({
      result:
        'PASS: search, two sources, cart refresh, real login/refresh, delivery, declined/timed-out cart retention and unchanged stock, approved order, lost-response recovery, identical retry, exact stock deduction, mobile and logout',
      orderId: committed.orderId,
      total: committed.total,
      items: committed.items,
    }),
  )
} finally {
  await browser.close()
}
