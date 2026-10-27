import { randomUUID } from 'node:crypto'
import { loadCatalogue, quoteCart, validateCartItems } from './catalogue.js'
import { CheckoutError, validateCustomer, writeOrder } from './orders.js'
import { digest, fail } from './security.js'
import { createDemoPayments } from './demo-payment.js'
import { toCents } from '../src/lib/money.js'

const validToken = (value) =>
  typeof value === 'string' &&
  /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(value)
const compact = (quote) =>
  quote.items
    .map((line) => {
      const source = line.product.offers.find((offer) => offer.itemId === line.itemId)
      return {
        itemId: line.itemId,
        quantity: line.quantity,
        priceCents: toCents(line.product.price),
        productId: line.productId,
        sourceId: source.sourceId,
      }
    })
    .sort((a, b) => Number(a.itemId) - Number(b.itemId))

/** Validate the reviewed snapshot's shape and bind its contact email to the signed-in patron.
 * These client fields are comparison data, not trusted prices: confirm reloads locked SQL rows. */
export function validateConfirmation(body, user) {
  if (!validToken(body?.token)) fail('Use a valid checkout attempt reference.')
  if (body.outcome !== undefined)
    fail('Invalid payment submission. Please review your payment details.')
  if (
    typeof body.paymentToken !== 'string' ||
    !body.paymentToken ||
    body.paymentToken.length > 1024
  )
    fail('Enter your card before confirming payment.')
  const customer = validateCustomer(body.customer)
  if (customer.email.toLowerCase() !== user.email.toLowerCase())
    fail('Use the email address of your signed-in customer account.')
  if (!Array.isArray(body.items) || !body.items.length || body.items.length > 500)
    fail('Add available listings before checking out.')
  const seen = new Set()
  const items = body.items
    .map((line) => {
      for (const key of ['itemId', 'productId', 'sourceId'])
        if (
          typeof line?.[key] !== 'string' ||
          !/^[1-9]\d*$/.test(line[key]) ||
          Number(line[key]) > 2147483647
        )
          fail('Invalid reviewed listing.')
      if (
        seen.has(line.itemId) ||
        !Number.isInteger(line.quantity) ||
        line.quantity < 1 ||
        line.quantity > 2147483647 ||
        !Number.isSafeInteger(line.priceCents) ||
        line.priceCents < 0
      )
        fail('Invalid reviewed quantity or price.')
      seen.add(line.itemId)
      return {
        itemId: line.itemId,
        quantity: line.quantity,
        priceCents: line.priceCents,
        productId: line.productId,
        sourceId: line.sourceId,
      }
    })
    .sort((a, b) => Number(a.itemId) - Number(b.itemId))
  return { token: body.token.toLowerCase(), items, customer, paymentToken: body.paymentToken }
}

/** Reuse transactional ordering with either legacy SQL receipts or the course file journal.
 * The university installer always supplies a journal, so its existing StoreDB needs no EG tables.
 * The SQL-receipt branch remains for the separate regression-test backend. */
