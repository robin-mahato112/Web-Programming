import { test, expect } from '@playwright/test'

// Deterministic API contract fixtures, not evidence of a live database connection.
const customer = { id: 201, email: 'customer@example.test', username: 'Test Customer', role: 'PATRON' }
const contact = { CustomerID: 301, PhoneNumber: '0412345678', StreetAddress: '10 Test Street', Suburb: 'Darwin', State: 'NT', PostCode: 800 }

const browserErrors = new WeakMap()
test.beforeEach(async ({ page }) => {
  const errors = []
  browserErrors.set(page, errors)
  page.on('pageerror', error => errors.push(error.message))
})
test.afterEach(async ({ page }) => {
  expect(browserErrors.get(page), 'No uncaught browser errors').toEqual([])
})

async function backend(page, options = {}) {
  const model = { user: null, contact: { ...contact }, requests: [], ...options }
  await page.route('**/backend/**', async route => {
    const request = route.request()
    const path = new URL(request.url()).pathname.replace('/backend', '')
    const method = request.method()
    const body = request.postDataJSON()
    model.requests.push({ path, method, body })
    const reply = (data, status = 200) => route.fulfill({ status, json: data })
    if (path === '/me') return model.unavailable ? reply({ error: 'Service unavailable' }, 503)
      : model.user ? reply(model.user) : reply({ error: 'Not signed in' }, 401)
    if (path === '/patronLogin') {
      if (model.badPassword) return reply({ error: 'Invalid credentials' }, 401)
      model.user = { ...customer }
      return reply(model.user)
    }
    if (path === '/login') {
      model.user = { id: 10, role: model.staffRole || 'STAFF', username: 'Test Staff', email: 'staff@example.test' }
      return reply(model.user)
    }
    if (path === '/logout') {
      if (model.logoutFailure) return reply({ error: 'Service unavailable' }, 503)
      model.user = null
      return reply({ ok: true })
    }
    if (path === '/patronLookup') return model.duplicate ? reply({ UserID: 201 }) : reply({ error: 'Not found' }, 404)
    if (path === '/api/inft3050/Patrons' && method === 'POST') return reply({ UserID: 201, Name: body.Name, Email: body.Email }, 201)
    if (/\/Patrons\/\d+$/.test(path)) return reply({ UserID: model.user?.id, Name: model.user?.username, Email: model.user?.email })
    if (path === '/api/inft3050/User') return reply({ list: [{ UserID: 10, Name: 'Test Staff', UserName: 'staff', Email: 'staff@example.test' }] })
    if (/\/TO(?:\/\d+)?$/.test(path)) {
      if (model.expired) { model.user = null; return reply({ error: 'Invalid or expired token' }, 401) }
      if (method === 'GET') return reply({ list: model.contact ? [model.contact] : [] })
      if (model.saveFailure) return reply({ error: 'Service unavailable' }, 503)
      if (model.delaySave) await new Promise(resolve => setTimeout(resolve, 300))
      model.contact = { ...model.contact, ...body, CustomerID: 301 }
      return reply(model.contact, method === 'POST' ? 201 : 200)
    }
    if (path.endsWith('/count')) return reply({ count: 0 })
    return reply({ list: [] })
  })
  return model
}

async function fillRegistration(page) {
  await page.getByLabel('Full name', { exact: true }).fill('Test Customer')
  await page.getByLabel('Email address', { exact: true }).fill(customer.email)
  await page.getByLabel('Password', { exact: true }).fill('Testing123')
  await page.getByLabel('Confirm password', { exact: true }).fill('Testing123')
  await page.getByLabel('Phone number').fill('0412345678')
  await page.getByLabel('Street address').fill('10 Test Street')
  await page.getByLabel('Suburb').fill('Darwin')
  await page.getByLabel('State or territory').selectOption('NT')
  await page.getByLabel('Postcode').fill('0800')
}

async function openNavigation(page) {
  const menu = page.getByRole('button', { name: 'Menu', exact: true })
  if (await menu.isVisible() && await menu.getAttribute('aria-expanded') === 'false') await menu.click()
}

