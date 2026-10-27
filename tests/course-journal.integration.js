import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtemp, readFile, readdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'
import { createCheckout } from '../server/checkout.js'
import { createCheckoutJournal } from '../server/checkout-journal.js'
import { fixtureDatabase } from './fixtures/database.js'

test('course checkout commits safely using the original schema and a persistent journal', async (t) => {
  const { database, pool, connectionString } = await fixtureDatabase({ extensions: false })
  t.after(() => database.close())
  const directory = await mkdtemp(join(tmpdir(), 'eg-journal-'))
  const journal = createCheckoutJournal(directory)
  const key = 'isolated-test-key-'.repeat(5)
  const checkout = createCheckout(database, key, { journal })
  await pool
    .request()
    .query(
      "INSERT dbo.Patrons(Email,Name) VALUES('patron@example.test','Fixture Patron'),('other@example.test','Other Patron')",
    )
  const user = { id: '1', patronId: '1', email: 'patron@example.test' }
  const other = { id: '2', patronId: '2', email: 'other@example.test' }
  const customer = {
    name: 'Fixture Patron',
    email: user.email,
    phone: '',
    street: '12 Test Street',
    suburb: 'Newcastle',
    postcode: '2300',
    state: 'NSW',
  }
  async function prepare(
    items = [{ itemId: '101', quantity: 1 }],
    number = '4242424242424242',
    patron = user,
  ) {
    const contact = { ...customer, email: patron.email }
    const quote = await checkout.prepare(items, contact, patron)
    const payment = checkout.paymentMethod(
      {
        token: quote.token,
        card: { holder: 'Fixture Patron', number, expiry: '12/99', cvc: '123' },
      },
      patron,
    )
    return {
      token: quote.token,
      items: quote.reviewedItems,
      customer: contact,
      paymentToken: payment.paymentToken,
    }
  }
  const count = async () =>
    (await pool.request().query('SELECT COUNT(*) n FROM dbo.Orders')).recordset[0].n
  const snapshot = async () =>
    (
      await pool.request().query(`
    SELECT COUNT(*) n FROM dbo.Orders; SELECT COUNT(*) n FROM dbo.[TO];
    SELECT OrderId,produktId,Quantity FROM dbo.ProductsInOrders ORDER BY OrderId,produktId;
    SELECT ItemId,Quantity,Price FROM dbo.Stocktake ORDER BY ItemId`)
    ).recordsets
  let approved
  await t.test(
    'parallel retries create one order, preserve both sources and recover after restart',
    async () => {
      const payload = await prepare([
        { itemId: '101', quantity: 1 },
        { itemId: '104', quantity: 2 },
      ])
      payload.patronId = other.patronId
      payload.customer = { ...customer, patronId: other.patronId }
      const results = await Promise.all([
        checkout.confirm(payload, user),
        checkout.confirm(payload, user),
      ])
      assert.equal(results[0].status, 'approved')
      assert.deepEqual(results[0], results[1])
      assert.equal(await count(), 1)
      assert.equal(
        (await pool.request().query('SELECT PatronId FROM dbo.[TO]')).recordset[0].PatronId,
        1,
      )
      approved = payload
      const fresh = createCheckout(database, key, { journal: createCheckoutJournal(directory) })
      assert.deepEqual(await fresh.status(payload.token, user), results[0])
      const recovered = execFileSync(
        process.execPath,
        [
          '--input-type=module',
          '-e',
          `
        import {createDatabase} from './server/database.js';
        import {createCheckout} from './server/checkout.js';
        import {createCheckoutJournal} from './server/checkout-journal.js';
        const db=createDatabase(process.env.TEST_JOURNAL_SQL);
        try {
          const service=createCheckout(db,'',{journal:createCheckoutJournal(process.env.TEST_JOURNAL_DIRECTORY)});
          console.log(JSON.stringify(await service.status(process.env.TEST_ATTEMPT,{patronId:'1'})));
        } finally {await db.close();}
      `,
        ],
        {
          encoding: 'utf8',
          env: {
            ...process.env,
            TEST_JOURNAL_SQL: connectionString,
            TEST_JOURNAL_DIRECTORY: directory,
            TEST_ATTEMPT: payload.token,
          },
        },
      )
      assert.deepEqual(JSON.parse(recovered), results[0])
      assert.equal((await fresh.status(payload.token, other)).status, 'not-found')
      await assert.rejects(
        fresh.confirm({ ...payload, customer: { ...customer, name: 'changed' } }, user),
        (e) => e.status === 409,
      )
      const data = await pool
        .request()
        .query(
          'SELECT Quantity FROM dbo.Stocktake WHERE ItemId IN (101,104) ORDER BY ItemId; SELECT produktId,Quantity FROM dbo.ProductsInOrders ORDER BY produktId',
        )
      assert.deepEqual(
        data.recordsets[0].map((x) => x.Quantity),
        [19, 18],
      )
      assert.deepEqual(
        data.recordsets[1].map((x) => [x.produktId, x.Quantity]),
        [
          [101, 1],
          [104, 2],
        ],
      )
    },
  )
  await t.test('declines, timeouts and stale prices keep orders and stock unchanged', async () => {
    const before = await count()
    for (const [number, status] of [
      ['4000000000000002', 'declined'],
      ['4111111111111111', 'timed-out'],
    ]) {
      const payload = await prepare(undefined, number)
      assert.equal((await checkout.confirm(payload, user)).status, status)
      assert.equal((await checkout.status(payload.token, user)).status, status)
    }
    const changed = await prepare()
    await pool.request().query('UPDATE dbo.Stocktake SET Price=13 WHERE ItemId=101')
    assert.equal((await checkout.confirm(changed, user)).status, 'changed')
    assert.equal(await count(), before)
  })
  await t.test('two customers competing for the last copy cannot oversell', async () => {
    const before = await count()
    const a = await prepare([{ itemId: '102', quantity: 1 }]),
      b = await prepare([{ itemId: '102', quantity: 1 }], undefined, other)
    const results = await Promise.all([checkout.confirm(a, user), checkout.confirm(b, other)])
    assert.deepEqual(results.map((x) => x.status).sort(), ['approved', 'changed'])
    assert.equal(await count(), before + 1)
    assert.equal(
      (await pool.request().query('SELECT Quantity FROM dbo.Stocktake WHERE ItemId=102'))
        .recordset[0].Quantity,
      0,
    )
  })
  await t.test(
    'tampered prices, quantities, product IDs and customer emails cannot buy altered lines',
    async () => {
      const before = await snapshot()
      for (const quantity of [-1, 0, 1.5, 2147483648]) {
        const payload = await prepare()
        payload.items[0].quantity = quantity
        await assert.rejects(checkout.confirm(payload, user), (e) => e.status === 400)
      }
      for (const change of [
        { priceCents: 1 },
        { itemId: '1' },
        { productId: '2' },
        { sourceId: '2' },
      ]) {
        const payload = await prepare()
        Object.assign(payload.items[0], change)
        assert.equal((await checkout.confirm(payload, user)).status, 'changed')
      }
      const payload = await prepare()
      await assert.rejects(
        checkout.confirm({ ...payload, customer: { ...customer, email: other.email } }, user),
        (e) => e.status === 400,
      )
      await assert.rejects(
        checkout.confirm({ ...payload, customer: { ...customer, email: other.email } }, other),
        (e) => e.status === 400,
      )
      assert.deepEqual(await snapshot(), before)
    },
  )
  await t.test(
    'failed order-item insertion rolls back contact, order, lines and inventory',
    async () => {
      const payload = await prepare(),
        before = await snapshot()
      await pool
        .request()
        .batch(
          "CREATE TRIGGER FailCourseOrderLine ON dbo.ProductsInOrders AFTER INSERT AS THROW 50001,'Injected line failure',1;",
        )
      try {
        await assert.rejects(checkout.confirm(payload, user), /Injected line failure/)
      } finally {
        await pool.request().query('DROP TRIGGER dbo.FailCourseOrderLine')
      }
      assert.deepEqual(await snapshot(), before)
      assert.equal((await checkout.status(payload.token, user)).status, 'not-found')
    },
  )
  const interruptedDatabase = (committed) => ({
    getPool: async () => ({
      transaction: () => {
        const tx = pool.transaction(),
          commit = tx.commit.bind(tx)
        tx.commit = async () => {
          if (committed) await commit()
          else await tx.rollback()
          throw new Error('Injected connection interruption')
        }
        return tx
      },
    }),
  })
  await t.test(
    'receipt written before rollback is not approval and identical retry succeeds',
    async () => {
      const payload = await prepare(),
        before = await count()
      const interrupted = createCheckout(interruptedDatabase(false), key, { journal })
      await assert.rejects(interrupted.confirm(payload, user), (e) => e.status === 503)
      assert.equal(await count(), before)
      assert.equal((await checkout.status(payload.token, user)).status, 'not-found')
      assert.equal((await checkout.confirm(payload, user)).status, 'approved')
      assert.equal(await count(), before + 1)
    },
  )
  await t.test(
    'lost commit acknowledgement resolves to the existing order without double stock deduction',
    async () => {
      const payload = await prepare(),
        before = await count()
      const interrupted = createCheckout(interruptedDatabase(true), key, { journal })
      // Its status transaction also reports a lost acknowledgement; a clean process can reconcile it.
      await assert.rejects(interrupted.confirm(payload, user), (e) => e.status === 503)
      assert.equal((await checkout.status(payload.token, user)).status, 'approved')
      assert.equal((await checkout.confirm(payload, user)).status, 'approved')
      assert.equal(await count(), before + 1)
    },
  )
  await t.test('journal write failure rolls back every database write', async () => {
    const payload = await prepare(),
      before = await snapshot()
    const broken = createCheckout(database, key, {
      journal: {
        ...journal,
        write: async () => {
          throw new Error('Disk full')
        },
      },
    })
    await assert.rejects(broken.confirm(payload, user), /Disk full/)
    assert.deepEqual(await snapshot(), before)
  })
  await t.test('no support tables or stored raw card details are required', async () => {
    assert.equal(
      (await pool.request().query("SELECT COUNT(*) n FROM sys.tables WHERE name LIKE 'EG%' "))
        .recordset[0].n,
      0,
    )
    assert.equal(
      (
        await pool
          .request()
          .query('SELECT COUNT(*) n FROM dbo.[TO] WHERE CardNumber IS NOT NULL OR CVV IS NOT NULL')
      ).recordset[0].n,
      0,
    )
    for (const file of await readdir(directory)) {
      const text = await readFile(join(directory, file), 'utf8')
      assert.ok(!text.includes('4242424242424242') && !text.includes('"cvc"'))
    }
    assert.equal((await checkout.status(approved.token, user)).status, 'approved')
  })
})
