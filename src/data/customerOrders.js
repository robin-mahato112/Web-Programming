import api from '../api.js'
import { field } from './backend.js'
import { getSessionUser } from './session.js'

// AI-assisted: read-only account history using the course API's patron row-level permissions.
// Client ownership checks are defence in depth; the server must enforce access independently.
const id = (value) => {
  const text = String(value ?? '')
  if (!/^[1-9]\d*$/.test(text) || Number(text) > 2147483647)
    throw new Error('The order service returned an invalid identifier.')
  return text
}
function checkSession(userId, signal) {
  signal.throwIfAborted()
  const user = getSessionUser()
  if (user?.role !== 'customer' || String(user.userId) !== String(userId))
    throw new Error('Your account changed. Sign in again to view your orders.')
}
async function rows(table, params, userId, signal) {
  const result = []
  let previousPage
  for (let offset = 0; ; offset += 1000) {
    checkSession(userId, signal)
    const { data } = await api.get('/api/inft3050/' + table, {
      params: { ...params, limit: 1000, offset },
      signal,
    })
    checkSession(userId, signal)
    if (!Array.isArray(data?.list))
      throw new Error('The order service returned an incomplete response.')
    const page = JSON.stringify(data.list)
    if (page === previousPage && data.list.length)
      throw new Error('Could not load the complete order list. Please retry.')
    result.push(...data.list)
    if (data.list.length < 1000) return result
    previousPage = page
  }
}
const postcode = (value) =>
  value === null || value === undefined ? '' : String(value).padStart(4, '0')

export async function loadCustomerOrders(userId, signal) {
  const patron = id(userId)
  const contacts = await rows(
    'TO',
    { fields: 'CustomerID,PatronId', where: `(PatronId,eq,${patron})`, sort: 'CustomerID' },
    userId,
    signal,
  )
  const owned = new Set()
  for (const row of contacts) {
    if (id(field(row, 'PatronId')) !== patron)
      throw new Error('Order ownership could not be verified.')
    owned.add(id(field(row, 'CustomerID')))
  }
  if (!owned.size) return []
  const orders = await rows(
    'Orders',
    { fields: 'OrderID,Customer,StreetAddress,PostCode,Suburb,State', sort: '-OrderID' },
    userId,
    signal,
  )
  const seen = new Set()
  return orders
    .map((row) => {
      if (!owned.has(id(field(row, 'Customer'))))
        throw new Error('Order ownership could not be verified.')
      const orderId = id(field(row, 'OrderID'))
      if (seen.has(orderId)) throw new Error('The order service returned duplicate orders.')
      seen.add(orderId)
      return {
        orderId,
        address: [
          field(row, 'StreetAddress'),
          field(row, 'Suburb'),
          field(row, 'State'),
          postcode(field(row, 'PostCode')),
        ]
          .filter(Boolean)
          .join(', '),
      }
    })
    .sort((a, b) => Number(b.orderId) - Number(a.orderId))
}

async function optionalRow(table, rowId, fields, userId, signal) {
  checkSession(userId, signal)
  try {
    const { data } = await api.get(`/api/inft3050/${table}/${id(rowId)}`, {
      params: { fields },
      signal,
    })
    checkSession(userId, signal)
    return data
  } catch (error) {
    if (error.response?.status === 404) return null
    throw error
  }
}

export async function loadCustomerOrderItems(order, userId, signal) {
  const orderId = id(order.orderId)
  // The list endpoint returns every line; /ProductsInOrders/:id returns only the first line.
  const lines = await rows(
    'ProductsInOrders',
    { fields: 'OrderId,produktId,Quantity', where: `(OrderId,eq,${orderId})`, sort: 'produktId' },
    userId,
    signal,
  )
  const result = []
  const products = new Map()
  for (const row of lines) {
    if (id(field(row, 'OrderId')) !== orderId)
      throw new Error('Order item ownership could not be verified.')
    const itemId = id(field(row, 'produktId'))
    const quantity = Number(field(row, 'Quantity'))
    if (!Number.isSafeInteger(quantity) || quantity < 1)
      throw new Error('An order quantity is unavailable.')
    if (!products.has(itemId)) {
      const stock = await optionalRow('Stocktake', itemId, 'ItemId,ProductId', userId, signal)
      const product = stock
        ? await optionalRow('Product', field(stock, 'ProductId'), 'ID,Name', userId, signal)
        : null
      products.set(itemId, product && field(product, 'Name'))
    }
    result.push({ itemId, quantity, name: products.get(itemId) || 'Product no longer available' })
  }
  checkSession(userId, signal)
  return result
}

export function orderHistoryError(error) {
  if (error.response?.status === 401) return 'Sign in again to view your orders.'
  if (error.response?.status === 403) return 'Your account cannot access these orders.'
  if (error.response?.status >= 500 || error.isAxiosError)
    return 'Order history is temporarily unavailable. Please try again.'
  return error.message || 'Could not load your orders. Please try again.'
}
