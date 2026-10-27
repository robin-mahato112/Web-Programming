import assert from 'node:assert/strict'
import { chromium, expect } from '@playwright/test'

// Real session + read-only course requests. Confirmation writes are intercepted before networking.
const email = process.env.TEST_PATRON_EMAIL,
  password = process.env.TEST_PATRON_PASSWORD
if (!email || !password)
  throw new Error('Supply private TEST_PATRON_EMAIL and TEST_PATRON_PASSWORD')
const base = process.env.REVIEW_URL || 'http://localhost:3000'
const api = process.env.COURSE_API_URL || 'http://localhost:13001'
const browser = await chromium.launch({ channel: 'msedge', headless: true })
const context = await browser.newContext(),
  page = await context.newPage()
const cartKey = 'entertainment-guild.cart.v1.course-2026'
let submitted,
  confirmRequests = 0
const messages = []
page.on('console', (msg) => messages.push(msg.text()))
async function login() {
  await page.getByLabel('Email address', { exact: true }).fill(email)
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
}
async function delivery() {
  await page.getByLabel('Street address', { exact: true }).fill('12 Test Street')
  await page.getByLabel('Suburb', { exact: true }).fill('Newcastle')
  await page.getByLabel('Postcode', { exact: true }).fill('2300')
}
try {
  // Never forward a purchase to live StoreDB, even if the test fails later.
  await context.route(api + '/api/checkout/confirm', (route) => {
    confirmRequests++
    submitted = route.request().postDataJSON()
    return route.fulfill({ status: 401, json: { error: 'Invalid or expired token' } })
  })
  await page.goto(base + '/products/2?q=king&sort=name&item=2')
  await page.getByRole('button', { name: 'Add to cart', exact: true }).click()
  await page.getByRole('link', { name: 'View cart', exact: true }).click()
  await page.getByRole('link', { name: 'Proceed to checkout', exact: true }).click()
  await expect(page).toHaveURL(/\/login\?returnTo=/)
  assert.equal(new URL(page.url()).searchParams.get('returnTo'), '/checkout?q=king&sort=name')
  await expect(page.getByRole('link', { name: 'The collection', exact: true })).toHaveAttribute(
    'href',
    '/products?q=king&sort=name',
  )
  await page.reload()
  await page.getByLabel('Email address', { exact: true }).fill(email)
  await page.getByLabel('Password', { exact: true }).fill('invalid-session-test-password')
  const rejected = page.waitForResponse((response) => response.url() === api + '/patronLogin')
  await page.getByLabel('Password', { exact: true }).press('Enter')
  assert.equal((await rejected).status(), 401)
  await expect(page.getByRole('alert')).toBeVisible()
  await expect(page.getByLabel('Password', { exact: true })).toHaveValue('')
  await login()
  await expect(page.getByLabel('Email', { exact: true })).toHaveValue(email)
  assert.equal(new URL(page.url()).search, '?q=king&sort=name')
  await page.reload()
  await expect(page.getByLabel('Email', { exact: true })).toHaveValue(email)
  await expect(page.getByRole('complementary', { name: 'Order summary' })).toBeVisible()
  await page.screenshot({ path: 'test-results/checkout-delivery-updated.png', fullPage: true })
  await delivery()
  await page.reload()
  await expect(page.getByLabel('Street address', { exact: true })).toHaveValue('12 Test Street')
  await expect(page.getByLabel('Postcode', { exact: true })).toHaveValue('2300')
  await context.clearCookies()
  await page.getByRole('button', { name: 'Continue to payment', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('session has expired')
  await expect(page.getByLabel('Email address', { exact: true })).toBeVisible()
  assert.equal(JSON.parse(await page.evaluate((k) => localStorage.getItem(k), cartKey)).length, 1)
  await login()
  await expect(page.getByLabel('Email', { exact: true })).toHaveValue(email)
  await expect(page.getByLabel('Street address', { exact: true })).toHaveValue('12 Test Street')
  await page.getByRole('button', { name: 'Continue to payment', exact: true }).click()
  await page.getByLabel('Cardholder name', { exact: true }).fill('Test Customer')
  await page.getByLabel('Card number', { exact: true }).fill('4242424242424242')
  await page.getByLabel('Expiry (MM/YY)', { exact: true }).fill('12/30')
  await page.getByLabel('Security code (CVC)', { exact: true }).fill('123')
  await page.getByRole('button', { name: 'Review order', exact: true }).click()
  await expect(page.locator('.checkout-steps [aria-current="step"]')).toContainText(
    'Review and pay',
  )
  await expect(page.getByRole('complementary', { name: 'Order summary' })).toContainText(
    'Hard copy',
  )
  await page.screenshot({ path: 'test-results/checkout-review-updated.png', fullPage: true })
  await page.setViewportSize({ width: 390, height: 844 })
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
  await page.screenshot({ path: 'test-results/checkout-review-mobile-updated.png', fullPage: true })
  assert.equal(confirmRequests, 0, 'Login and Review order must never submit payment')
  await page.getByRole('button', { name: /Pay .* AUD/ }).click()
  await expect(page.getByRole('alert')).toContainText('session has expired')
  assert.equal(confirmRequests, 1)
  const storage = await page.evaluate(() =>
    JSON.stringify({ local: { ...localStorage }, session: { ...sessionStorage } }),
  )
  assert.ok(
    !storage.includes('4242424242424242') &&
      !storage.includes('"cvc"') &&
      !storage.includes('"card"'),
  )
  assert.ok(storage.includes(submitted.token), 'Uncertain attempt must survive reauthentication')
  assert.equal(JSON.parse(await page.evaluate((k) => localStorage.getItem(k), cartKey)).length, 1)
  await login()
  await expect(
    page.getByRole('button', { name: 'Retry same submission', exact: true }),
  ).toBeVisible()
  assert.equal(confirmRequests, 1, 'Login must not automatically retry a payment')
  // UI contract fixture only; persistence/ownership are verified with the isolated SQL suite.
  const receipt = {
    status: 'approved',
    orderId: '999999',
    items: submitted.items.map(({ itemId, quantity }) => ({ itemId, quantity })),
    total: submitted.items.reduce((sum, i) => sum + i.priceCents * i.quantity, 0) / 100,
    payment: { brand: 'Visa', last4: '4242' },
  }
  await page.route(api + '/api/checkout/' + submitted.token, (route) =>
    route.fulfill({ json: receipt }),
  )
  await page.getByRole('button', { name: 'Check result', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Order confirmed', exact: true })).toBeVisible()
  await expect
    .poll(async () => JSON.parse(await page.evaluate((k) => localStorage.getItem(k), cartKey)))
    .toEqual([])
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Order #999999', exact: true })).toBeVisible()
  assert.equal(
    await page.evaluate(() =>
      Object.keys(localStorage).some((key) => key.startsWith('entertainment-guild.delivery.v2.')),
    ),
    true,
  )
  await page.screenshot({
    path: 'test-results/checkout-confirmation-fixture-updated.png',
    fullPage: true,
  })
  assert.equal(confirmRequests, 1, 'Confirmation refresh must only read the existing result')
  assert.ok(messages.every((message) => !message.includes('4242424242424242')))
  // Use the ordinary navigation link: a completed attempt must not trap later purchases
  // on the old receipt, even when the customer skips the confirmation's dedicated button.
  await page.getByRole('link', { name: 'Continue shopping', exact: true }).click()
  await page.goto(base + '/products/2?item=2')
  await page.getByRole('button', { name: 'Add to cart', exact: true }).click()
  await page.getByRole('link', { name: 'View cart', exact: true }).click()
  await page.getByRole('link', { name: 'Proceed to checkout', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Customer and delivery details' })).toBeVisible()
  assert.equal(confirmRequests, 1, 'Starting another cart must not resubmit the previous order')
  await expect(page.getByLabel('Street address', { exact: true })).toHaveValue('12 Test Street')
  await page.getByRole('button', { name: 'Continue to payment', exact: true }).click()
  await page.getByLabel('Cardholder name', { exact: true }).fill('Test Customer')
  await page.getByLabel('Card number', { exact: true }).fill('4242424242424242')
  await page.getByLabel('Expiry (MM/YY)', { exact: true }).fill('12/30')
  await page.getByLabel('Security code (CVC)', { exact: true }).fill('123')
  await page.getByRole('button', { name: 'Review order', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Review your order', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: /Pay .* AUD/ })).toBeVisible()
  assert.equal(confirmRequests, 1, 'A signed-in customer must still explicitly pay each new order')
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Customer and delivery details' })).toBeVisible()
  await expect(page.getByRole('button', { name: /Pay .* AUD/ })).toHaveCount(0)
  assert.equal(confirmRequests, 1, 'Refreshing an unpaid review must never submit an order')
  await page.getByRole('button', { name: 'Menu', exact: true }).click()
  await page.getByRole('button', { name: 'Sign out', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible()
  assert.equal(JSON.parse(await page.evaluate((k) => localStorage.getItem(k), cartKey)).length, 1)
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
  await page.screenshot({ path: 'test-results/login-mobile.png', fullPage: true })
  await page.route(api + '/me', (route) =>
    route.fulfill({ status: 503, json: { error: 'Unavailable' } }),
  )
  await page.reload()
  await expect(page.getByRole('alert')).toContainText('Unavailable')
  await page.unroute(api + '/me')
  await page.getByRole('button', { name: 'Try again', exact: true }).click()
  await expect(page.getByRole('alert')).toHaveCount(0)
  await login()
  await expect(page.getByLabel('Street address', { exact: true })).toHaveValue('12 Test Street')
  const nextTab = await context.newPage()
  await nextTab.goto(base + '/checkout')
  await expect(nextTab.getByLabel('Street address', { exact: true })).toHaveValue('12 Test Street')
  await expect(nextTab.getByRole('button', { name: /Pay .* AUD/ })).toHaveCount(0)
  await nextTab.close()
  await page.getByRole('button', { name: 'Forget saved delivery details', exact: true }).click()
  await expect(page.getByLabel('Street address', { exact: true })).toHaveValue('')
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Customer and delivery details' })).toBeVisible()
  await page.goto(base + '/missing?q=book')
  await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible()
  await page.getByRole('link', { name: 'Browse the collection' }).click()
  assert.equal(new URL(page.url()).search, '?q=book')
  console.log(
    'PASS: actual missing-cookie 401 reopens sign-in; cart retained; simulated confirm 401 preserves retry draft; login never resubmits; fixture confirmation refresh is read-only; no raw card in browser storage/console. All confirm calls intercepted; no live order/stock writes.',
  )
} finally {
  await browser.close()
}
