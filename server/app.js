import express from 'express'
import { loadCourseCatalogue } from './course-catalogue.js'
import { loadCatalogue } from './catalogue.js'
import { createStoreMiddleware } from './store.js'
import { createAccounts, requireCsrf, requireRole } from './accounts.js'
import { createCheckout } from './checkout.js'
import { createManagement } from './management.js'
import { authenticationLimit, fail } from './security.js'
import { CheckoutError } from './orders.js'

export function createApp(
  database,
  {
    origins = ['http://127.0.0.1:5175', 'http://127.0.0.1:5176', 'http://127.0.0.1:3101'],
    production = false,
    courseApiUrl = '',
    accountSetup = {},
    paymentKey = process.env.PAYMENT_TOKEN_SECRET,
  } = {},
) {
  const app = express(),
    accounts = createAccounts(database, { production, accountSetup }),
    checkout = createCheckout(database, paymentKey),
    management = createManagement(database)
  const getProducts = (query) =>
    courseApiUrl ? loadCourseCatalogue(courseApiUrl, query) : loadCatalogue(database, query)
  app.disable('x-powered-by')
  app.use('/api', (req, res, next) => {
    res.set('Cache-Control', 'no-store').set('X-Content-Type-Options', 'nosniff')
    next()
  })
  app.get('/api/health', (req, res) => res.json({ status: 'ok' }))
  app.get('/api/ready', async (req, res) => {
    const result = await (await database.getPool())
      .request()
      .query(
        `SELECT CASE WHEN OBJECT_ID('dbo.EGSessions') IS NOT NULL AND OBJECT_ID('dbo.EGCredentials') IS NOT NULL AND OBJECT_ID('dbo.EGCheckoutAttempts') IS NOT NULL AND OBJECT_ID('dbo.EGOrderLines') IS NOT NULL AND OBJECT_ID('dbo.EGOrderMetadata') IS NOT NULL AND COL_LENGTH('dbo.Stocktake','EGRv') IS NOT NULL THEN 1 ELSE 0 END extensions`,
      )
    if (courseApiUrl) await getProducts('')
    res.json({
      catalogueSource: courseApiUrl ? 'course-2026' : 'project-sql',
      status: 'ready',
      database: true,
      capabilities: {
        accounts: Boolean(result.recordset[0].extensions),
        checkout: !courseApiUrl && Boolean(result.recordset[0].extensions),
        discounts: false,
      },
    })
  })
  const catalogue = createStoreMiddleware(getProducts)
  app.use((req, res, next) =>
    ['/api/products', '/api/cart'].includes(req.path) ? catalogue(req, res, next) : next(),
  )
  app.use(
    '/api',
    (req, res, next) => {
      if (['POST', 'PATCH', 'PUT'].includes(req.method) && !req.is('application/json'))
        return res.status(415).json({ error: 'Send the request as application/json.' })
      next()
    },
    express.json({ limit: '16kb' }),
  )
  // Course catalogue IDs must never be submitted to the separate Windows database.
  // The university API checkout extension owns this flow; this legacy adapter must not write it.
  app.use('/api/checkout', (req, res, next) => {
    if (courseApiUrl)
      return res
        .status(503)
        .json({ error: 'Ordering is currently unavailable. Your cart has been kept.' })
    next()
  })
  app.use('/api', async (req, res, next) => {
    req.session = await accounts.session(req)
    next()
  })
  app.get('/api/auth/session', async (req, res) =>
    res.json(
      req.session
        ? { user: req.session.user, csrf: req.session.csrf }
        : await accounts.issue(req, res),
    ),
  )
  app.use('/api', (req, res, next) => {
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) requireCsrf(req, origins)
    next()
  })
  const limit = authenticationLimit()
  app.post('/api/auth/register', limit, async (req, res) =>
    res.status(201).json(await accounts.issue(req, res, await accounts.register(req.body))),
  )
  app.post('/api/auth/login', limit, async (req, res) =>
    res.json(await accounts.issue(req, res, await accounts.login(req.body))),
  )
  app.post('/api/auth/logout', async (req, res) => res.json(await accounts.logout(req, res)))
  app.get('/api/profile', async (req, res) =>
    res.json(await management.profile(requireRole(req, 'customer'))),
  )
  app.patch('/api/profile', authenticationLimit(), async (req, res) => {
    requireRole(req, 'customer')
    res.json(await accounts.updateProfile(req.session, req.body))
  })
  app.post('/api/checkout/prepare', async (req, res) =>
    res.json(
      await checkout.prepare(req.body?.items, req.body?.customer, requireRole(req, 'customer')),
    ),
  )
  app.post('/api/checkout/payment-method', (req, res) =>
    res.json(checkout.paymentMethod(req.body, requireRole(req, 'customer'))),
  )
  app.post('/api/checkout/confirm', async (req, res) =>
    res.json(await checkout.confirm(req.body, requireRole(req, 'customer'))),
  )
  app.get('/api/checkout/:token', async (req, res) =>
    res.json(await checkout.status(req.params.token, requireRole(req, 'customer'))),
  )
  app.get('/api/orders', async (req, res) =>
    res.json(await management.orders(requireRole(req, 'customer'))),
  )
  app.get('/api/orders/:id', async (req, res) =>
    res.json(await management.orders(requireRole(req, 'customer'), req.params.id)),
  )
  app.get('/api/management/users', async (req, res) => {
    requireRole(req, 'admin', 'employee')
    res.json(await management.users())
  })
  app.get('/api/management/listings', async (req, res) => {
    requireRole(req, 'admin', 'employee')
    res.json(await management.listings())
  })
  app.post('/api/management/users', async (req, res) => {
    requireRole(req, 'admin')
    if (!['admin', 'employee'].includes(req.body?.role))
      fail('Choose an employee or administrator account.')
    const id = await accounts.register(req.body, req.body.role)
    res.status(201).json({ id })
  })
  app.patch('/api/management/listings/:id', async (req, res) =>
    res.json(await management.updateListing(req.params.id, req.body, requireRole(req, 'admin'))),
  )
  app.delete('/api/management/products/:id', async (req, res) => {
    requireRole(req, 'admin')
    res.json(await management.deleteProduct(req.params.id))
  })
  app.use('/api', (req, res) => res.status(404).json({ error: 'API endpoint not found.' }))
  // Known validation errors are safe for clients; SQL details and stack traces never leave the server.
  app.use((error, req, res, next) => {
    if (res.headersSent) return next(error)
    const status =
      error instanceof CheckoutError
        ? error.status
        : error.type === 'entity.too.large'
          ? 413
          : error.type === 'entity.parse.failed'
            ? 400
            : 503
    res.status(status).json({
      error:
        error instanceof CheckoutError
          ? error.message
          : status === 400
            ? 'Send valid JSON.'
            : status === 413
              ? 'The request is too large.'
              : 'The service is unavailable. Please try again.',
    })
  })
  return app
}
