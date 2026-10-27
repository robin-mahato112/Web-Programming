import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import { chromium, expect } from '@playwright/test'

// Explicit isolated-only opt-in: this test retains one new patron, never an order.
const base = process.env.REVIEW_URL
const api = process.env.COURSE_API_URL
if (
  base !== 'http://localhost:3002' ||
  api !== 'http://localhost:13002' ||
  process.env.COURSE_REGISTRATION_WRITES !== '1'
)
  throw new Error(
    'Registration testing requires isolated 3002/13002 and COURSE_REGISTRATION_WRITES=1.',
  )
const account = {
  name: 'Registration Customer',
  email: `registration.${randomBytes(6).toString('hex')}@example.test`,
  password: randomBytes(18).toString('base64url'),
}
await mkdir('test-results', { recursive: true })
await writeFile('test-results/registered-customer.local.json', JSON.stringify(account), {
  mode: 0o600,
})
const browser = await chromium.launch({ channel: 'msedge', headless: true })
const context = await browser.newContext()
const page = await context.newPage()
let creates = 0,
  payments = 0
page.on('request', (request) => {
  if (request.url() === api + '/api/inft3050/Patrons' && request.method() === 'POST') creates++
})
await page.route(api + '/api/checkout/confirm', (route) => {
  payments++
  return route.abort()
})
try {
  await page.goto(base + '/login?returnTo=%2Fcheckout%3Fq%3Dbook')
  await page
    .locator('.auth-panel')
    .getByRole('link', { name: 'Create account', exact: true })
    .click()
  await expect(page.getByRole('heading', { name: 'Create account', exact: true })).toBeVisible()
  await page.getByLabel('Full name', { exact: true }).fill(account.name)
  await page.getByLabel('Email address', { exact: true }).fill(account.email)
  await page.getByLabel('Password', { exact: true }).fill(account.password)
  await page.getByLabel('Confirm password', { exact: true }).fill('different-password')
  await page.getByRole('button', { name: 'Create account', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('Passwords do not match')
  assert.equal(creates, 0)
  await page.getByLabel('Password', { exact: true }).fill(account.password)
  await page.getByLabel('Confirm password', { exact: true }).fill(account.password)
  await page.getByRole('button', { name: 'Create account', exact: true }).click()
  await expect(page).toHaveURL(base + '/checkout?q=book')
  await expect(page.getByText('Your cart is empty. Add an item before checking out.')).toBeVisible()
  assert.equal(creates, 1)
  assert.equal(payments, 0)
  const lookup = await context.request.get(
    api + '/patronLookup?email=' + encodeURIComponent(account.email),
  )
  assert.equal(lookup.status(), 200)
  assert.equal((await lookup.json()).Name, account.name)
  await page.getByRole('button', { name: 'Sign out', exact: true }).click()
  await page
    .locator('.auth-panel')
    .getByRole('link', { name: 'Create account', exact: true })
    .click()
  await page.getByLabel('Full name', { exact: true }).fill(account.name)
  await page.getByLabel('Email address', { exact: true }).fill(account.email)
  await page.getByLabel('Password', { exact: true }).fill(account.password)
  await page.getByLabel('Confirm password', { exact: true }).fill(account.password)
  await page.getByRole('button', { name: 'Create account', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('Sign in instead')
  assert.equal(creates, 1, 'Duplicate registration must not create another row')
  for (const width of [800, 390]) {
    await page.setViewportSize({ width, height: 844 })
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
  }
  await page.screenshot({ path: 'test-results/registration-mobile.png', fullPage: true })
  await page.locator('.auth-panel').getByRole('link', { name: 'Sign in', exact: true }).click()
  await page.getByLabel('Email address', { exact: true }).fill(account.email)
  await page.getByLabel('Password', { exact: true }).fill(account.password)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page).toHaveURL(base + '/checkout?q=book')
  const storage = await page.evaluate(() => JSON.stringify({ ...localStorage, ...sessionStorage }))
  assert.ok(!storage.includes(account.password))
  assert.equal(payments, 0)
  console.log(
    'PASS: isolated patron created through the website; mismatch and duplicate blocked; sign-in/return destination/mobile verified; password not stored; no purchase sent.',
  )
} finally {
  await browser.close()
}