test('registration validates, shows the password and persists delivery details', async ({ page }, testInfo) => {
  const model = await backend(page)
  await page.goto('/register')
  await page.getByRole('button', { name: 'Create account', exact: true }).click()
  await expect(page.getByLabel('Full name', { exact: true })).toBeFocused()
  await fillRegistration(page)
  const password = page.getByLabel('Password', { exact: true })
  await password.fill('abc')
  await expect(page.getByText('Weak', { exact: true })).toBeVisible()
  await password.fill('abc123')
  await expect(page.getByText('Almost there', { exact: true })).toBeVisible()
  await password.fill('Testing123')
  await expect(page.getByText('Requirements met', { exact: true })).toBeVisible()
  const show = page.getByRole('button', { name: 'Show password', exact: true })
  await show.click()
  await expect(password).toHaveAttribute('type', 'text')
  await expect(page.getByRole('button', { name: 'Hide password', exact: true })).toHaveAttribute('aria-pressed', 'true')
  const inputBox = await password.boundingBox()
  const buttonBox = await page.getByRole('button', { name: 'Hide password', exact: true }).boundingBox()
  expect(buttonBox.y).toBeGreaterThanOrEqual(inputBox.y)
  expect(buttonBox.y + buttonBox.height).toBeLessThanOrEqual(inputBox.y + inputBox.height)
  expect(buttonBox.x + buttonBox.width).toBeLessThanOrEqual(inputBox.x + inputBox.width)
  await page.getByRole('button', { name: 'Hide password', exact: true }).click()
  await expect(password).toHaveAttribute('aria-invalid', 'false')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }))
  await page.screenshot({ path: testInfo.outputPath('registration.png'), fullPage: true })
  await page.getByRole('button', { name: 'Create account', exact: true }).click()
  await expect(page).toHaveURL(/\/account$/)
  await expect(page.getByLabel('Postcode')).toHaveValue('0800')
  expect(model.requests.some(r => r.path === '/api/inft3050/Patrons' && r.method === 'POST')).toBe(true)
  expect(model.requests.some(r => r.path === '/api/inft3050/TO' && r.body?.PatronId === 201)).toBe(true)
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Hello, Test Customer' })).toBeVisible()
  await expect(page.getByLabel('Street address')).toHaveValue('10 Test Street')
  await page.screenshot({ path: testInfo.outputPath('profile.png'), fullPage: true })
})

test('duplicate registration does not create an account', async ({ page }) => {
  const model = await backend(page, { duplicate: true })
  await page.goto('/register')
  await fillRegistration(page)
  await page.getByRole('button', { name: 'Create account', exact: true }).click()
  await expect(page.getByText('This email is already registered.', { exact: true })).toBeVisible()
  expect(model.requests.filter(r => r.path === '/api/inft3050/Patrons' && r.method === 'POST')).toHaveLength(0)
})

test('partial registration takes the customer to recoverable delivery details', async ({ page }) => {
  const model = await backend(page, { saveFailure: true, contact: null })
  await page.goto('/register')
  await fillRegistration(page)
  await page.getByRole('button', { name: 'Create account', exact: true }).click()
  await expect(page).toHaveURL(/\/account$/)
  await expect(page.getByRole('alert')).toContainText("Your delivery details weren't saved")
  await expect(page.getByRole('button', { name: 'Save delivery details' })).toBeVisible()
  await page.getByLabel('Phone number').fill('0412345678')
  await page.getByLabel('Street address').fill('10 Test Street')
  await page.getByLabel('Suburb').fill('Darwin')
  await page.getByLabel('State or territory').selectOption('NT')
  await page.getByLabel('Postcode').fill('0800')
  await page.getByRole('button', { name: 'Save delivery details' }).click()
  await expect(page.getByRole('alert').first()).toContainText("Your delivery details weren't saved")
  model.saveFailure = false
  await page.getByRole('button', { name: 'Save delivery details' }).click()
  await expect(page.getByText('Delivery details saved.', { exact: true })).toBeVisible()
  await expect(page.getByRole('alert')).toHaveCount(0)
  await expect(page.getByText(/Welcome to the guild!/)).toBeVisible()
  await page.reload()
  await expect(page.getByLabel('Street address')).toHaveValue('10 Test Street')
  await expect(page.getByRole('alert')).toHaveCount(0)
})

