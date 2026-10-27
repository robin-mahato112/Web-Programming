import { loadCourseCatalogue } from '../src/services/course-catalogue.js'
import assert from 'node:assert/strict'
import { chromium, expect } from '@playwright/test'

// Read-only live review: browser cart changes and API quotes do not create SQL orders.
const base = process.env.REVIEW_URL || 'http://localhost:3000'
const api = process.env.COURSE_API_URL || 'http://localhost:13001'
const cartKey = 'entertainment-guild.cart.v1.course-2026'
const products = await loadCourseCatalogue(api)
const multi = products.find((p) => p.offers.filter((o) => o.stock > 2).length > 1)
const zero = products.find((p) => p.offers.some((o) => o.stock === 0))
assert.ok(multi && zero, 'Need multiple-source and out-of-stock evidence from live records')
const browser = await chromium.launch({ channel: 'msedge', headless: true })
const page = await browser.newPage({ viewport: { width: 1365, height: 900 } })
const errors = []
page.on('pageerror', (error) => errors.push(error.message))
try {
  const requests = []
  page.on('request', (request) => requests.push({ url: request.url(), method: request.method() }))
  await page.goto(base + '/products')
  await page.getByRole('searchbox').fill(multi.title)
  await page.getByRole('button', { name: 'Search', exact: true }).click()
  await page.getByLabel('Sort by').selectOption('name')
  await expect(page.locator('.product-card')).toHaveCount(1)
  const search = new URL(page.url()).search
  await page.screenshot({ path: 'test-results/scrum-live-search.png', fullPage: true })
  await page.getByRole('link', { name: 'View ' + multi.title, exact: true }).click()
  await expect(page.locator('#product-description')).toContainText(multi.description)
  const recommendations = page.locator('.recommendations .product-card')
  if (await recommendations.count()) {
    const href = await recommendations.first().locator('a').first().getAttribute('href')
    const recommended = products.find((p) => '/products/' + p.id === href.split('?')[0])
    assert.equal(recommended.category, multi.category)
    if (multi.subGenreId) assert.equal(recommended.subGenreId, multi.subGenreId)
    assert.notEqual(recommended.id, multi.id)
    await recommendations.first().locator('a').first().click()
    await expect(page.getByRole('heading', { name: recommended.title, exact: true })).toBeVisible()
    assert.equal(new URL(page.url()).search, search)
    await page.goBack()
  }
  for (const offer of multi.offers.filter((o) => o.stock > 2).slice(0, 2)) {
    await page.getByLabel('Source').selectOption(offer.itemId)
    await expect(page.locator('.detail-price')).toHaveText('$' + offer.price.toFixed(2))
    await page.getByRole('button', { name: 'Add to cart', exact: true }).click()
    await expect(page.getByRole('status').filter({ hasText: /added/i })).toContainText(
      offer.sourceName,
    )
  }
  await page.screenshot({ path: 'test-results/scrum-live-details.png', fullPage: true })
  await page.getByRole('link', { name: 'Continue shopping', exact: true }).click()
  assert.equal(new URL(page.url()).search, search)
  await page.goto(base + '/cart' + search)
  await expect(page.locator('.cart-item')).toHaveCount(2)
  await page
    .locator('.cart-item')
    .first()
    .getByRole('button', { name: /Increase/ })
    .click()
  await expect(page.locator('.cart-item').first().locator('output')).toHaveText('2')
  await page.reload()
  await expect(page.locator('.cart-item')).toHaveCount(2)
  await expect(page.locator('.cart-item').first().locator('output')).toHaveText('2')
  await page.screenshot({ path: 'test-results/scrum-live-cart.png', fullPage: true })
  const saved = await page.evaluate((key) => localStorage.getItem(key), cartKey)
  await page.getByRole('link', { name: 'Proceed to checkout', exact: true }).click()
  await expect(
    page.getByRole('heading', {
      name: 'Welcome back',
    }),
  ).toBeVisible()
  await expect(page.getByRole('button', { name: /Pay/ })).toHaveCount(0)
  assert.equal(await page.evaluate((key) => localStorage.getItem(key), cartKey), saved)
  await page.screenshot({ path: 'test-results/live-checkout-entry.png', fullPage: true })
  await page.goto(
    base + `/products/${zero.id}?item=${zero.offers.find((o) => o.stock === 0).itemId}`,
  )
  await expect(page.getByRole('button', { name: 'Out of stock', exact: true })).toBeDisabled()
  await page.screenshot({ path: 'test-results/scrum-live-out-of-stock.png', fullPage: true })
  const last = products.at(-1)
  await page.goto(base + '/products/' + last.id)
  await expect(page.getByRole('heading', { name: last.title, exact: true })).toBeVisible()
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto(base + '/cart' + search)
  await expect(page.locator('.cart-item')).toHaveCount(2)
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
  await page.screenshot({ path: 'test-results/scrum-live-cart-mobile.png', fullPage: true })
  await page
    .locator('.cart-item')
    .first()
    .getByRole('button', { name: 'Remove', exact: true })
    .click()
  await expect(page.locator('.cart-item')).toHaveCount(1)
  await page.getByRole('button', { name: 'Clear cart', exact: true }).click()
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Your cart is empty' })).toBeVisible()
  assert.ok(requests.some((r) => r.url === api + '/api/products'))
  assert.ok(
    requests.some((r) => r.url.startsWith(api + '/api/products?q=')),
    'Keyword search must reach the SQL-backed endpoint',
  )
  assert.ok(!requests.some((r) => /:3001|:3101|:5175/.test(r.url)))
  assert.ok(!requests.some((r) => r.url.startsWith(api) && r.method !== 'GET'))
  assert.deepEqual(errors, [])
  console.log(
    `PASS (direct course API): live search, details, both sources/prices, quantity, refresh, previous search, checkout entry, zero stock, last product, removal, clear and mobile layout; no browser errors. No orders placed.`,
  )
} finally {
  await browser.close()
}
