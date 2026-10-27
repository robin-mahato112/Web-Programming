import assert from 'node:assert/strict'
import { test } from 'node:test'
import { recommendProducts } from '../src/lib/recommendations.js'

const product = (id, category = 'Books', subGenreId = '3', stock = 2) => ({
  id,
  title: 'Title ' + id,
  category,
  subGenreId,
  stock,
})

test('recommendations match category and subgenre, excluding cart titles and unavailable stock', () => {
  const products = [
    product('1'),
    product('2'),
    product('3', 'Games'),
    product('4', 'Books', '4'),
    product('5', 'Books', '3', 0),
    product('6'),
  ]
  assert.deepEqual(
    recommendProducts(products, [products[0]], ['6']).map((p) => p.id),
    ['2'],
  )
  assert.equal(products[0].id, '1', 'Selection must not reorder or mutate the catalogue')
})

test('missing subgenres use only a known category and no matches render no suggestions', () => {
  const products = [product('1', 'Books', null), product('2'), product('3', 'Games')]
  assert.deepEqual(
    recommendProducts(products, [products[0]]).map((p) => p.id),
    ['2'],
  )
  assert.deepEqual(recommendProducts(products, [product('9', 'Movies')]), [])
  assert.deepEqual(recommendProducts([product('2', 'Other')], [product('1', 'Other')]), [])
  assert.deepEqual(recommendProducts(products, []), [])
})

test('multiple selected sources do not duplicate recommendations and suggestions stay bounded', () => {
  const products = Array.from({ length: 10 }, (_, index) => product(String(index + 1)))
  const picks = recommendProducts(products, [products[0], products[0]])
  assert.equal(picks.length, 4)
  assert.equal(new Set(picks.map((p) => p.id)).size, 4)
})