for (const failure of ['service unavailable', 'network disconnected']) {
  test(`session retry preserves unsaved delivery details after ${failure}`, async ({ page }) => {
    const model = await backend(page, { user: { ...customer } })
    await page.goto('/account')
    await expect(page.getByLabel('Street address')).toHaveValue('10 Test Street')
    await page.getByLabel('Street address').fill('99 Unsaved Street')
    if (failure === 'service unavailable') model.unavailable = true
    else await page.route('**/backend/me', route => route.abort('failed'), { times: 1 })
    await page.evaluate(() => window.dispatchEvent(new Event('focus')))
    await expect(page.getByRole('button', { name: 'Try again', exact: true })).toBeVisible()
    await expect(page.getByLabel('Street address')).toHaveValue('99 Unsaved Street')
    await expect(page.getByRole('button', { name: 'Save delivery details' })).toBeDisabled()
    model.unavailable = false
    await page.getByRole('button', { name: 'Try again', exact: true }).click()
    await expect(page.getByRole('alert')).toHaveCount(0)
    await expect(page.getByLabel('Street address')).toHaveValue('99 Unsaved Street')
    await expect(page.getByRole('button', { name: 'Save delivery details' })).toBeEnabled()
    expect(model.requests.filter(r => r.method === 'PATCH' || r.method === 'POST')).toHaveLength(0)
    await page.getByRole('button', { name: 'Reset', exact: true }).click()
    await expect(page.getByLabel('Street address')).toHaveValue('10 Test Street')
  })
}

test('retry after an outage still clears an expired session and its draft', async ({ page }) => {
  const model = await backend(page, { user: { ...customer } })
  await page.goto('/account')
  await expect(page.getByLabel('Street address')).toHaveValue('10 Test Street')
  await page.getByLabel('Street address').fill('99 Unsaved Street')
  model.unavailable = true
  await page.evaluate(() => window.dispatchEvent(new Event('focus')))
  await expect(page.getByRole('button', { name: 'Try again', exact: true })).toBeVisible()
  model.unavailable = false
  model.user = null
  await page.getByRole('button', { name: 'Try again', exact: true }).click()
  await expect(page).toHaveURL(/\/login$/)
  await expect(page.getByLabel('Street address')).toHaveCount(0)
})

test('failed profile lookup after an account change does not keep the previous account visible', async ({ page }) => {
  const model = await backend(page, { user: { ...customer } })
  await page.goto('/account')
  await expect(page.getByLabel('Street address')).toHaveValue('10 Test Street')
  await page.getByLabel('Street address').fill('99 Unsaved Street')
  model.user = { ...customer, id: 202, username: 'Other Customer' }
  model.contact = { ...contact, CustomerID: 302, StreetAddress: '20 Other Street' }
  await page.route('**/backend/api/inft3050/Patrons/202?*', route => route.fulfill({ status: 503, json: { error: 'Service unavailable' } }), { times: 1 })
  await page.evaluate(() => window.dispatchEvent(new Event('focus')))
  await expect(page.getByRole('button', { name: 'Try again', exact: true })).toBeVisible()
  await expect(page.getByLabel('Street address')).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'Hello, Test Customer' })).toHaveCount(0)
  await page.getByRole('button', { name: 'Try again', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Hello, Other Customer' })).toBeVisible()
  await expect(page.getByLabel('Street address')).toHaveValue('20 Other Street')
})

test('profile guard, bad password, sign in, failed sign out and successful sign out', async ({ page }) => {
  const model = await backend(page, { badPassword: true })
  await page.goto('/profile')
  await expect(page).toHaveURL(/\/login$/)
  await expect(page.getByRole('link', { name: 'My account' })).toHaveCount(0)
  await page.getByLabel('Email address').fill(customer.email)
  await page.getByLabel('Password', { exact: true }).fill('Wrong123')
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page.getByRole('alert')).toHaveText('Email or password is incorrect.')
  model.badPassword = false
  await page.getByLabel('Password', { exact: true }).fill('Testing123')
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page).toHaveURL(/\/account$/)
  await expect(page.getByRole('link', { name: 'Sign in', exact: true })).toHaveCount(0)
  model.logoutFailure = true
  await openNavigation(page)
  await page.getByRole('button', { name: 'Sign out', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('Could not sign out')
  await expect(page.getByRole('heading', { name: 'Hello, Test Customer' })).toBeVisible()
  model.logoutFailure = false
  await openNavigation(page)
  await page.getByRole('button', { name: 'Sign out', exact: true }).click()
  await expect(page).toHaveURL(/\/login$/)
  await page.goto('/account')
  await expect(page).toHaveURL(/\/login$/)
})

