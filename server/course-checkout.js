import { createCheckout } from './checkout.js'
import { CheckoutError } from './orders.js'
import { fail } from './security.js'
import { createCheckoutJournal } from './checkout-journal.js'
import { mountCourseStock } from './course-stock.js'

/** Extend the university server using its verified cookie and its own SQL pool.
 * JSON plus an explicit origin/custom header prevents cross-site cookie-authenticated writes. */
export function mountCourseCheckout(
  app,
  { database, requireAuth, origins, paymentKey, journalDirectory },
) {
  mountCourseStock(app, { database, requireAuth, origins })
  const checkout = createCheckout(
    database,
    paymentKey,
    journalDirectory ? { journal: createCheckoutJournal(journalDirectory) } : {},
  )
  const prefix = '/api/checkout'
  const handle = (action) => async (req, res) => {
    try {
      if (req.user?.role !== 'PATRON') fail('A customer session is required.', 403)
      const id = String(req.user.sub)
      if (!/^[1-9]\d*$/.test(id) || Number(id) > 2147483647) fail('Invalid customer session.', 401)
      if (req.method !== 'GET') {
        if (!origins.includes(req.get('Origin')) || req.get('X-Checkout-Request') !== '1')
          fail('Use the storefront to submit checkout.', 403)
        if (!req.is('application/json')) fail('Send application/json.', 415)
      }
      // Resolve current identity from SQL; never accept customer IDs or roles in the request body.
      const result = await (await database.getPool())
        .request()
        .input('id', Number(id))
        .query('SELECT Email FROM dbo.Patrons WHERE UserID=@id')
      if (!result.recordset[0]) fail('This customer account is unavailable.', 401)
      const user = { id, patronId: id, email: result.recordset[0].Email, role: 'customer' }
      res.json(await action(req, user))
    } catch (error) {
      res.status(error instanceof CheckoutError ? error.status : 503).json({
        error:
          error instanceof CheckoutError
            ? error.message
            : 'Checkout is temporarily unavailable. Please retry the same attempt.',
      })
    }
  }
  app.use(
    prefix,
    (req, res, next) => {
      res.set('Cache-Control', 'no-store')
      next()
    },
    requireAuth,
  )
  app.post(
    prefix + '/prepare',
    handle((req, user) => checkout.prepare(req.body?.items, req.body?.customer, user)),
  )
  app.post(
    prefix + '/payment-method',
    handle((req, user) => checkout.paymentMethod(req.body, user)),
  )
  app.post(
    prefix + '/confirm',
    handle((req, user) => checkout.confirm(req.body, user)),
  )
  app.get(
    prefix + '/:token',
    handle((req, user) => checkout.status(req.params.token, user)),
  )
}
