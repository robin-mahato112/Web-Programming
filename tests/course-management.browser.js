import { chromium, expect } from '@playwright/test'
import assert from 'node:assert/strict'

const base = process.env.REVIEW_URL || 'http://localhost:3002'
const api = process.env.COURSE_API_URL || 'http://localhost:13002'
const username = process.env.TEST_ADMIN_USERNAME,
  password = process.env.TEST_ADMIN_PASSWORD
if (!username || !password) throw new Error('Supply private administrator credentials.')
const browser = await chromium.launch({ channel: 'msedge', headless: true })
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
const page = await context.newPage(),
  errors = []
page.on('pageerror', (error) => errors.push(error.message))
// No management mutations are forwarded by this read-only UI check.
await context.route(api + '/**', (route) => {
  const request = route.request(),
    path = new URL(request.url()).pathname
  if (request.method() !== 'GET' && !['/login', '/logout'].includes(path)) return route.abort()
  return route.continue()
})
try {
  await page.goto(base + '/admin/login')
  await page.getByLabel('Username', { exact: true }).fill(username)
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page).toHaveURL(/\/admin$/)
  await expect(page.getByRole('heading', { name: /Welcome,/ })).toBeVisible()
  await page.getByRole('link', { name: 'Product management', exact: true }).click()
  await expect(page.locator('.product-table tbody tr').first()).toBeVisible()
  await page.screenshot({ path: 'test-results/integrated-admin-products.png', fullPage: true })
  await page.getByRole('link', { name: 'User management', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'User management', exact: true })).toBeVisible()
  await expect(page.getByRole('alert')).toHaveCount(0)
  await page.goto(base + '/admin/stock')
  await expect(page.getByRole('heading', { name: 'Manage stock', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: /^Edit / }).first()).toBeVisible()
  await page.setViewportSize({ width: 390, height: 844 })
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
  await page.screenshot({ path: 'test-results/integrated-admin-mobile.png', fullPage: false })
  await page.goto(base + '/checkout')
  await expect(page.getByRole('heading', { name: 'Customer account required' })).toBeVisible()
  await expect(page.getByLabel('Card number')).toHaveCount(0)
  assert.deepEqual(errors, [])
  console.log(
    'PASS: real admin login, dashboard, product/user/stock pages, mobile layout and staff checkout denial. No data writes.',
  )
} finally {
  await browser.close()
}