test('save freezes inputs, preserves leading zero postcode, reset uses last saved values', async ({ page }) => {
  const model = await backend(page, { user: { ...customer }, delaySave: true })
  await page.goto('/account')
  await expect(page.getByLabel('Postcode')).toHaveValue('0800')
  await page.getByLabel('Street address').fill(' 20 Updated Street ')
  await page.getByRole('button', { name: 'Save delivery details' }).click()
  await expect(page.getByLabel('Street address')).toBeDisabled()
  await expect(page.getByText('Delivery details saved.', { exact: true })).toBeVisible()
  await expect(page.getByLabel('Street address')).toHaveValue('20 Updated Street')
  await page.getByLabel('Street address').fill('Unsaved edit')
  await page.getByRole('button', { name: 'Reset', exact: true }).click()
  await expect(page.getByLabel('Street address')).toHaveValue('20 Updated Street')
  model.saveFailure = true
  await page.getByLabel('Street address').fill('Failed edit')
  await page.getByRole('button', { name: 'Save delivery details' }).click()
  await expect(page.getByRole('alert')).toBeVisible()
  await expect(page.getByLabel('Street address')).toHaveValue('Failed edit')
  await page.getByRole('button', { name: 'Reset', exact: true }).click()
  await expect(page.getByLabel('Street address')).toHaveValue('20 Updated Street')
  await page.reload()
  await expect(page.getByLabel('Street address')).toHaveValue('20 Updated Street')
})

test('unavailable session is not mistaken for logout and can be retried', async ({ page }) => {
  const model = await backend(page, { user: { ...customer }, unavailable: true })
  await page.goto('/account')
  await expect(page).toHaveURL(/\/account$/)
  await expect(page.getByRole('alert').first()).toContainText('Service unavailable')
  model.unavailable = false
  await page.getByRole('button', { name: 'Try again', exact: true }).first().click()
  await expect(page.getByRole('heading', { name: 'Hello, Test Customer' })).toBeVisible()
})

test('expired session cannot save and redirects to sign in', async ({ page }) => {
  const model = await backend(page, { user: { ...customer } })
  await page.goto('/account')
  await expect(page.getByLabel('Street address')).toBeVisible()
  model.expired = true
  await page.getByRole('button', { name: 'Save delivery details' }).click()
  await expect(page).toHaveURL(/\/login$/)
})

test('customer cannot use staff dashboards; employee uses the API contract and cannot enter admin pages', async ({ page }) => {
  const model = await backend(page, { user: { ...customer } })
  await page.goto('/employee')
  await expect(page).toHaveURL(/\/employee\/login$/)
  await page.getByLabel('Username', { exact: true }).fill('staff')
  await page.getByLabel('Password', { exact: true }).fill('StaffTest123')
  await page.getByRole('button', { name: 'Sign in as employee' }).click()
  await expect(page).toHaveURL(/\/employee$/)
  await expect(page.getByRole('heading', { name: 'Welcome, Test Staff!' })).toBeVisible()
  await expect(page.getByText('No data available yet.')).toBeVisible()
  expect(model.requests.some(r => r.path === '/login' && r.method === 'POST')).toBe(true)
  await page.goto('/admin')
  await expect(page).toHaveURL(/\/employee$/)
  await page.goto('/account')
  await expect(page).toHaveURL(/\/employee$/)
})

test('stale resource results cannot repopulate data after reset', async ({ page }) => {
  await backend(page)
  await page.goto('/login')
  await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible()
  const result = await page.evaluate(async () => {
    const { createResource } = await import('/src/data/backend.js')
    let resolve
    const resource = createResource(() => new Promise(done => { resolve = done }))
    const pending = resource.load()
    resource.reset()
    resolve({ email: 'previous-user@example.test' })
    await pending
    return resource.getState()
  })
  expect(result).toEqual({ status: 'idle', data: null, error: '' })
})

