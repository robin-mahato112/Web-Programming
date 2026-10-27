import { CheckoutError } from './orders.js'
import { emailAddress, fail, identifier, inputText } from './security.js'

export function listingValues(value) {
  if (!Number.isInteger(value?.quantity) || value.quantity < 0 || value.quantity > 2147483647)
    fail('Quantity must be a non-negative SQL integer.')
  if (
    typeof value.price !== 'number' ||
    !Number.isFinite(value.price) ||
    value.price < 0 ||
    value.price > 1000000 ||
    Math.abs(value.price * 100 - Math.round(value.price * 100)) > 0.000001
  )
    fail('Price must be between 0 and 1,000,000 with at most two decimal places.')
  return { quantity: value.quantity, price: value.price }
}

export function newProductValues(value) {
  const result = {
    title: inputText(value?.title, 'title'),
    author: inputText(value?.author, 'author'),
    description: typeof value?.description === 'string' ? value.description.trim() : '',
    genreId: identifier(value?.genreId),
    subGenreId: identifier(value?.subGenreId),
    published: value?.published || null,
  }
  if (result.description.length > 4000) fail('Description must be at most 4000 characters.')
  if (
    result.published &&
    (!/^\d{4}-\d{2}-\d{2}$/.test(result.published) ||
      !Number.isFinite(Date.parse(result.published)) ||
      new Date(result.published).toISOString().slice(0, 10) !== result.published)
  )
    fail('Enter a valid publication date.')
  if (!Array.isArray(value?.listings) || !value.listings.length || value.listings.length > 50)
    fail('Choose between 1 and 50 formats.')
  result.listings = value.listings.map((item) => ({
    sourceId: identifier(item.sourceId),
    ...listingValues(item),
  }))
  if (new Set(result.listings.map((item) => item.sourceId)).size !== result.listings.length)
    fail('Choose each format once.')
  return result
}

/** Extend the supplied pool without new tables. Product edits and staff changes are
 * transactional, while existing password creation keeps the university hashing code. */
