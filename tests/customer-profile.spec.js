import { test, expect } from '@playwright/test'

async function fixture(page) {
  const model = { name: 'Profile Customer', email: 'profile@example.test', writes: [], fail: false }
  await page.route('**/backend/**', async (route) => {
    const path = new URL(route.request().url()).pathname.replace('/backend', '')
    if (path === '/me')
      return route.fulfill({ json: { id: 201, role: 'PATRON', email: model.email } })
    if (path === '/api/inft3050/Patrons/201')
      return route.fulfill({ json: { UserID: 201, Name: model.name, Email: model.email } })
    if (path === '/api/customer/profile') {
      const body = route.request().postDataJSON()
      model.writes.push(body)
      if (model.fail)
        return route.fulfill({
          status: 409,
          json: { error: 'That email address is already in use.' },
        })
      model.name = body.name
      model.email = body.email
      return route.fulfill({
        json: { userId: 201, name: model.name, email: model.email, role: 'customer' },
      })
    }
    if (path === '/api/inft3050/TO')
      return route.fulfill({
        json: {
          list: [
            {
              CustomerID: 301,
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
  return model
}
test('customer edits identity, confirms password and keeps delivery/history controls', async ({
  page,
}) => {
  const model = await fixture(page)
  await page.getByRole('button', { name: 'Edit account details', exact: true }).click()
  await page.getByLabel('Full name', { exact: true }).fill('Updated Customer')
  await page.getByLabel('Email address', { exact: true }).fill('updated@example.test')
  await page.getByRole('button', { name: 'Save account details', exact: true }).click()
  await expect(page.getByLabel('Current password', { exact: true })).toBeFocused()
  expect(model.writes).toHaveLength(0)
  await page.getByLabel('Current password', { exact: true }).fill('TestPassword123')
  await page.getByRole('button', { name: 'Save account details', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Hello, Updated Customer' })).toBeVisible()
  await expect(page.getByText('Account details saved.', { exact: false })).toBeVisible()
  await expect(page.getByLabel('Street address')).toHaveValue('10 Test Road')
  await expect(page.getByRole('button', { name: 'View order history' })).toBeVisible()
  expect(model.writes[0]).toEqual({
    name: 'Updated Customer',
    email: 'updated@example.test',
    currentPassword: 'TestPassword123',
  })
  expect(
    await page.evaluate(() => JSON.stringify({ ...localStorage, ...sessionStorage })),
  ).not.toContain('TestPassword123')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Hello, Updated Customer' })).toBeVisible()
})
test('duplicate email errors retain form values, clear password and cancel discards edits', async ({
  page,
}) => {
  const model = await fixture(page)
  model.fail = true
  await page.getByRole('button', { name: 'Edit account details', exact: true }).click()
  await page.getByLabel('Email address', { exact: true }).fill('used@example.test')
  await page.getByLabel('Current password', { exact: true }).fill('TestPassword123')
  await page.getByRole('button', { name: 'Save account details', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('already in use')
  await expect(page.getByLabel('Current password', { exact: true })).toHaveValue('')
  await expect(page.getByLabel('Email address', { exact: true })).toHaveValue('used@example.test')
  await page.getByRole('button', { name: 'Cancel', exact: true }).click()
  await page.getByRole('button', { name: 'Edit account details', exact: true }).click()
  await expect(page.getByLabel('Email address', { exact: true })).toHaveValue(
    'profile@example.test',
  )
  await expect(page.getByLabel('Street address')).toHaveValue('10 Test Road')
})
test('email recovery validates before sending, explains local capture and reports unavailable transport', async ({
  page,
}) => {
  let sends = 0
  let status = 200
  await page.route('**/backend/**', async (route) => {
    const path = new URL(route.request().url()).pathname
    if (path.endsWith('/api/customer/recovery'))
      return route.fulfill({ json: { enabled: true, delivery: 'local' } })
    if (path.endsWith('/requestPasswordReset')) {
      sends++
      expect(route.request().headers()['x-customer-request']).toBe('1')
      return route.fulfill({
        status,
        json:
          status === 200
            ? { ok: true, message: 'If an account matches, check your inbox for a reset code.' }
            : { error: 'Mail unavailable' },
      })
    }
    return route.fulfill({ status: path.endsWith('/me') ? 401 : 200, json: { list: [] } })
  })
  await page.goto('/forgot-password')
  await expect(page.getByText('Demo mode:', { exact: false })).toBeVisible()
  await page.getByRole('button', { name: 'Send reset code' }).click()
  await expect(page.getByLabel('Account email')).toBeFocused()
  expect(sends).toBe(0)
  await page.getByLabel('Account email').fill('customer@example.test')
  await page.getByRole('button', { name: 'Send reset code' }).click()
  await expect(page.getByRole('status')).toContainText('If an account matches')
  expect(sends).toBe(1)
  status = 503
  await page.getByRole('button', { name: 'Send reset code' }).click()
  await expect(page.getByRole('alert')).toContainText('unavailable')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})