test('return paths reject external URLs and staff areas', async ({ page }) => {
  await backend(page)
  await page.goto('/login')
  const values = await page.evaluate(async () => {
    const { customerReturnPath } = await import('/src/data/accountNavigation.js')
    return ['https://example.com', '//example.com', '/\\example.com', '/admin', '/login', '/account?tab=delivery'].map(value => customerReturnPath(value))
  })
  expect(values).toEqual(['/account', '/account', '/account', '/account', '/account', '/account?tab=delivery'])
})

test('registration blocks mismatched passwords and phone numbers without enough digits', async ({ page }) => {
  const model = await backend(page)
  await page.goto('/register')
  await fillRegistration(page)
  await page.getByLabel('Confirm password', { exact: true }).fill('Different123')
  await page.getByLabel('Phone number').fill('(  )----')
  await page.getByRole('button', { name: 'Create account', exact: true }).click()
  await expect(page.getByText('Passwords must match.', { exact: true })).toBeVisible()
  await expect(page.getByText('Enter a valid phone number with 8 to 15 digits.', { exact: true })).toBeVisible()
  expect(model.requests.filter(r => r.method === 'POST')).toHaveLength(0)
})

test('new delivery details are created once and subsequent saves update the same record', async ({ page }) => {
  const model = await backend(page, { user: { ...customer }, contact: null })
  await page.goto('/account')
  await page.getByLabel('Phone number').fill('0412345678')
  await page.getByLabel('Street address').fill('10 Test Street')
  await page.getByLabel('Suburb').fill('Darwin')
  await page.getByLabel('State or territory').selectOption('NT')
  await page.getByLabel('Postcode').fill('0800')
  await page.getByRole('button', { name: 'Save delivery details' }).click()
  await expect(page.getByText('Delivery details saved.', { exact: true })).toBeVisible()
  await page.getByLabel('Street address').fill('20 Updated Street')
  await page.getByRole('button', { name: 'Save delivery details' }).click()
  await expect(page.getByText('Delivery details saved.', { exact: true })).toBeVisible()
  expect(model.requests.filter(r => r.path === '/api/inft3050/TO' && r.method === 'POST')).toHaveLength(1)
  expect(model.requests.filter(r => r.path === '/api/inft3050/TO/301' && r.method === 'PATCH')).toHaveLength(1)
})

test('another-tab account change refreshes the profile without retaining the previous delivery form', async ({ page }) => {
  const model = await backend(page, { user: { ...customer } })
  await page.goto('/account')
  await expect(page.getByLabel('Street address')).toHaveValue('10 Test Street')
  model.user = { ...customer, id: 202, username: 'Other Customer', email: 'other@example.test' }
  model.contact = { ...contact, CustomerID: 302, StreetAddress: '99 Other Street' }
  await page.evaluate(() => window.dispatchEvent(new Event('focus')))
  await expect(page.getByRole('heading', { name: 'Hello, Other Customer' })).toBeVisible()
  await expect(page.getByLabel('Street address')).toHaveValue('99 Other Street')
  await expect(page.getByText('customer@example.test', { exact: true })).toHaveCount(0)
})

test('a delayed session check cannot overwrite a newer sign in', async ({ page }) => {
  await backend(page)
  await page.goto('/login')
  await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible()
  let release
  let started
  const held = new Promise(resolve => { release = resolve })
  const intercepted = new Promise(resolve => { started = resolve })
  await page.route('**/backend/me', async route => {
    started()
    await held
    await route.fulfill({ status: 401, json: { error: 'Not signed in' } })
  }, { times: 1 })
  await page.evaluate(() => window.dispatchEvent(new Event('focus')))
  await intercepted
  await page.getByLabel('Email address').fill(customer.email)
  await page.getByLabel('Password', { exact: true }).fill('Testing123')
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page).toHaveURL(/\/account$/)
  release()
  await expect(page.getByRole('heading', { name: 'Hello, Test Customer' })).toBeVisible()
  await expect(page.getByLabel('Street address')).toHaveValue('10 Test Street')
})

test('a backend outage does not hide the public registration form', async ({ page }) => {
  await backend(page, { unavailable: true })
  await page.goto('/register')
  await expect(page.getByRole('alert')).toContainText('Service unavailable')
  await expect(page.getByLabel('Password', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Show password', exact: true })).toBeVisible()
})
