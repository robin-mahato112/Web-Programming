import { fail, identifier } from './security.js'
import { toCents } from '../src/lib/money.js'

export function createManagement(database) {
  return {
    async users() {
      const { recordset } = await (await database.getPool()).request().query(`
        SELECT 'customer' role,CONVERT(varchar(20),UserID) id,Name name,Email email,NULL username FROM dbo.Patrons
        UNION ALL SELECT CASE WHEN isAdmin=1 THEN 'admin' ELSE 'employee' END,CONVERT(varchar(20),UserID),Name,Email,UserName FROM dbo.[User]`)
      return { users: recordset }
    },
    async listings() {
      const { recordset } = await (await database.getPool()).request().query(`
        SELECT CONVERT(varchar(20),s.ItemId) itemId,p.Name title,src.Source_name sourceName,
        s.Quantity quantity,s.Price price,sys.fn_varbintohexstr(s.EGRv) version
        FROM dbo.Stocktake s JOIN dbo.Product p ON p.ID=s.ProductId JOIN dbo.Source src ON src.sourceid=s.SourceId`)
      return { listings: recordset }
    },
    async updateListing(id, body, user) {
      const itemId = identifier(id),
        cents = toCents(body?.price)
      if (
        !Number.isSafeInteger(cents) ||
        toCents(cents / 100) !== cents ||
        !Number.isInteger(body?.quantity) ||
        body.quantity < 0 ||
        body.quantity > 2147483647 ||
        !['set', 'add'].includes(body.mode) ||
        !/^0x[\da-f]{16}$/i.test(body.version || '')
      )
        fail('Enter a valid price, quantity, stock action and current version.')
      const tx = (await database.getPool()).transaction()
      await tx.begin()
      try {
        const updated = await tx
          .request()
          .input('id', itemId)
          .input('price', cents / 100)
          .input('quantity', body.quantity)
          .input('mode', body.mode)
          .input('version', Buffer.from(body.version.slice(2), 'hex')).query(`
          UPDATE dbo.Stocktake SET Price=@price,Quantity=CASE WHEN @mode='add' THEN Quantity+@quantity ELSE @quantity END
          OUTPUT INSERTED.ProductId productId
          WHERE ItemId=@id AND EGRv=@version
          AND (@mode='set' OR CONVERT(bigint,Quantity)+@quantity<=2147483647)`)
        if (!updated.recordset.length)
          fail('This listing changed or the quantity is too large. Reload before saving.', 409)
        await tx
          .request()
          .input('id', Number(updated.recordset[0].productId))
          .input('user', user.username)
          .query(
            'UPDATE dbo.Product SET LastUpdatedBy=@user,LastUpdated=SYSUTCDATETIME() WHERE ID=@id',
          )
        await tx.commit()
        return {
          message: 'Listing saved. Customers see this stock and price on their next request.',
        }
      } catch (error) {
        await tx.rollback().catch(() => {})
        throw error
      }
    },
    async deleteProduct(id) {
      const tx = (await database.getPool()).transaction()
      await tx.begin()
      try {
        const productId = identifier(id)
        const product = await tx
          .request()
          .input('id', productId)
          .query('SELECT ID FROM dbo.Product WITH(UPDLOCK,HOLDLOCK) WHERE ID=@id')
        if (!product.recordset.length) fail('Product not found.', 404)
        const linked = await tx.request().input('id', productId).query(`
          SELECT s.ItemId FROM dbo.Stocktake s WITH(UPDLOCK,HOLDLOCK)
          WHERE s.ProductId=@id AND (EXISTS(SELECT 1 FROM dbo.ProductsInOrders l WHERE l.produktId=s.ItemId)
          OR EXISTS(SELECT 1 FROM dbo.EGOrderLines h WHERE h.ItemId=s.ItemId))`)
        if (linked.recordset.length)
          fail(
            'This product has order history and cannot be deleted. Set unavailable listings to zero stock instead.',
            409,
          )
        await tx
          .request()
          .input('id', productId)
          .query('DELETE dbo.Stocktake WHERE ProductId=@id; DELETE dbo.Product WHERE ID=@id')
        await tx.commit()
        return { message: 'Product deleted.' }
      } catch (error) {
        await tx.rollback().catch(() => {})
        throw error
      }
    },
    async profile(user) {
      return { user }
    },
    async orders(user, id) {
      const request = (await database.getPool()).request().input('patron', Number(user.patronId))
      if (id) request.input('id', identifier(id))
      const result = await request.query(`
        SELECT o.OrderID orderId,m.CreatedAt createdAt,m.Status status,m.TotalCents totalCents,m.DetailsJson details
        FROM dbo.Orders o JOIN dbo.[TO] c ON c.customerID=o.customer
        LEFT JOIN dbo.EGOrderMetadata m ON m.OrderId=o.OrderID
        WHERE c.PatronId=@patron ${id ? 'AND o.OrderID=@id' : ''} ORDER BY o.OrderID DESC`)
      if (id && !result.recordset.length) fail('Order not found.', 404)
      if (!id)
        return {
          orders: result.recordset.map(({ details, ...order }) => ({
            ...order,
            details: details ? JSON.parse(details) : null,
          })),
        }
      const lines = await (await database.getPool()).request().input('id', identifier(id)).query(`
        SELECT l.produktId itemId,l.Quantity quantity,h.Title title,h.SourceName sourceName,h.UnitPriceCents unitPriceCents
        FROM dbo.ProductsInOrders l LEFT JOIN dbo.EGOrderLines h ON h.OrderId=l.OrderId AND h.ItemId=l.produktId WHERE l.OrderId=@id`)
      return {
        order: {
          ...result.recordset[0],
          details: result.recordset[0].details ? JSON.parse(result.recordset[0].details) : null,
          items: lines.recordset,
        },
      }
    },
  }
}
