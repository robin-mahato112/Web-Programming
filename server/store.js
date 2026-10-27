import { quoteCart, validateCartItems } from './catalogue.js'
import { readJson, sendJson } from './http.js'

/** Inject the catalogue reader so HTTP tests never need a running SQL Server. */
export function createStoreMiddleware(getProducts) {
  return async (req, res, next) => {
    const url = new URL(req.url, 'http://store.local')
    const path = url.pathname
    if (!['/api/products', '/api/cart'].includes(path)) {
      if (path === '/api' || path.startsWith('/api/'))
        return sendJson(res, 404, { error: 'API endpoint not found.' })
      return next()
    }
    const method = path === '/api/products' ? 'GET' : 'POST'
    if (req.method !== method) {
      res.setHeader('Allow', method)
      return sendJson(res, 405, { error: `Use ${method} for this endpoint.` })
    }
    const payload = method === 'POST' ? await readJson(req, res) : null
    if (method === 'POST' && payload === undefined) return
    const query = method === 'GET' ? (url.searchParams.get('q') || '').trim() : ''
    if (method === 'GET' && (url.searchParams.getAll('q').length > 1 || query.length > 200))
      return sendJson(res, 400, { error: 'Use one search term of at most 200 characters.' })
    try {
      const products = await getProducts(query)
      if (method === 'GET') return sendJson(res, 200, { products })
      const errors = validateCartItems(payload?.items, products)
      if (Object.keys(errors).length)
        return sendJson(res, 400, { error: 'Check the items in your cart.', errors })
      sendJson(res, 200, quoteCart(payload.items, products))
    } catch {
      sendJson(res, 503, { error: 'The product service is unavailable. Please try again.' })
    }
  }
}