export function createCheckout(database, paymentKey, { journal } = {}) {
  const payments = createDemoPayments(paymentKey)
  async function status(token, user) {
    if (!validToken(token)) fail('Invalid checkout reference.')
    if (journal) return journal.status(database, token, user)
    const result = await (await database.getPool())
      .request()
      .input('token', token)
      .input('patron', Number(user.patronId))
      .query(
        'SELECT ResultJson FROM dbo.EGCheckoutAttempts WHERE AttemptId=@token AND PatronId=@patron',
      )
    if (!result.recordset.length)
      return {
        status: 'not-found',
        message:
          'No committed result was found. Retry the same submission to resolve this attempt safely.',
      }
    return JSON.parse(result.recordset[0].ResultJson)
  }
  return {
    status,
    paymentMethod(body, user) {
      if (!validToken(body?.token)) fail('Review your delivery details before entering your card.')
      return payments.issue(body.card, body.token.toLowerCase(), user)
    },
    async prepare(items, customer, user) {
      const contact = validateCustomer(customer)
      if (contact.email.toLowerCase() !== user.email.toLowerCase())
        fail('Use your signed-in account email.')
      const products = await loadCatalogue(database)
      const errors = validateCartItems(items, products)
      if (errors.items || !items.length) fail(errors.items || 'Add an item before checking out.')
      const quote = quoteCart(items, products)
      return { token: randomUUID(), ...quote, reviewedItems: compact(quote) }
    },
    async confirm(body, user) {
      const request = validateConfirmation(body, user)
      const requestHash = digest(
        // The same attempt can be retried only with the same reviewed lines, delivery and payment
        // reference. Changing that payload requires a new quote instead of reusing an old result.
        JSON.stringify({
          items: request.items,
          customer: request.customer,
          paymentToken: request.paymentToken,
        }),
      )
      const tx = (await database.getPool()).transaction()
      await tx.begin()
      let committing = false
      try {
        // The course journal uses an SQL application lock; legacy mode uses a key-range lock.
        const saved = journal ? await journal.read(tx, request.token) : null
        const previous = journal
          ? { recordset: saved ? [saved] : [] }
          : await tx
              .request()
              .input('token', request.token)
              .query(
                'SELECT PatronId,RequestHash,ResultJson FROM dbo.EGCheckoutAttempts WITH(UPDLOCK,HOLDLOCK) WHERE AttemptId=@token',
              )
        if (previous.recordset.length) {
          const row = previous.recordset[0]
          if (String(row.PatronId) !== user.patronId || row.RequestHash !== requestHash)
            fail('This attempt belongs to another submission.', 409)
          if (row.ResultJson) {
            await tx.commit()
            return JSON.parse(row.ResultJson)
          }
        }
        const payment = payments.verify(request.paymentToken, request.token, user)
        // Hold inventory until the order commits; stage a recoverable receipt before committing.
        // validateConfirmation sorts IDs first. All purchases acquire locks in this stable order
        // to reduce deadlock risk when two customers buy overlapping listings.
        for (const line of request.items)
          await tx
            .request()
            .input('id', Number(line.itemId))
            .query('SELECT ItemId FROM dbo.Stocktake WITH(UPDLOCK,HOLDLOCK) WHERE ItemId=@id')
        const products = await loadCatalogue(
          { getPool: async () => tx },
          '',
          request.items.map((line) => line.itemId),
        )
        const error = validateCartItems(request.items, products)
        let result
        const quote = error.items ? null : quoteCart(request.items, products)
        if (!quote || JSON.stringify(compact(quote)) !== JSON.stringify(request.items)) {
          result = {
            status: 'changed',
            message:
              error.items ||
              'A price or source changed. Check availability and review the new total before submitting again.',
          }
        } else if (payment.outcome !== 'approved') {
          result = {
            status: payment.outcome,
            message: `Payment ${payment.outcome === 'declined' ? 'declined' : 'timed out'}. No order was created and your cart has been kept.`,
          }
        } else {
          const order = await writeOrder(tx, quote, request.customer, Number(user.patronId))
          if (!journal) {
            await tx
              .request()
              .input('id', Number(order.orderId))
              .input('cents', String(toCents(order.total)))
              .input('details', JSON.stringify(request.customer)).query(`
            INSERT dbo.EGOrderMetadata(OrderId,Status,TotalCents,DetailsJson) VALUES(@id,'approved',@cents,@details)`)
            for (const line of quote.items) {
              const source = line.product.offers.find((o) => o.itemId === line.itemId)
              await tx
                .request()
                .input('order', Number(order.orderId))
                .input('item', Number(line.itemId))
                .input('product', Number(line.productId))
                .input('source', Number(source.sourceId))
                .input('title', line.product.title)
                .input('name', source.sourceName)
                .input('price', String(toCents(line.product.price)))
                .input('quantity', line.quantity).query(`
              INSERT dbo.EGOrderLines(OrderId,ItemId,ProductId,SourceId,Title,SourceName,UnitPriceCents,Quantity)
              VALUES(@order,@item,@product,@source,@title,@name,@price,@quantity)`)
            }
          }
          result = {
            status: 'approved',
            ...order,
            payment: { brand: payment.brand, last4: payment.last4 },
          }
        }
        if (journal) {
          // The receipt is durable before SQL commits. Recovery verifies the allocated order ID;
          // a crash before COMMIT cannot turn this pending receipt into a successful order.
          await journal.write(request.token, {
            PatronId: user.patronId,
            RequestHash: requestHash,
            ResultJson: JSON.stringify(result),
            OrderId: result.orderId || null,
            pending: result.status === 'approved',
            customer: request.customer,
            lines: quote?.items.map((line) => ({
              itemId: line.itemId,
              productId: line.productId,
              sourceName: line.product.sourceName,
              title: line.product.title,
              priceCents: toCents(line.product.price),
              quantity: line.quantity,
            })),
          })
        } else
          await tx
            .request()
            .input('token', request.token)
            .input('patron', Number(user.patronId))
            .input('hash', requestHash)
            .input('status', result.status.replace('-', '_'))
            .input('json', JSON.stringify(result))
            .input('order', result.orderId ? Number(result.orderId) : null).query(`
          INSERT dbo.EGCheckoutAttempts(AttemptId,PatronId,RequestHash,Status,ResultJson,OrderId)
          VALUES(@token,@patron,@hash,@status,@json,@order)`)
        committing = true
        await tx.commit()
        return result
      } catch (error) {
        await tx.rollback().catch(() => {})
        if (committing) {
          const recovered = await status(request.token, user).catch(() => null)
          if (recovered && recovered.status !== 'not-found') return recovered
          throw new CheckoutError(
            'The result is uncertain. Check this attempt or retry the same submission; do not start a new payment.',
            503,
          )
        }
        throw error
      }
    },
  }
}
