import assert from 'node:assert/strict'
import { chromium, expect } from '@playwright/test'

// Mock only account responses: navigation and validation must never reset a real password.
const base = process.env.REVIEW_URL || 'http://localhost:3002'
const api = process.env.COURSE_API_URL || 'http://localhost:13002'
const browser = await chromium.launch({ channel: 'msedge', headless: true })
const context = await browser.newContext()
let resets = 0
await context.route(api + '/me', (route) =>
  route.fulfill({ status: 401, json: { error: 'Unauthorized' } }),
)
await context.route(api + '/requestPasswordReset', () => {
  throw new Error('The website must not expose development reset tokens.')
})
await context.route(api + '/resetPassword', (route) => {
  resets++
  assert.equal(route.request().method(), 'POST')
  assert.deepEqual(route.request().postDataJSON(), {
    token: 'a'.repeat(64),
    password: 'fixture-password',
  })
  return route.fulfill(
    resets === 1
      ? { status: 401, json: { error: 'Invalid or expired token' } }
      : { json: { ok: true } },
  )
})
const page = await context.newPage()
try {
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 850 })
    await page.goto(base + '/login?returnTo=%2Fcheckout%3Fq%3Dbook')
    await expect(
      page.locator('.auth-panel').getByRole('button', { name: 'Sign in', exact: true }),
    ).toBeVisible()
    assert.equal(
      await page.locator('header').getByRole('link', { name: 'Create account' }).count(),
      0,
    )
    await page
      .locator('.auth-panel')
      .getByRole('link', { name: 'Create account', exact: true })
      .click()
    await expect(page.getByRole('heading', { name: 'Create account' })).toBeVisible()
    await page.locator('.auth-panel').getByRole('link', { name: 'Sign in', exact: true }).click()
    await page.getByRole('link', { name: 'Forgot password?' }).click()
    await expect(page.getByRole('heading', { name: 'Forgot password?' })).toBeVisible()
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
    await page.getByRole('link', { name: 'Back to sign in' }).click()
    assert.equal(new URL(page.url()).searchParams.get('returnTo'), '/checkout?q=book')
  }
  await page.getByRole('link', { name: 'Forgot password?' }).click()
  await page.getByLabel('Reset code', { exact: true }).fill('a'.repeat(64))
  await page.getByLabel('New password', { exact: true }).fill('fixture-password')
  await page.getByLabel('Confirm password', { exact: true }).fill('different-password')
  await page.getByRole('button', { name: 'Change password' }).click()
  await expect(page.getByRole('alert')).toHaveText('Passwords do not match.')
  assert.equal(resets, 0)
  for (let attempt = 0; attempt < 2; attempt++) {
    await page.getByLabel('New password', { exact: true }).fill('fixture-password')
    await page.getByLabel('Confirm password', { exact: true }).fill('fixture-password')
    await page.getByRole('button', { name: 'Change password' }).click()
    if (attempt === 0) await expect(page.getByRole('alert')).toHaveText('Invalid or expired token')
    else await expect(page.getByRole('status')).toContainText('Your password has been changed.')
  }
  assert.equal(resets, 2)
  const storage = await page.evaluate(() => JSON.stringify([localStorage, sessionStorage]))
  assert.ok(!storage.includes('fixture-password') && !storage.includes('a'.repeat(64)))
  console.log(
    'PASS: desktop/mobile account navigation; reset validation, rejection and retry (mock API, no database writes).',
  )
} finally {
  await browser.close()
}
