import { loadCatalogue } from './catalogue.js'
import { CheckoutError } from './orders.js'
import { fail, identifier } from './security.js'

/** Mount public keyword search and admin stock controls on the university API's existing SQL pool.
 * Reads preserve source-specific listing IDs. Writes change only Quantity, so no schema migration,
 * product deletion or order-history rewrite is needed. Expected validation errors stay actionable;
 * unexpected database failures return a generic message without exposing SQL or credentials. */
export function mountCourseStock(app, { database, requireAuth, origins }) {
  const handle = (action) => async (req, res) => {
    res.set('Cache-Control', 'no-store')
    try {
      res.json(await action(req))
    } catch (error) {
      res.status(error instanceof CheckoutError ? error.status : 503).json({
        error:
          error instanceof CheckoutError
            ? error.message
            : 'The stock service is unavailable. Reload before trying again.',
      })
    }
  }
  app.get(
    '/api/products',
    handle(async (req) => {
      const query = req.query.q ?? ''
      if (
        typeof query !== 'string' ||
        query.length > 200 ||
        [...query].some((character) => character.charCodeAt(0) < 32)
      )
        fail('Enter search keywords up to 200 characters.')
      return { products: await loadCatalogue(database, query) }
    }),
  )

  const admin = async (req) => {
    if (req.user?.role !== 'ADMIN') fail('An administrator session is required.', 403)
    // A stale cookie must not retain access after the administrator is removed or demoted.
    const result = await (await database.getPool())
      .request()
      .input('id', identifier(req.user.sub))
      .query('SELECT UserID FROM dbo.[User] WHERE UserID=@id AND isAdmin=1')
    if (!result.recordset.length) fail('This administrator account is unavailable.', 403)
  }
  app.get(
    '/api/admin/stock',
    requireAuth,
    handle(async (req) => {
      await admin(req)
      const result = await (await database.getPool()).request().query(`
      SELECT s.ItemId itemId, p.Name title, src.Source_name sourceName,
        s.Quantity quantity, s.Price price
      FROM dbo.Stocktake s JOIN dbo.Product p ON p.ID=s.ProductId
      JOIN dbo.Source src ON src.sourceid=s.SourceId ORDER BY p.Name,s.ItemId`)
      return { listings: result.recordset }
    }),
  )
  app.patch(
    '/api/admin/stock/:itemId',
    requireAuth,
    handle(async (req) => {
      await admin(req)
      if (!origins.includes(req.get('Origin')) || req.get('X-Stock-Request') !== '1')
        fail('Use the stock management form to save changes.', 403)
      if (!req.is('application/json')) fail('Send application/json.', 415)
      const itemId = identifier(req.params.itemId)
      const { quantity, expectedQuantity } = req.body ?? {}
      // Only these two fields may be written. Reject extras instead of accidentally accepting
      // a price/source change, and keep both values within SQL Server's non-negative int range.
      if (
        Object.keys(req.body ?? {}).some(
          (key) => !['quantity', 'expectedQuantity'].includes(key),
        ) ||
        ![quantity, expectedQuantity].every(
          (value) => Number.isInteger(value) && value >= 0 && value <= 2147483647,
        )
      )
        fail('Stock must be a whole number between 0 and 2147483647.')
      // Compare and update in one statement so a different current quantity is never overwritten.
      // This checks the current value, not a revision history (no version column is available).
      // On uncertain responses the UI reloads rather than blindly retrying a possibly committed save.
      const result = await (await database.getPool())
        .request()
        .input('id', itemId)
        .input('quantity', quantity)
        .input('expected', expectedQuantity).query(`UPDATE dbo.Stocktake SET Quantity=@quantity
        OUTPUT INSERTED.ItemId itemId, INSERTED.Quantity quantity
        WHERE ItemId=@id AND Quantity=@expected`)
      if (!result.recordset.length)
        fail('This listing changed or was removed. Reload stock before saving again.', 409)
      return { listing: result.recordset[0] }
    }),
  )
}