export function mountCourseManagement(app, { database, requireAuth, origins }) {
  const handle = (action) => async (req, res) => {
    res.set('Cache-Control', 'no-store')
    try {
      if (!origins.includes(req.get('Origin')) || req.get('X-Management-Request') !== '1')
        fail('Use the management form.', 403)
      if (!req.is('application/json')) fail('Send application/json.', 415)
      if (req.user?.role !== 'ADMIN') fail('Administrator access required.', 403)
      const tx = (await database.getPool()).transaction()
      await tx.begin()
      try {
        // Read the current role inside the same transaction, not just the login token.
        const admins = (
          await tx
            .request()
            .query(
              'SELECT UserID,UserName,isAdmin FROM dbo.[User] WITH(UPDLOCK,HOLDLOCK) ORDER BY UserID',
            )
        ).recordset
        const actor = admins.find(
          (user) => user.UserID === identifier(req.user.sub) && user.isAdmin,
        )
        if (!actor) fail('This administrator account is unavailable.', 403)
        const result = await action(req, tx, actor, admins)
        await tx.commit()
        res.json(result)
      } catch (error) {
        await tx.rollback().catch(() => {})
        throw error
      }
    } catch (error) {
      res.status(error instanceof CheckoutError ? error.status : 503).json({
        error:
          error instanceof CheckoutError
            ? error.message
            : 'Management could not complete the request. Reload before retrying.',
      })
    }
  }
  app.post(
    '/api/admin/products',
    requireAuth,
    handle(async (req, tx, actor) => {
      const product = newProductValues(req.body)
      const genres = (
        await tx
          .request()
          .input('id', product.genreId)
          .query('SELECT Name FROM dbo.Genre WHERE GenreID=@id')
      ).recordset
      const table = { Books: 'Book_genre', Games: 'Game_genre', Movies: 'Movie_genre' }[
        genres[0]?.Name
      ]
      if (!table) fail('Choose a supported category.')
      const sub = await tx
        .request()
        .input('id', product.subGenreId)
        .query(`SELECT SubGenreID FROM dbo.[${table}] WHERE SubGenreID=@id`)
      if (!sub.recordset.length) fail('Choose a sub-genre belonging to the category.')
      for (const item of product.listings) {
        const source = await tx
          .request()
          .input('id', item.sourceId)
          .input('genre', product.genreId)
          .query('SELECT sourceid FROM dbo.Source WHERE sourceid=@id AND Genre=@genre')
        if (!source.recordset.length) fail('A selected format does not belong to the category.')
      }
      const row = await tx
        .request()
        .input('name', product.title)
        .input('author', product.author)
        .input('description', product.description)
        .input('genre', product.genreId)
        .input('subgenre', product.subGenreId)
        .input('published', product.published)
        .input('actor', actor.UserName)
        .query(`INSERT dbo.Product(Name,Author,Description,Genre,SubGenre,Published,LastUpdatedBy,LastUpdated)
      OUTPUT INSERTED.ID VALUES(@name,@author,@description,@genre,@subgenre,@published,@actor,SYSUTCDATETIME())`)
      const id = row.recordset[0].ID
      for (const item of product.listings)
        await tx
          .request()
          .input('product', id)
          .input('source', item.sourceId)
          .input('price', item.price)
          .input('quantity', item.quantity)
          .query(
            'INSERT dbo.Stocktake(ProductId,SourceId,Price,Quantity) VALUES(@product,@source,@price,@quantity)',
          )
      return { productId: id }
    }),
  )
  app.patch(
    '/api/admin/products/:id',
    requireAuth,
    handle(async (req, tx, actor) => {
      const id = identifier(req.params.id)
      if (
        !Array.isArray(req.body?.listings) ||
        !req.body.listings.length ||
        req.body.listings.length > 50
      )
        fail('Choose listings to update.')
      const items = req.body.listings
        .map((item) => ({
          itemId: identifier(item.itemId),
          ...listingValues(item),
          expected: listingValues(item.expected),
        }))
        .sort((a, b) => a.itemId - b.itemId)
      if (new Set(items.map((item) => item.itemId)).size !== items.length)
        fail('Duplicate listing.')
      for (const item of items) {
        const saved = await tx
          .request()
          .input('id', item.itemId)
          .input('product', id)
          .input('price', item.price)
          .input('quantity', item.quantity)
          .input('oldPrice', item.expected.price)
          .input('oldQuantity', item.expected.quantity)
          .query(`UPDATE dbo.Stocktake SET Price=@price,Quantity=@quantity OUTPUT INSERTED.ItemId
        WHERE ItemId=@id AND ProductId=@product AND Price=@oldPrice AND Quantity=@oldQuantity`)
        if (!saved.recordset.length)
          fail('A listing changed or was removed. Reload before saving again.', 409)
      }
      await tx
        .request()
        .input('id', id)
        .input('actor', actor.UserName)
        .query(
          'UPDATE dbo.Product SET LastUpdatedBy=@actor,LastUpdated=SYSUTCDATETIME() WHERE ID=@id',
        )
      return { saved: true }
    }),
  )
  app.delete(
    '/api/admin/products/:id',
    requireAuth,
    handle(async (req, tx) => {
      const id = identifier(req.params.id)
      const product = await tx
        .request()
        .input('id', id)
        .query('SELECT ID FROM dbo.Product WITH(UPDLOCK,HOLDLOCK) WHERE ID=@id')
      if (!product.recordset.length) fail('Product not found.', 404)
      const listings = await tx
        .request()
        .input('id', id)
        .query(
          'SELECT ItemId FROM dbo.Stocktake WITH(UPDLOCK,HOLDLOCK) WHERE ProductId=@id ORDER BY ItemId',
        )
      for (const item of listings.recordset) {
        const orders = await tx
          .request()
          .input('id', item.ItemId)
          .query(
            'SELECT TOP 1 OrderId FROM dbo.ProductsInOrders WITH(UPDLOCK,HOLDLOCK) WHERE produktId=@id',
          )
        if (orders.recordset.length)
          fail('This product has order history. Set its stock to zero instead of deleting it.', 409)
      }
      await tx
        .request()
        .input('id', id)
        .query('DELETE dbo.Stocktake WHERE ProductId=@id; DELETE dbo.Product WHERE ID=@id')
      return { deleted: true }
    }),
  )
  const changeUser = (deleting) =>
    handle(async (req, tx, actor, users) => {
      const id = identifier(req.params.id)
      const target = users.find((user) => user.UserID === id)
      if (!target) fail('Staff account not found.', 404)
      if (!deleting && !['admin', 'employee'].includes(req.body?.role))
        fail('Choose a valid staff role.')
      const demoting = deleting || req.body.role !== 'admin'
      if (
        id === actor.UserID &&
        (deleting || Boolean(target.isAdmin) !== (req.body.role === 'admin'))
      )
        fail('You cannot remove your own access.', 409)
      if (target.isAdmin && demoting && users.filter((user) => user.isAdmin).length <= 1)
        fail('At least one administrator must remain.', 409)
      if (deleting) {
        await tx
          .request()
          .input('old', target.UserName)
          .input('actor', actor.UserName)
          .query('UPDATE dbo.Product SET LastUpdatedBy=@actor WHERE LastUpdatedBy=@old')
        await tx.request().input('id', id).query('DELETE dbo.[User] WHERE UserID=@id')
      } else
        await tx
          .request()
          .input('id', id)
          .input('name', inputText(req.body.name, 'name', 100))
          .input('admin', req.body.role === 'admin')
          .query('UPDATE dbo.[User] SET Name=@name,isAdmin=@admin WHERE UserID=@id')
      return { saved: true }
    })
  app.patch('/api/admin/users/:id', requireAuth, changeUser(false))
  app.delete('/api/admin/users/:id', requireAuth, changeUser(true))

  // Block bypasses through the generic CRUD API. Install this before its data routes.
  app.use('/api/inft3050', (req, res, next) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next()
    const table = req.path.split('/')[1]?.toLowerCase()
    if (
      ['product', 'stocktake', 'orders', 'productsinorders'].includes(table) ||
      (table === 'user' && req.method !== 'POST')
    )
      return res.status(403).json({ error: 'Use the controlled management or checkout endpoint.' })
    if (!['user', 'patrons', 'to'].includes(table)) return next()
    const validate = async () => {
      if (!origins.includes(req.get('Origin')) || !req.is('application/json'))
        fail('Use the account form.', 403)
      if (table === 'user') {
        if (req.user?.role !== 'ADMIN') fail('Administrator access required.', 403)
        const actor = await (await database.getPool())
          .request()
          .input('id', identifier(req.user.sub))
          .query('SELECT UserID FROM dbo.[User] WHERE UserID=@id AND isAdmin=1')
        if (!actor.recordset.length) fail('Administrator access required.', 403)
        if (
          !/^[A-Za-z0-9._-]{3,50}$/.test(req.body?.UserName || '') ||
          typeof req.body.IsAdmin !== 'boolean'
        )
          fail('Enter a valid username and role.')
      }
      if (table === 'user' || table === 'patrons') {
        if (req.method !== 'POST') fail('This account change is not supported.', 403)
        inputText(req.body?.Name, 'name', 100)
        if (table === 'patrons' || req.body.Email) emailAddress(req.body?.Email)
        const password = req.body?.HashPW
        if (
          typeof password !== 'string' ||
          password.length < 8 ||
          password.length > 128 ||
          !/[A-Za-z]/.test(password) ||
          !/\d/.test(password)
        )
          fail('Use 8–128 characters with letters and numbers.')
        const allowed =
          table === 'user'
            ? ['UserName', 'Name', 'Email', 'IsAdmin', 'HashPW']
            : ['Name', 'Email', 'HashPW']
        if (Object.keys(req.body).some((key) => !allowed.includes(key)))
          fail('Unexpected account field.')
      }
      if (
        table === 'to' &&
        Object.keys(req.body || {}).some(
          (key) =>
            ![
              'PatronId',
              'Email',
              'PhoneNumber',
              'StreetAddress',
              'PostCode',
              'Suburb',
              'State',
            ].includes(key),
        )
      )
        fail('Only delivery details may be saved here.')
    }
    const run = () =>
      validate()
        .then(() => next())
        .catch((error) =>
          res.status(error instanceof CheckoutError ? error.status : 503).json({
            error: error instanceof CheckoutError ? error.message : 'Account request unavailable.',
          }),
        )
    if (table === 'user' || table === 'to') return requireAuth(req, res, run)
    return run()
  })
}
