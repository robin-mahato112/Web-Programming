import { mapCatalogueRows } from '../src/lib/catalogue-records.js'
export {
  databasePrice,
  mapCatalogueRows,
  validateCartItems,
  quoteCart,
} from '../src/lib/catalogue-records.js'

// Stocktake identifies an offer from one source; Product contains shared metadata.
const catalogueQuery = `
  SELECT p.ID AS productId, p.Name AS title, p.Description AS description,
         p.Author AS author, p.Subgenre AS subGenreId,
         g.Name AS category, st.ItemId AS itemId, s.sourceid AS sourceId,
         s.Source_name AS sourceName, st.Quantity AS stock, st.Price AS price
  FROM dbo.Product AS p
  LEFT JOIN dbo.Genre AS g ON g.genreID = p.Genre
  LEFT JOIN dbo.Stocktake AS st ON st.ProductId = p.ID
  LEFT JOIN dbo.Source AS s ON s.sourceid = st.SourceId`

/** Read fresh stock and prices without reserving items in the customer's cart. */
export async function loadCatalogue(database, query = '', itemIds) {
  const pool = await database.getPool()
  const request = pool.request()
  // Bind every keyword as data. Escape LIKE wildcards so '%' and '_' are literal searches.
  const conditions = query
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((keyword, index) => {
      const name = `keyword${index}`
      request.input(name, '%' + keyword.replace(/[~%_[]/g, '~$&') + '%')
      return `(p.Name LIKE @${name} ESCAPE '~' OR p.Description LIKE @${name} ESCAPE '~'
      OR p.Author LIKE @${name} ESCAPE '~' OR g.Name LIKE @${name} ESCAPE '~')`
    })
  if (itemIds) {
    const bindings = itemIds.map((id, index) => {
      request.input(`listing${index}`, Number(id))
      return `@listing${index}`
    })
    conditions.push(`st.ItemId IN (${bindings.join(',')})`)
  }
  const where = conditions.length ? '\n WHERE ' + conditions.join(' AND ') : ''
  // Sort the small mapped catalogue instead of asking SQL Server to sort joined long descriptions.
  // The latter required a memory grant that stalled this local instance; featured order is unchanged.
  const result = await request.query(catalogueQuery + where)
  return mapCatalogueRows(result.recordset).sort(
    (first, second) => Number(first.id) - Number(second.id),
  )
}
