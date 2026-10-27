import { databasePrice, mapCatalogueRows } from '../lib/catalogue-records.js'

const keys = { Product: 'id', Genre: 'genreid', Stocktake: 'itemid', Source: 'sourceid' }
const normalise = (row) =>
  Object.fromEntries(Object.entries(row).map(([key, value]) => [key.toLowerCase(), value]))

/** Read the supplied 2026 API's offset pages, including the final empty page when necessary.
 * Never return a partial catalogue after a failed/repeated page: that could remove valid saved carts. */
export async function readCourseTable(
  baseUrl,
  table,
  { fetcher = fetch, signal = AbortSignal.timeout(12000) } = {},
) {
  if (!Object.hasOwn(keys, table)) throw new Error('Unsupported catalogue table')
  const rows = [],
    seen = new Set()
  let offset = 0
  while (true) {
    const url = new URL('/api/inft3050/' + table, baseUrl)
    url.search = new URLSearchParams({ limit: '100', offset: String(offset) })
    const response = await fetcher(url, {
      signal,
      headers: { Accept: 'application/json' },
      redirect: 'error',
    })
    if (!response.ok) throw new Error('The course catalogue is unavailable.')
    const body = await response.json()
    signal.throwIfAborted()
    if (
      !Array.isArray(body?.list) ||
      typeof body.pageInfo?.isLastPage !== 'boolean' ||
      !Number.isInteger(body.pageInfo.pageSize) ||
      body.pageInfo.pageSize < 1 ||
      body.list.length > body.pageInfo.pageSize ||
      (!body.list.length && !body.pageInfo.isLastPage)
    )
      throw new Error('Invalid course API pagination')
    for (const raw of body.list) {
      if (!raw || typeof raw !== 'object' || Array.isArray(raw))
        throw new Error('Invalid course record')
      const row = normalise(raw),
        id = String(row[keys[table]])
      if (!/^[1-9]\d*$/.test(id) || Number(id) > 2147483647 || seen.has(id))
        throw new Error('Invalid or repeated course record')
      seen.add(id)
      rows.push(row)
    }
    if (body.pageInfo.isLastPage) return rows
    offset += body.pageInfo.pageSize
  }
}

/** Join the four supplied resources by their verified IDs. Public reads require no login/token.
 * Search runs on these current API records; it does not interpolate keywords into SQL or API grammar. */
export async function loadCourseCatalogue(baseUrl, query = '', options = {}) {
  const signal = options.signal || AbortSignal.timeout(12000)
  const [products, genres, listings, sources] = await Promise.all(
    Object.keys(keys).map((table) => readCourseTable(baseUrl, table, { ...options, signal })),
  )
  // Index each resource once rather than repeatedly scanning tables for every listing. Canonical
  // string IDs keep joins consistent with the cart and URLs even when drivers return numbers.
  const byId = (rows, key) => new Map(rows.map((row) => [String(row[key]), row]))
  const productMap = byId(products, 'id'),
    genreMap = byId(genres, 'genreid'),
    sourceMap = byId(sources, 'sourceid')
  const keywords = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
  const rows = listings.flatMap((listing) => {
    const product = productMap.get(String(listing.productid))
    const source = sourceMap.get(String(listing.sourceid))
    if (!product || !source)
      throw new Error('Course listing references a missing product or source')
    if (
      databasePrice(listing.price) === null ||
      !Number.isInteger(listing.quantity) ||
      listing.quantity < 0
    )
      throw new Error('Invalid course price or stock')
    const category = genreMap.get(String(product.genre))?.name
    if (
      !keywords.every((word) =>
        [product.name, product.description, product.author, category].some((value) =>
          String(value || '')
            .toLowerCase()
            .includes(word),
        ),
      )
    )
      return []
    return [
      {
        productId: product.id,
        title: product.name,
        description: product.description,
        author: product.author,
        subGenreId: product.subgenre,
        category,
        itemId: listing.itemid,
        sourceId: source.sourceid,
        sourceName: source.sourcename ?? source.source_name,
        stock: listing.quantity,
        price: listing.price,
      },
    ]
  })
  return mapCatalogueRows(rows).sort((a, b) => Number(a.id) - Number(b.id))
}
