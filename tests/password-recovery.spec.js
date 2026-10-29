import { test, expect } from '@playwright/test'

const token = 'a'.repeat(64)
async function setup(page, options = {}) {
  const model = { requests: [], status: 200, ...options }
  await page.route('**/backend/**', async (route) => {
    const path = new URL(route.request().url()).pathname
    if (path.endsWith('/resetPassword')) {
      model.requests.push(route.request().postDataJSON())
      if (model.wait) await model.wait
      return route.fulfill({
        status: model.status,
        json: model.status === 200 ? { ok: true } : { error: 'Invalid or expired token' },
      })
    }
    return route.fulfill({
      status: path.endsWith('/me') ? 401 : 200,
      json: path.endsWith('/me') ? { error: 'Not signed in' } : { list: [] },
    })
  })
  await page.goto('/forgot-password?returnTo=' + encodeURIComponent('/checkout'))
  return model
}
async function fill(page) {
  await page.getByLabel('Reset code', { exact: true }).fill(token)
  await page.getByLabel('New password', { exact: true }).fill('NewPassword123')
  await page.getByLabel('Confirm password', { exact: true }).fill('NewPassword123')
}

test('recovery validates fields, shows passwords and submits once', async ({ page }, testInfo) => {
  let release
  const wait = new Promise((resolve) => {
    release = resolve
  })
  const model = await setup(page, { wait })
  const submit = page.getByRole('button', { name: 'Change password', exact: true })
  await submit.click()
  await expect(page.getByLabel('Reset code', { exact: true })).toBeFocused()
  await fill(page)
  await page.getByLabel('New password', { exact: true }).fill('abcdefgh')
  await submit.click()
  await expect(page.getByLabel('New password', { exact: true })).toBeFocused()
  await expect(page.getByLabel('New password', { exact: true })).toHaveAttribute(
    'aria-invalid',
    'true',
  )
  await page.getByLabel('New password', { exact: true }).fill('NewPassword123')
  await page.getByLabel('Confirm password', { exact: true }).fill('Different123')
  await submit.click()
  await expect(page.getByLabel('Confirm password', { exact: true })).toBeFocused()
  expect(model.requests).toHaveLength(0)
  await fill(page)
  for (const label of ['new password', 'confirm password']) {
    await page.getByRole('button', { name: 'Show ' + label, exact: true }).click()
    const button = page.getByRole('button', { name: 'Hide ' + label, exact: true })
    await expect(button).toHaveAttribute('aria-pressed', 'true')
    const input = page.getByLabel(label[0].toUpperCase() + label.slice(1), { exact: true })
    await expect(input).toHaveAttribute('type', 'text')
    const inputBox = await input.boundingBox()
    const buttonBox = await button.boundingBox()
    expect(buttonBox.y).toBeGreaterThanOrEqual(inputBox.y)
    expect(buttonBox.y + buttonBox.height).toBeLessThanOrEqual(inputBox.y + inputBox.height)
    await button.click()
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.screenshot({ path: testInfo.outputPath('recovery.png'), fullPage: true })
  await submit.click()
  await expect(page.getByLabel('Reset code', { exact: true })).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Show new password' })).toBeDisabled()
  await expect.poll(() => model.requests.length).toBe(1)
  release()
  await expect(page.getByRole('status')).toContainText('Your password has been changed')
  await expect(page.getByLabel('Reset code', { exact: true })).toHaveCount(0)
  expect(model.requests[0]).toEqual({ token, password: 'NewPassword123' })
  expect(
    await page.evaluate(() => JSON.stringify({ ...localStorage, ...sessionStorage })),
  ).not.toContain(token)
  expect(page.url()).not.toContain(token)
  await page.getByRole('link', { name: 'Back to sign in' }).click()
  await expect(page).toHaveURL('/login?returnTo=%2Fcheckout')
})

test('expired reset code clears passwords and supports a retry without claiming success', async ({
  page,
}) => {
  const model = await setup(page, { status: 401 })
  await fill(page)
  await page.getByRole('button', { name: 'Change password', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('Invalid or expired token')
  await expect(page.getByLabel('New password', { exact: true })).toHaveValue('')
  await expect(page.getByLabel('Confirm password', { exact: true })).toHaveValue('')
  await expect(page.getByLabel('Reset code', { exact: true })).toHaveValue(token)
  model.status = 200
  await fill(page)
  await page.getByRole('button', { name: 'Change password', exact: true }).click()
  await expect(page.getByRole('status')).toContainText('Your password has been changed')
  expect(model.requests).toHaveLength(2)
})
