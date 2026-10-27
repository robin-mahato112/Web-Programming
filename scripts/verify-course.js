import assert from 'node:assert/strict'
import { loadCourseCatalogue, readCourseTable } from '../server/course-catalogue.js'

// Read-only evidence: compare displayed API fields with the university's individual resources.
const base = process.env.COURSE_API_URL
if (!base) throw new Error('Set COURSE_API_URL to the running supplied 2026 API.')
const tables = await Promise.all(
  ['Product', 'Genre', 'Stocktake', 'Source'].map((name) => readCourseTable(base, name)),
)
const [products, genres, listings, sources] = tables
const displayed = { products: await loadCourseCatalogue(base) }
const samples = [
  ...new Set(
    [
      String(products[0]?.id),
      displayed.products.find((p) => p.offers.length > 1)?.id,
      displayed.products.find((p) => p.offers.some((o) => o.stock === 0))?.id,
    ].filter(Boolean),
  ),
]
const evidence = samples.map((id) => {
  const raw = products.find((p) => String(p.id) === id)
  const shown = displayed.products.find((p) => p.id === id)
  assert.ok(raw && shown)
  assert.equal(shown.title, raw.name.trim())
  assert.equal(shown.description, raw.description.trim())
  assert.equal(
    shown.category,
    genres.find((g) => String(g.genreid) === String(raw.genre)).name.trim(),
  )
  const stock = listings.filter((s) => String(s.productid) === id)
  assert.equal(shown.offers.length, stock.length)
  for (const offer of shown.offers) {
    const item = stock.find((s) => String(s.itemid) === offer.itemId)
    assert.ok(item)
    assert.equal(offer.stock, item.quantity)
    assert.equal(offer.price, Math.round(item.price * 100) / 100)
    const source = sources.find((s) => String(s.sourceid) === String(item.sourceid))
    assert.equal(offer.sourceName, (source.sourcename ?? source.source_name).trim())
  }
  return {
    productId: id,
    title: shown.title,
    category: shown.category,
    offers: shown.offers,
    comparison: 'matched',
  }
})
console.log(
  JSON.stringify(
    {
      catalogueSource: 'course-2026 (adapter/API comparison; browser checked separately)',
      products: products.length,
      listings: listings.length,
      displayedProducts: displayed.products.length,
      evidence,
    },
    null,
    2,
  ),
)
