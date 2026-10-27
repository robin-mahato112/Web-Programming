/**
 * Apply all catalogue constraints together, then sort a new array of the matching product objects.
 * Search is trimmed and case-insensitive across titles and categories; category selection is exact
 * and the price ceiling is inclusive. Featured or unrecognised sort values preserve source order.
 * Callers supply catalogue records and typed filter values; this helper does not validate API input.
 *
 * @param {Array<{title: string, category: string, price: number, stock: number}>} products Catalogue.
 * @param {object} [filters={}] Optional constraints and display ordering.
 * @param {string} [filters.query=''] Search text matched against title and category.
 * @param {string} [filters.category='All'] Exact category name, or All to include every category.
 * @param {boolean} [filters.inStockOnly=false] Exclude products whose stock is zero or less.
 * @param {number} [filters.maxPrice=100] Inclusive price limit in AUD.
 * @param {string} [filters.sort='featured'] featured, price-low, price-high or name.
 * @returns {Array<object>} A new array retaining original product references; products is unchanged.
 * @throws {TypeError} If inputs do not support the required array or string operations.
 */
export function filterProducts(
  products,
  { query = '', category = 'All', inStockOnly = false, maxPrice = 100, sort = 'featured' } = {},
) {
  const search = query.trim().toLowerCase()
  const results = products.filter(
    (product) =>
      `${product.title} ${product.category}`.toLowerCase().includes(search) &&
      (category === 'All' || product.category === category) &&
      (!inStockOnly || product.stock > 0) &&
      product.price <= maxPrice,
  )

  // filter() created the working array, so in-place sorting cannot reorder the shared catalogue.
  return results.sort((first, second) => {
    if (sort === 'price-low') return first.price - second.price
    if (sort === 'price-high') return second.price - first.price
    if (sort === 'name') return first.title.localeCompare(second.title)
    return 0
  })
}

/** Describe availability without coupling customer components to sample catalogue data. */
export function stockLabel(stock) {
  if (stock === 0) return 'Out of stock'
  if (stock <= 5) return `Only ${stock} left`
  return 'In stock'
}
