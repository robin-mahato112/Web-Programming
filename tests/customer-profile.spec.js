import { test, expect } from '@playwright/test'

const token = 'b'.repeat(64)
async function profileFixture(page) {
  const requests = []
  await page.route('**/backend/**', async (route) => {
    const request = route.request()
    const path = new URL(request.url()).pathname.replace('/backend', '')
    requests.push({ path, method: request.method() })
    if (path === '/me')
      return route.fulfill({ json: { id: 201, role: 'PATRON', email: 'profile@example.test' } })
    if (path === '/api/inft3050/Patrons/201')
      return route.fulfill({
        json: { UserID: 201, Name: 'Profile Customer', Email: 'profile@example.test' },
      })
    if (path === '/api/inft3050/TO')
      return route.fulfill({
        json: {
          list: [
            {
              CustomerID: 301,
              PatronId: 201,
              PhoneNumber: '0412345678',
              StreetAddress: '10 Test Road',
              Suburb: 'Darwin',
              State: 'NT',
              PostCode: 800,
            },
          ],
        },
      })
    return route.fulfill({ json: { list: [] } })
  })
  await page.goto('/account')
  await expect(page.getByRole('heading', { name: 'Hello, Profile Customer' })).toBeVisible()
  return requests
}

test('course profile keeps name/email read-only and preserves delivery and history controls', async ({
  page,
}) => {
  const requests = await profileFixture(page)
  await expect(page.getByText('profile@example.test', { exact: true })).toBeVisible()
  await expect(page.getByText('Name and email are read-only.', { exact: false })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Edit account details', exact: true })).toHaveCount(
    0,
  )
  await expect(page.getByLabel('Current password', { exact: true })).toHaveCount(0)
  await expect(page.getByLabel('Street address')).toHaveValue('10 Test Road')
  await expect(page.getByRole('button', { name: 'Save delivery details' })).toBeVisible()
  await page.getByLabel('Street address').fill('Unsaved address')
  await page.getByRole('button', { name: 'Reset', exact: true }).click()
  await expect(page.getByLabel('Street address')).toHaveValue('10 Test Road')
  await page.getByRole('button', { name: 'View order history' }).click()
  await expect(page.getByRole('button', { name: 'Edit account details', exact: true })).toHaveCount(
    0,
  )
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Hello, Profile Customer' })).toBeVisible()
  expect(requests.some(({ path }) => path.startsWith('/api/customer/'))).toBe(false)
  expect(requests.every(({ method }) => method === 'GET')).toBe(true)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})

async function recoveryFixture(page, response = { ok: true, token, expiresIn: '15 minutes' }) {
  const model = { requests: [], resets: [], response, status: 200, wait: null }
  await page.route('**/backend/**', async (route) => {
    const path = new URL(route.request().url()).pathname.replace('/backend', '')
    model.requests.push(path)
    if (path === '/requestPasswordReset') {
      model.email = route.request().postDataJSON().email
      expect(route.request().headers()['x-customer-request']).toBeUndefined()
      if (model.wait) await model.wait
      return route.fulfill({ status: model.status, json: model.response })
    }
    if (path === '/resetPassword') {
      model.resets.push(route.request().postDataJSON())
      return route.fulfill({ json: { ok: true } })
    }
    return route.fulfill({ status: path === '/me' ? 401 : 404, json: { error: 'Not available' } })
  })
  await page.goto('/forgot-password')
  return model
}

test('original development API drives the simulated email and actual password reset request', async ({
  page,
}) => {
  const model = await recoveryFixture(page)
  await expect(
    page.getByText('Email delivery is simulated for this course demonstration.', { exact: false }),
  ).toBeVisible()
  await page.getByLabel('Account email').fill('customer..legacy@example.test')
  await page.getByRole('button', { name: 'Send reset code' }).click()
  await expect(page.getByRole('status')).toContainText('Email sent (simulation)')
  await expect(page.getByText(token, { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Use this code' }).click()
  await expect(page.getByLabel('Reset code', { exact: true })).toHaveValue(token)
  await page.getByLabel('New password', { exact: true }).fill('NewPassword123')
  await page.getByLabel('Confirm password', { exact: true }).fill('NewPassword123')
  await page.getByRole('button', { name: 'Change password', exact: true }).click()
  await expect(page.getByRole('status')).toContainText('Your password has been changed')
  expect(model.email).toBe('customer..legacy@example.test')
  expect(model.resets).toEqual([{ token, password: 'NewPassword123' }])
  expect(model.requests).not.toContain('/api/customer/recovery')
  expect(
    await page.evaluate(() => JSON.stringify({ ...localStorage, ...sessionStorage })),
  ).not.toContain(token)
  expect(page.url()).not.toContain(token)
  await expect(page.getByText(token, { exact: true })).toHaveCount(0)
})

test('missing development token does not invent a code or claim real email delivery', async ({
  page,
}) => {
  const model = await recoveryFixture(page, {
    ok: true,
    message: 'If the email exists, a password reset link has been sent',
  })
  await page.getByLabel('Account email').fill('unknown@example.test')
  await page.getByRole('button', { name: 'Send reset code' }).click()
  await expect(page.getByRole('status')).toContainText('No reset code is available')
  await expect(page.getByRole('button', { name: 'Use this code' })).toHaveCount(0)
  await expect(page.getByLabel('Reset code', { exact: true })).toHaveValue('')
  expect(model.resets).toEqual([])
})

test('new requests clear stale codes, lock competing submissions and expose backend errors', async ({
  page,
}) => {
  const model = await recoveryFixture(page)
  await page.getByRole('button', { name: 'Send reset code' }).click()
  await expect(page.getByLabel('Account email')).toBeFocused()
  expect(model.requests).not.toContain('/requestPasswordReset')
  await page.getByLabel('Account email').fill('customer@example.test')
  await page.getByRole('button', { name: 'Send reset code' }).click()
  await page.getByRole('button', { name: 'Use this code' }).click()
  await page.getByLabel('Account email').fill('second@example.test')
  await expect(page.getByText(token, { exact: true })).toHaveCount(0)
  await expect(page.getByLabel('Reset code', { exact: true })).toHaveValue('')
  let release
  model.wait = new Promise((resolve) => {
    release = resolve
  })
  model.status = 503
  model.response = { error: 'Private SQL failure' }
  await page.getByRole('button', { name: 'Send reset code' }).click()
  await expect(page.getByRole('button', { name: 'Change password', exact: true })).toBeDisabled()
  await expect(page.getByLabel('Account email')).toBeDisabled()
  release()
  await expect(page.getByRole('alert')).toContainText('unavailable')
  await expect(page.getByRole('alert')).not.toContainText('Private SQL')
  await expect(page.getByRole('button', { name: 'Use this code' })).toHaveCount(0)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})
