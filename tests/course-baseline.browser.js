import assert from 'node:assert/strict'
import { readFile, writeFile } from 'node:fs/promises'
import { chromium, expect } from '@playwright/test'

if (process.env.CUSTOMER_ISOLATED_WRITE_TEST !== 'yes')
  throw new Error('Explicit isolated test opt-in required.')
const fixturePath = '.cache/course-baseline.local/browser-fixture.json'
const fixture = JSON.parse(await readFile(fixturePath))
const browser = await chromium.launch({ channel: 'msedge', headless: true })
const page = await browser.newPage({ viewport: { width: 1365, height: 1000 } })
const errors = []
const customRequests = []
page.on('pageerror', (error) => errors.push(error.message))
page.on('request', (request) => {
  if (new URL(request.url()).pathname.startsWith('/api/customer/'))
    customRequests.push(request.url())
})
async function signIn(password) {
  await page.goto('http://localhost:3003/login')
  await page.getByLabel('Email address', { exact: true }).fill(fixture.email)
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page.getByRole('heading', { name: /^Hello,/ })).toBeVisible()
}
try {
  await signIn(fixture.password)
  await expect(page.getByText('Name and email are read-only.', { exact: false })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Edit account details', exact: true })).toHaveCount(
    0,
  )
  await page.getByLabel('Street address').fill('3 Browser Test Road')
  await page.getByRole('button', { name: 'Save delivery details' }).click()
  await expect(page.getByText('Delivery details saved.', { exact: true })).toBeVisible()
  await page.reload()
  await expect(page.getByLabel('Street address')).toHaveValue('3 Browser Test Road')
  await page.getByRole('button', { name: 'View order history', exact: true }).click()
  await expect(
    page.getByRole('heading', { name: 'Order #' + fixture.orderId, exact: true }),
  ).toBeVisible()
  await page
    .getByRole('button', { name: 'View items for order #' + fixture.orderId, exact: true })
    .click()
  await expect(page.getByText('Account Test Book', { exact: true })).toBeVisible()
  await page.screenshot({ path: 'test-results/course-baseline-profile.png', fullPage: true })
  await page.getByRole('button', { name: 'Sign out', exact: true }).click()
  await page.goto('http://localhost:3003/forgot-password')
  await page.getByLabel('Account email').fill(fixture.email)
  await page.getByRole('button', { name: 'Send reset code' }).click()
  await expect(page.getByRole('status')).toContainText('Email sent (simulation)')
  await page.getByRole('button', { name: 'Use this code' }).click()
  const code = await page.getByLabel('Reset code', { exact: true }).inputValue()
  assert.match(code, /^[a-f0-9]{64}$/)
  await page.setViewportSize({ width: 390, height: 844 })
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
  await page.getByLabel('New password', { exact: true }).fill(fixture.nextPassword)
  await page.getByLabel('Confirm password', { exact: true }).fill(fixture.nextPassword)
  await page.getByRole('button', { name: 'Change password', exact: true }).click()
  await expect(page.getByRole('status')).toContainText('Your password has been changed')
  await page.screenshot({ path: 'test-results/course-baseline-recovery.png', fullPage: true })
  await writeFile(
    fixturePath,
    JSON.stringify({
      ...fixture,
      password: fixture.nextPassword,
      nextPassword: fixture.nextPassword + 'Next1',
    }),
  )
  await signIn(fixture.nextPassword)
  const storage = await page.evaluate(() => JSON.stringify({ ...localStorage, ...sessionStorage }))
  assert.ok(!storage.includes(fixture.nextPassword) && !storage.includes(code))
  assert.deepEqual(customRequests, [])
  assert.deepEqual(errors, [])
  console.log(
    'PASS original-API browser: read-only name/email, delivery save/reload, order/items, simulated email, real reset and new-password sign-in, mobile layout; no custom account endpoint, secret storage or browser exception.',
  )
} finally {
  await browser.close()
}
