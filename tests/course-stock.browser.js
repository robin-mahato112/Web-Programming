import assert from 'node:assert/strict'
import { chromium, expect } from '@playwright/test'
import { loadCourseCatalogue } from '../src/services/course-catalogue.js'

const api = process.env.COURSE_API_URL
const base = process.env.REVIEW_URL
if (
  api !== 'http://localhost:13002' ||
  base !== 'http://localhost:3002' ||
  process.env.COURSE_STOCK_WRITES !== '1'
)
  throw new Error('Stock testing requires isolated 3002/13002 and COURSE_STOCK_WRITES=1.')
const username = process.env.TEST_ADMIN_USERNAME,
  password = process.env.TEST_ADMIN_PASSWORD
assert.ok(username && password, 'Supply private administrator credentials.')
const products = await loadCourseCatalogue(api)
const product = products.find((item) =>
  item.offers.some((offer) => offer.stock >= 3 && offer.stock < 2147483647),
)
const offer = product.offers.find((item) => item.stock >= 3 && item.stock < 2147483647)
const browser = await chromium.launch({ channel: 'msedge', headless: true })
const admin = await browser.newContext()
const customer = await browser.newContext()
const page = await admin.newPage()
const shop = await customer.newPage()
const raw = async () => {
  const response = await admin.request.get(api + '/api/inft3050/Stocktake/' + offer.itemId)
  assert.equal(response.status(), 200)
  return response.json()
}
let signedIn = false
const original = await raw()
const quantity = (row) => row.Quantity
async function edit(value) {
  await page.getByRole('button', { name: 'Reload stock', exact: true }).click()
  await page.getByLabel('Find product, source or listing ID').fill(product.title)
  await page
    .getByRole('button', {
      name: `Edit stock for ${product.title}, ${offer.sourceName}, listing ${offer.itemId}`,
      exact: true,
    })
    .click()
  await page.getByLabel('New stock quantity').fill(String(value))
  await page.getByRole('button', { name: 'Save stock', exact: true }).click()
  await expect(page.getByRole('status')).toContainText('stock updated')
  assert.equal(quantity(await raw()), value)
}
try {
  await shop.goto(base + '/admin/stock')
  await expect(shop.getByRole('heading', { name: 'Administrator sign in' })).toBeVisible()
  assert.equal((await customer.request.get(api + '/api/admin/stock')).status(), 401)
  await page.goto(base + '/admin/login')
  await page.getByLabel('Username', { exact: true }).fill(username)
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Manage stock' })).toBeVisible()
  signedIn = true
  await page.getByLabel('Find product, source or listing ID').fill(product.title)
  await page
    .getByRole('button', {
      name: `Edit stock for ${product.title}, ${offer.sourceName}, listing ${offer.itemId}`,
      exact: true,
    })
    .click()
  await page.getByRole('button', { name: 'Add 1', exact: true }).click()
  assert.equal(
    quantity(await raw()),
    offer.stock,
    'Buttons must not save before explicit Save stock',
  )
  await page.getByRole('button', { name: 'Save stock', exact: true }).click()
  await expect(page.getByRole('status')).toContainText('stock updated')
  assert.equal(quantity(await raw()), offer.stock + 1)
  await edit(offer.stock)

  // A separate customer browser has a saved quantity before the administrator removes stock.
  await shop.goto(base + '/products/' + product.id + '?item=' + offer.itemId)
  await shop.evaluate(
    ({ key, itemId }) => localStorage.setItem(key, JSON.stringify([{ itemId, quantity: 3 }])),
    { key: 'entertainment-guild.cart.v1.course-2026', itemId: offer.itemId },
  )
  await shop.goto(base + '/cart')
  await expect(shop.locator('.cart-item')).toHaveCount(1)
  await edit(1)
  await shop.getByRole('button', { name: 'Check availability', exact: true }).click()
  await expect(
    shop.getByText(`Listing ${offer.itemId} was reduced from 3 to 1 to match current stock.`, {
      exact: true,
    }),
  ).toBeVisible()
  const lines = JSON.parse(
    await shop.evaluate(() => localStorage.getItem('entertainment-guild.cart.v1.course-2026')),
  )
  assert.equal(lines[0].quantity, 1)

  await edit(0)
  await shop.reload()
  await expect(shop.getByRole('heading', { name: 'Your cart is empty', exact: true })).toBeVisible()
  await shop.goto(base + '/products/' + product.id + '?item=' + offer.itemId)
  await expect(shop.getByRole('button', { name: /Out of stock/i })).toBeDisabled()
  const stale = await admin.request.patch(api + '/api/admin/stock/' + offer.itemId, {
    headers: { Origin: base, 'X-Stock-Request': '1' },
    data: { quantity: 5, expectedQuantity: offer.stock + 1 },
  })
  assert.equal(stale.status(), 409)
  await page.setViewportSize({ width: 390, height: 844 })
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
  await page.screenshot({ path: 'test-results/stock-mobile.png', fullPage: true })
  await edit(offer.stock)
  assert.deepEqual(
    await raw(),
    original,
    'Restore the original listing without changing source or price',
  )
  console.log(
    'PASS: isolated admin sign-in, stock add/reduce/zero, explicit save, stale conflict, cart adjustment/removal and mobile layout. Original stock restored; no purchases.',
  )
} finally {
  if (signedIn) {
    const current = await raw()
    if (quantity(current) !== offer.stock) {
      const response = await admin.request.patch(api + '/api/admin/stock/' + offer.itemId, {
        headers: { Origin: base, 'X-Stock-Request': '1' },
        data: { quantity: offer.stock, expectedQuantity: quantity(current) },
      })
      assert.equal(response.status(), 200, 'Restore isolated stock')
    }
  }
  await browser.close()
}
