import assert from 'node:assert/strict'
import { readFile, writeFile } from 'node:fs/promises'
import { chromium, expect } from '@playwright/test'

if (process.env.CUSTOMER_ISOLATED_WRITE_TEST !== 'yes')
  throw new Error('Explicit isolated test opt-in required.')
const fixturePath = '.cache/account-verification.local/browser-fixture.json'
const fixture = JSON.parse(await readFile(fixturePath))
const browser = await chromium.launch({ channel: 'msedge', headless: true })
const page = await browser.newPage({ viewport: { width: 1365, height: 1000 } })
const errors = []
page.on('pageerror', (error) => errors.push(error.message))
async function signIn(password) {
  await page.goto('http://localhost:3002/login')
  await page.getByLabel('Email address', { exact: true }).fill(fixture.email)
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page.getByRole('heading', { name: /^Hello,/ })).toBeVisible()
}
try {
  await signIn(fixture.password)
  await page.getByRole('button', { name: 'View order history', exact: true }).click()
  await expect(
    page.getByRole('heading', { name: 'Order #' + fixture.orderId, exact: true }),
  ).toBeVisible()
  await page
    .getByRole('button', { name: 'View items for order #' + fixture.orderId, exact: true })
    .click()
  await expect(page.getByText('Account Test Book', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Edit account details', exact: true }).click()
  await page.getByLabel('Full name', { exact: true }).fill('Browser Verified Customer')
  await page.getByLabel('Current password', { exact: true }).fill(fixture.password)
  await page.getByRole('button', { name: 'Save account details', exact: true }).click()
  await expect(
    page.getByRole('heading', { name: 'Hello, Browser Verified Customer' }),
  ).toBeVisible()
  await expect(page.getByRole('status').filter({ hasText: 'Account details saved' })).toBeVisible()
  await page.reload()
  await expect(
    page.getByRole('heading', { name: 'Hello, Browser Verified Customer' }),
  ).toBeVisible()
  await page.screenshot({ path: 'test-results/customer-live-profile.png', fullPage: true })
  await page.getByRole('button', { name: 'Sign out', exact: true }).click()
  await page.goto('http://localhost:3002/forgot-password')
  await expect(page.getByText('Demo mode:', { exact: false })).toBeVisible()
  await page.getByLabel('Account email').fill(fixture.email)
  await page.getByRole('button', { name: 'Send reset code' }).click()
  await expect(page.getByRole('status')).toContainText('If an account matches')
  const message = await (await fetch('http://localhost:18025/api/v1/message/latest')).json()
  assert.equal(message.To[0].Address, fixture.email)
  const code = message.Text.match(/\b[a-f0-9]{64}\b/)[0]
  const changedPassword = fixture.password + 'Ui1'
  await page.getByLabel('Reset code', { exact: true }).fill(code)
  await page.getByLabel('New password', { exact: true }).fill(changedPassword)
  await page.getByLabel('Confirm password', { exact: true }).fill(changedPassword)
  await page.getByRole('button', { name: 'Change password', exact: true }).click()
  await expect(page.getByRole('status')).toContainText('Your password has been changed')
  await page.screenshot({ path: 'test-results/customer-live-recovery.png', fullPage: true })
  await signIn(changedPassword)
  await writeFile(fixturePath, JSON.stringify({ ...fixture, password: changedPassword }))
  await page.setViewportSize({ width: 390, height: 844 })
  await page.getByRole('button', { name: 'Edit account details', exact: true }).click()
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
  await page.screenshot({ path: 'test-results/customer-live-mobile.png', fullPage: true })
  const storage = await page.evaluate(() => JSON.stringify({ ...localStorage, ...sessionStorage }))
  assert.ok(!storage.includes(changedPassword) && !storage.includes(code))
  assert.deepEqual(errors, [])
  console.log(
    'PASS live desktop/mobile: SQL order items, profile save/refresh, real SMTP capture, password reset, new login; no mocks, browser exceptions or secret storage.',
  )
} finally {
  await browser.close()
}
