import assert from 'node:assert/strict'
import { test } from 'node:test'
import { once } from 'node:events'
import { spawn } from 'node:child_process'
import { createApp } from '../server/app.js'
import { createAccounts } from '../server/accounts.js'
import { digest } from '../server/security.js'
import { fixtureDatabase } from './fixtures/database.js'

const paymentKey = 'synthetic-payment-signing-key-'.repeat(3)
const password = 'Synthetic-test-password-2026'
const contact = (email) => ({
  name: 'Fixture Customer',
  email,
  phone: '',
  street: '12 Test Street',
  suburb: 'Newcastle',
  postcode: '2300',
  state: 'NSW',
})
export function client(base) {
  let cookie = '',
    csrf = ''
  return {
    get cookie() {
      return cookie
    },
    async call(path, body, method = body === undefined ? 'GET' : 'POST', headers = {}) {
      const response = await fetch(base + '/api' + path, {
        method,
        headers: {
          cookie,
          ...(body === undefined
            ? {}
            : { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf }),
          ...headers,
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      })
      if (response.headers.get('set-cookie'))
        cookie = response.headers.get('set-cookie').split(';')[0]
      const data = await response.json()
      if (data.csrf) csrf = data.csrf
      return { status: response.status, ...data }
    },
  }
}

test('SQL and HTTP integration on a synthetic database', async (t) => {
  const { database, pool, connectionString } = await fixtureDatabase()
  const server = createApp(database, { paymentKey }).listen(0, '127.0.0.1')
  await once(server, 'listening')
  const base = `http://127.0.0.1:${server.address().port}`
  t.after(async () => {
    server.closeAllConnections()
    server.close()
    await database.close()
  })
  const alice = client(base),
    bob = client(base),
    admin = client(base),
    employee = client(base)
  const aliceEmail = 'alice@example.test',
    bobEmail = 'bob@example.test'
  const register = async (c, email) => {
    await c.call('/auth/session')
    const result = await c.call('/auth/register', { name: 'Fixture Customer', email, password })
    assert.equal(result.status, 201)
    return result.user
  }
  const login = async (c, name) => {
    await c.call('/auth/session')
    assert.equal((await c.call('/auth/login', { login: name, password })).status, 200)
  }
  let approvedPayload, orderId
  const review = async (
    c,
    email,
    items = [{ itemId: '101', quantity: 1 }],
    outcome = 'approved',
  ) => {
    const customer = contact(email),
      quote = await c.call('/checkout/prepare', { items, customer })
    assert.equal(quote.status, 200, JSON.stringify(quote))
    const method = await c.call('/checkout/payment-method', {
      token: quote.token,
      card: {
        holder: 'Fixture Customer',
        number: {
          approved: '4242424242424242',
          declined: '4000000000000002',
          incorrect: '4242424242424241',
          'timed-out': '4111111111111111',
        }[outcome],
        expiry: '12/99',
        cvc: '123',
      },
    })
    assert.equal(method.status, 200, JSON.stringify(method))
    return {
      token: quote.token,
      items: quote.reviewedItems,
      customer,
      paymentToken: method.paymentToken,
    }
  }

  await t.test('real SQL catalogue, bound keyword search and two sources', async () => {
    const catalogue = await alice.call('/products')
    assert.equal(catalogue.products.length, 3)
    assert.equal(catalogue.products.find((p) => p.id === '1').offers.length, 2)
    assert.equal((await alice.call('/products?q=Fixture')).products.length, 1)
    assert.equal(
      (await alice.call('/products?q=' + encodeURIComponent("' OR 1=1 --"))).products.length,
      0,
    )
    const quote = await alice.call('/cart', {
      items: [
        { itemId: '101', quantity: 1 },
        { itemId: '104', quantity: 2 },
      ],
    })
    assert.equal(quote.subtotal, 27)
    assert.equal(
      (await alice.call('/cart', { items: [{ itemId: '103', quantity: 1 }] })).status,
      400,
    )
  })
  await t.test(
    'customer-only registration, CSRF, session restoration and role restrictions',
    async () => {
      await alice.call('/auth/session')
      assert.equal(
        (
          await alice.call('/auth/register', {
            name: 'Bad',
            email: aliceEmail,
            password,
            role: 'admin',
          })
        ).status,
        403,
      )
      assert.equal(
        (
          await alice.call('/auth/register', { name: 'Bad', email: aliceEmail, password }, 'POST', {
            'X-CSRF-Token': 'wrong',
          })
        ).status,
        403,
      )
      await register(alice, aliceEmail)
      const duplicate = await alice.call('/auth/register', {
        name: 'A different name',
        email: aliceEmail.toUpperCase(),
        password,
      })
      assert.equal(duplicate.status, 409)
      assert.match(duplicate.error, /email is already registered/)
      await register(bob, bobEmail)
      assert.equal((await alice.call('/auth/session')).user.email, aliceEmail)
      assert.equal((await alice.call('/management/users')).status, 403)
      assert.equal(
        (await alice.call('/profile', { name: 'Updated Name' }, 'PATCH')).user.name,
        'Updated Name',
      )
      const accounts = createAccounts(database)
      await accounts.register(
        {
          name: 'Fixture Admin',
          email: 'admin@example.test',
          username: 'fixture-admin',
          password,
          role: 'admin',
        },
        'admin',
      )
      await accounts.register(
        {
          name: 'Fixture Employee',
          email: 'employee@example.test',
          username: 'fixture-employee',
          password,
          role: 'employee',
        },
        'employee',
      )
      await login(admin, 'fixture-admin')
      await login(employee, 'fixture-employee')
      assert.equal((await admin.call('/checkout/prepare', {})).status, 403)
      assert.equal(
        (await employee.call('/management/listings/101', { quantity: 0 }, 'PATCH')).status,
        403,
      )
      assert.equal((await employee.call('/management/users')).status, 200)
      assert.equal(
        (
          await admin.call('/management/users', {
            name: 'New Staff',
            email: 'staff2@example.test',
            username: 'staff2',
            password,
            role: 'employee',
          })
        ).status,
        201,
      )
    },
  )
  await t.test(
    'approved duplicate submissions atomically write one order and exact source prices',
    async () => {
      approvedPayload = await review(alice, aliceEmail, [
        { itemId: '101', quantity: 1 },
        { itemId: '104', quantity: 2 },
      ])
      const results = await Promise.all([
        alice.call('/checkout/confirm', approvedPayload),
        alice.call('/checkout/confirm', approvedPayload),
      ])
      assert.equal(results[0].status, 'approved', JSON.stringify(results))
      assert.equal(results[0].orderId, results[1].orderId)
      orderId = results[0].orderId
      const rows = (
        await pool
          .request()
          .query(
            'SELECT Quantity FROM dbo.Stocktake WHERE ItemId IN(101,104) ORDER BY ItemId; SELECT COUNT(*) count FROM dbo.Orders; SELECT UnitPriceCents FROM dbo.EGOrderLines ORDER BY ItemId',
          )
      ).recordsets
      assert.deepEqual(
        rows[0].map((r) => r.Quantity),
        [19, 18],
      )
      assert.equal(rows[1][0].count, 1)
      assert.deepEqual(results[0].payment, { brand: 'Visa', last4: '4242' })
      const sensitive = await pool
        .request()
        .query(
          'SELECT COUNT(*) count FROM dbo.[TO] WHERE CardNumber IS NOT NULL OR CVV IS NOT NULL',
        )
      assert.equal(sensitive.recordset[0].count, 0)
      const attempts = await pool.request().query('SELECT ResultJson FROM dbo.EGCheckoutAttempts')
      assert.ok(
        attempts.recordset.every(
          (row) => !/4242424242424242|4000000000000002|4111111111111111/.test(row.ResultJson),
        ),
      )
      assert.deepEqual(
        rows[2].map((r) => Number(r.UnitPriceCents)),
        [1250, 725],
      )
      assert.equal((await bob.call('/orders/' + orderId)).status, 404)
      assert.equal((await bob.call('/checkout/' + approvedPayload.token)).status, 'not-found')
      assert.equal(
        (
          await alice.call('/checkout/confirm', {
            ...approvedPayload,
            customer: { ...approvedPayload.customer, name: 'Altered' },
          })
        ).status,
        409,
      )
    },
  )
  await t.test(
    'payment validation rejects client outcomes, altered tokens and cross-customer reuse',
    async () => {
      const payload = await review(alice, aliceEmail)
      assert.equal(
        (await alice.call('/checkout/confirm', { ...payload, outcome: 'approved' })).status,
        400,
      )
      assert.equal(
        (
          await alice.call('/checkout/confirm', {
            ...payload,
            paymentToken: payload.paymentToken + 'x',
          })
        ).status,
        400,
      )
      assert.equal(
        (await bob.call('/checkout/confirm', { ...payload, customer: contact(bobEmail) })).status,
        400,
      )
      assert.equal(
        (
          await alice.call('/checkout/payment-method', {
            token: payload.token,
            card: { holder: 'Test', number: '555555555555abc4', expiry: '12/99', cvc: '123' },
          })
        ).status,
        400,
      )
      assert.equal(
        (await pool.request().query('SELECT COUNT(*) count FROM dbo.Orders')).recordset[0].count,
        1,
      )
    },
  )
  await t.test('declined, timed-out and changed-price attempts do not consume stock', async () => {
    for (const outcome of ['declined', 'timed-out'])
      assert.equal(
        (await alice.call('/checkout/confirm', await review(alice, aliceEmail, undefined, outcome)))
          .status,
        outcome,
      )
    assert.equal(
      (
        await alice.call(
          '/checkout/confirm',
          await review(alice, aliceEmail, undefined, 'incorrect'),
        )
      ).status,
      'declined',
    )
    assert.equal(
      (await pool.request().query('SELECT COUNT(*) count FROM dbo.Orders')).recordset[0].count,
      1,
    )
    const payload = await review(alice, aliceEmail)
    payload.items[0].priceCents = 1
    assert.equal((await alice.call('/checkout/confirm', payload)).status, 'changed')
    assert.equal(
      (await pool.request().query('SELECT Quantity FROM dbo.Stocktake WHERE ItemId=101'))
        .recordset[0].Quantity,
      19,
    )
  })
  await t.test('competing last-copy purchases cannot oversell', async () => {
    const first = await review(alice, aliceEmail, [{ itemId: '102', quantity: 1 }]),
      second = await review(bob, bobEmail, [{ itemId: '102', quantity: 1 }])
    const results = await Promise.all([
      alice.call('/checkout/confirm', first),
      bob.call('/checkout/confirm', second),
    ])
    assert.deepEqual(results.map((r) => r.status).sort(), ['approved', 'changed'])
    assert.equal(
      (await pool.request().query('SELECT Quantity FROM dbo.Stocktake WHERE ItemId=102'))
        .recordset[0].Quantity,
      0,
    )
  })
  await t.test('stock correction, restocking, attribution and optimistic concurrency', async () => {
    const listing = (await admin.call('/management/listings')).listings.find(
      (l) => l.itemId === '101',
    )
    const body = { price: '12.50', quantity: 2, mode: 'add', version: listing.version }
    assert.equal((await admin.call('/management/listings/101', body, 'PATCH')).status, 200)
    assert.equal((await admin.call('/management/listings/101', body, 'PATCH')).status, 409)
    assert.equal(
      (await pool.request().query('SELECT LastUpdatedBy FROM dbo.Product WHERE ID=1')).recordset[0]
        .LastUpdatedBy,
      'fixture-admin',
    )
    assert.equal((await admin.call('/management/products/1', {}, 'DELETE')).status, 409)
  })
  await t.test('a failed line insert rolls back contacts, orders, stock and attempt', async () => {
    const before = (
      await pool
        .request()
        .query(
          'SELECT COUNT(*) count FROM dbo.Orders; SELECT Quantity FROM dbo.Stocktake WHERE ItemId=101',
        )
    ).recordsets
    const payload = await review(alice, aliceEmail)
    await pool
      .request()
      .batch(
        "CREATE TRIGGER dbo.FailFixtureLine ON dbo.ProductsInOrders AFTER INSERT AS THROW 51000,'Synthetic failure',1;",
      )
    try {
      assert.equal((await alice.call('/checkout/confirm', payload)).status, 503)
    } finally {
      await pool.request().query('DROP TRIGGER dbo.FailFixtureLine')
    }
    const after = (
      await pool
        .request()
        .query(
          'SELECT COUNT(*) count FROM dbo.Orders; SELECT Quantity FROM dbo.Stocktake WHERE ItemId=101',
        )
    ).recordsets
    assert.deepEqual(after, before)
    assert.equal((await alice.call('/checkout/' + payload.token)).status, 'not-found')
  })
  await t.test('legacy hashing works without rewriting the supplied password columns', async () => {
    const hash = digest('legacy-salt' + password)
    await pool
      .request()
      .input('hash', hash)
      .query(
        "INSERT dbo.Patrons(Name,Email,Salt,HashPW) VALUES('Legacy','legacy@example.test','legacy-salt',@hash)",
      )
    const legacy = client(base)
    await login(legacy, 'legacy@example.test')
    assert.equal(
      (
        await pool
          .request()
          .query("SELECT HashPW FROM dbo.Patrons WHERE Email='legacy@example.test'")
      ).recordset[0].HashPW,
      hash,
    )
    assert.equal((await legacy.call('/auth/logout', {})).status, 200)
    assert.equal((await legacy.call('/orders')).status, 401)
  })
  await t.test(
    'a fresh Node process restores session and returns the same durable checkout result',
    async () => {
      const child = spawn(process.execPath, ['server/index.js'], {
        env: {
          ...process.env,
          DB_CONNECTION_STRING: connectionString,
          API_PORT: '0',
          PAYMENT_TOKEN_SECRET: paymentKey,
          COURSE_API_URL: '',
          API_HOST: '127.0.0.1',
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      })
      t.after(() => child.kill())
      const port = await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Restart timed out')), 10000)
        child.stdout.on('data', (data) => {
          const match = String(data).match(/port (\d+)/)
          if (match) {
            clearTimeout(timer)
            resolve(match[1])
          }
        })
        child.once('error', reject)
      })
      const session = await (
        await fetch(`http://127.0.0.1:${port}/api/auth/session`, {
          headers: { cookie: alice.cookie },
        })
      ).json()
      assert.equal(session.user.email, aliceEmail)
      const result = await (
        await fetch(`http://127.0.0.1:${port}/api/checkout/${approvedPayload.token}`, {
          headers: { cookie: alice.cookie },
        })
      ).json()
      assert.equal(result.orderId, orderId)
      const response = await fetch(`http://127.0.0.1:${port}/api/checkout/confirm`, {
        method: 'POST',
        headers: {
          cookie: alice.cookie,
          'Content-Type': 'application/json',
          'X-CSRF-Token': session.csrf,
        },
        body: JSON.stringify(approvedPayload),
      })
      assert.equal((await response.json()).orderId, orderId)
      child.kill()
    },
  )
  await t.test('customers update their own profile and credentials atomically', async () => {
    const owner = client(base),
      otherSession = client(base)
    const originalEmail = 'profile-owner@example.test',
      updatedEmail = 'profile-updated@example.test'
    const updatedPassword = 'Customer-updated-password-2026'
    const original = await register(owner, originalEmail)
    await login(otherSession, originalEmail)
    const changes = { name: 'My Updated Name', email: updatedEmail, password: updatedPassword }
    assert.equal((await owner.call('/profile', changes, 'PATCH')).status, 400)
    assert.equal(
      (await owner.call('/profile', { ...changes, currentPassword: 'incorrect' }, 'PATCH')).status,
      400,
    )
    assert.equal(
      (
        await owner.call(
          '/profile',
          { ...changes, currentPassword: password, email: bobEmail },
          'PATCH',
        )
      ).status,
      409,
    )
    assert.equal(
      (
        await owner.call(
          '/profile',
          { ...changes, currentPassword: password, password: 'short' },
          'PATCH',
        )
      ).status,
      400,
    )
    assert.equal(
      (await owner.call('/profile', { ...changes, email: 'invalid' }, 'PATCH')).status,
      400,
    )
    assert.deepEqual((await owner.call('/profile')).user, original)
    const result = await owner.call(
      '/profile',
      {
        ...changes,
        currentPassword: password,
        patronId: '999999',
        role: 'admin',
      },
      'PATCH',
    )
    assert.equal(result.status, 200)
    assert.equal(result.user.role, 'customer')
    assert.equal(result.user.patronId, original.patronId)
    assert.equal((await owner.call('/auth/session')).user.email, updatedEmail)
    assert.equal((await owner.call('/profile')).user.name, changes.name)
    assert.equal((await otherSession.call('/profile')).status, 401)
    assert.equal((await bob.call('/profile')).user.email, bobEmail)
    const check = client(base)
    await check.call('/auth/session')
    assert.equal((await check.call('/auth/login', { login: originalEmail, password })).status, 401)
    assert.equal((await check.call('/auth/login', { login: updatedEmail, password })).status, 401)
    const signedIn = await check.call('/auth/login', {
      login: updatedEmail,
      password: updatedPassword,
    })
    assert.equal(signedIn.status, 200)
    assert.equal(signedIn.user.id, original.id)
    const stored = (
      await pool
        .request()
        .input('id', Number(original.id))
        .query('SELECT Email,PasswordHash FROM dbo.EGCredentials WHERE CredentialId=@id')
    ).recordset[0]
    assert.equal(stored.Email, updatedEmail)
    assert.ok(stored.PasswordHash.startsWith('scrypt$'))
    assert.ok(!stored.PasswordHash.includes(updatedPassword))
  })
  await t.test(
    'one-time account setup requires an invitation and preserves linked customer history',
    async () => {
      const token = 'a'.repeat(64),
        email = 'incomplete@example.test'
      const accountSetup = {
        email,
        tokenHash: digest(token),
        expiresAt: new Date(Date.now() + 60000).toISOString(),
      }
      const accounts = createAccounts(database, { accountSetup })
      const patronId = (
        await pool
          .request()
          .input('email', email)
          .query(
            "INSERT dbo.Patrons(Name,Email) OUTPUT INSERTED.UserID id VALUES('Incomplete',@email)",
          )
      ).recordset[0].id
      await pool
        .request()
        .input('email', email)
        .input('id', Number(patronId))
        .query('INSERT dbo.[TO](Email,PatronId) VALUES(@email,@id)')
      const body = { name: 'Account Owner', email, password }
      await assert.rejects(accounts.register(body), { status: 409 })
      await assert.rejects(accounts.register({ ...body, setupToken: 'b'.repeat(64) }), {
        status: 409,
      })
      await assert.rejects(
        createAccounts(database, {
          accountSetup: { ...accountSetup, expiresAt: '2000-01-01' },
        }).register({ ...body, setupToken: token }),
        { status: 409 },
      )
      const id = await accounts.register({ ...body, setupToken: token })
      assert.equal(await accounts.login({ login: email, password }), id)
      const row = (
        await pool
          .request()
          .input('id', id)
          .query('SELECT PatronId FROM dbo.EGCredentials WHERE CredentialId=@id')
      ).recordset[0]
      assert.equal(String(row.PatronId), String(patronId))
      assert.equal(
        (
          await pool
            .request()
            .input('id', Number(patronId))
            .query('SELECT COUNT(*) count FROM dbo.[TO] WHERE PatronId=@id')
        ).recordset[0].count,
        1,
      )
      await assert.rejects(accounts.register({ ...body, setupToken: token }), { status: 409 })
      await assert.rejects(
        createAccounts(database, {
          accountSetup: { ...accountSetup, email: 'legacy@example.test' },
        }).register({ ...body, email: 'legacy@example.test', setupToken: token }),
        { status: 409 },
      )
    },
  )
})
