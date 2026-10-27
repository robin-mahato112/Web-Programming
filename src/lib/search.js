export const defaultFilters = {
  query: '',
  category: 'All',
  inStockOnly: false,
  maxPrice: null,
  sort: 'featured',
}

/** Parse shareable search state defensively; unrelated parameters never become return URLs. */
export function readSearch(search) {
  const params = new URLSearchParams(search)
  const price = params.get('price')
  const maxPrice = price !== null && price.trim() !== '' ? Number(price) : NaN
  const sort = params.get('sort')
  return {
    query: (params.get('q') || '').trim().slice(0, 200),
    category: (params.get('category') || 'All').slice(0, 50),
    inStockOnly: params.get('stock') === '1',
    maxPrice:
      Number.isFinite(maxPrice) && maxPrice >= 0 && maxPrice <= 90071992547409 ? maxPrice : null,
    sort: ['featured', 'price-low', 'price-high', 'name'].includes(sort) ? sort : 'featured',
  }
}

/** Keep only catalogue controls when moving between results, details and the cart. */
export function searchQuery(filters) {
  const params = new URLSearchParams()
  if (filters.query.trim()) params.set('q', filters.query.trim())
  if (filters.category !== 'All') params.set('category', filters.category)
  if (filters.maxPrice !== null) params.set('price', String(filters.maxPrice))
  if (filters.inStockOnly) params.set('stock', '1')
  if (filters.sort !== 'featured') params.set('sort', filters.sort)
  return params.size ? '?' + params.toString() : ''
}

export const catalogueQuery = (search) => searchQuery(readSearch(search))
