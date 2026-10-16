// Sprint 1 demo data only. Replace this module with totals from the Orders API later.
import { mockProducts } from './mockProducts.js'
import { salePrice } from './productStore.js'

export const salesMonths = ['2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09']

// Units sold per product for each month in salesMonths.
const unitsSold = {
  'stellar-odyssey': [14, 18, 21, 17, 24, 27],
  'pixel-legends': [32, 28, 35, 41, 38, 44],
  'midnight-reel': [9, 11, 8, 6, 4, 2],
  'guild-anthems': [12, 10, 15, 14, 19, 22],
  dragonfall: [25, 30, 27, 33, 36, 40],
  'neon-arena': [16, 19, 22, 20, 23, 21],
}

const round = value => Math.round(value * 100) / 100

// Revenue uses the sample catalogue's selling prices so history does not change when an admin edits a price.
export const salesByMonth = salesMonths.map((month, index) => {
  const products = Object.fromEntries(mockProducts.map(product => {
    const units = unitsSold[product.id][index]
    return [product.id, { units, revenue: round(units * salePrice(product)) }]
  }))
  const lines = Object.values(products)
  return {
    month,
    products,
    units: lines.reduce((total, line) => total + line.units, 0),
    revenue: round(lines.reduce((total, line) => total + line.revenue, 0)),
  }
})

export function productSalesTotals(productId) {
  return salesByMonth.reduce((total, month) => ({
    units: total.units + (month.products[productId]?.units ?? 0),
    revenue: round(total.revenue + (month.products[productId]?.revenue ?? 0)),
  }), { units: 0, revenue: 0 })
}
