import { useOutletContext } from 'react-router-dom'
import { BarList, ChartCard, LineChart, StackedBar } from '../../components/charts.jsx'
import { seriesColors } from '../../components/chartColors.js'
import { formatPrice, salePrice, useProducts } from '../../data/productStore.js'
import { productSalesTotals, salesByMonth } from '../../data/mockSales.js'
import { roleLabel, userRoles, useUsers } from '../../data/userStore.js'

const lowStockLimit = 10
// Reserved status colours; each always ships with an icon and a label so colour never carries meaning alone.
const stockStatus = {
  ok: { label: 'In stock', icon: '✓', color: '#0ca30c', ink: '#fff' },
  low: { label: 'Low stock', icon: '!', color: '#fab219', ink: '#252720' },
  out: { label: 'Out of stock', icon: '✕', color: '#d03b3b', ink: '#fff' },
}
const statusOf = quantity => quantity === 0 ? stockStatus.out : quantity < lowStockLimit ? stockStatus.low : stockStatus.ok

const number = new Intl.NumberFormat('en-AU')
const compactPrice = new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', notation: 'compact', maximumFractionDigits: 1 })
const percent = new Intl.NumberFormat('en-AU', { style: 'percent', maximumFractionDigits: 1, signDisplay: 'exceptZero' })
const monthName = (month, style) => new Intl.DateTimeFormat('en-AU', style === 'long' ? { month: 'long', year: 'numeric' } : { month: 'short' }).format(new Date(`${month}-01T00:00:00`))
const change = (now, before) => before ? (now - before) / before : 0
const count = (value, noun) => `${number.format(value)} ${noun}${value === 1 ? '' : 's'}`

function Stat({ label, value, delta, detail }) {
  return (
    <article className="stat">
      <span className="stat__label">{label}</span>
      <strong>{value}</strong>
      {delta && <span className={`stat__delta stat__delta--${delta.value < 0 ? 'down' : 'up'}`}>
        <span aria-hidden="true">{delta.value < 0 ? '▼' : '▲'}</span> {percent.format(delta.value)} {delta.label}
      </span>}
      {detail && <small>{detail}</small>}
    </article>
  )
}

export default function DashboardPage() {
  const user = useOutletContext()
  const products = useProducts()
  const users = useUsers()

  const [previous, latest] = salesByMonth.slice(-2)
  const firstMonth = monthName(salesByMonth[0].month, 'long')
  const latestMonth = monthName(latest.month, 'long')
  const versusPrevious = `vs ${monthName(previous.month, 'short')}`
  const sixMonthRevenue = salesByMonth.reduce((total, month) => total + month.revenue, 0)
  const inventoryValue = products.reduce((total, product) => total + product.quantity * salePrice(product), 0)
  const unitsInStock = products.reduce((total, product) => total + product.quantity, 0)
  const needsAttention = products.filter(product => product.quantity < lowStockLimit).length

  const revenue = salesByMonth.map(month => ({ label: monthName(month.month, 'long'), short: monthName(month.month, 'short'), value: month.revenue }))
  const sales = products
    .map(product => ({ id: product.id, label: product.title, ...productSalesTotals(product.id) }))
    .sort((a, b) => b.units - a.units)
  const stock = [...products].sort((a, b) => a.quantity - b.quantity)
  const roles = userRoles.map((role, index) => ({ key: role, label: `${roleLabel(role)}s`, value: users.filter(account => account.role === role).length, color: seriesColors[index] }))

  return (
    <>
      <p className="eyebrow">{roleLabel(user.role)} dashboard</p>
      <h1>Welcome, {user.name}!</h1>
      <p className="lead">Sales figures are sample data from {firstMonth} to {latestMonth}. Stock, prices, and accounts reflect the current catalogue. Prices are in AUD.</p>

      <div className="stats">
        <Stat label={`Revenue, ${latestMonth}`} value={formatPrice(latest.revenue)} delta={{ value: change(latest.revenue, previous.revenue), label: versusPrevious }} />
        <Stat label={`Units sold, ${latestMonth}`} value={number.format(latest.units)} delta={{ value: change(latest.units, previous.units), label: versusPrevious }} />
        <Stat label="Revenue, last 6 months" value={formatPrice(sixMonthRevenue)} detail={`${number.format(salesByMonth.reduce((total, month) => total + month.units, 0))} units sold`} />
        <Stat label="Inventory value" value={formatPrice(inventoryValue)} detail="Units in stock × selling price" />
        <Stat label="Units in stock" value={number.format(unitsInStock)} detail={`${needsAttention} of ${products.length} products low or out of stock`} />
        <Stat label="User accounts" value={number.format(users.length)} detail={`${count(users.filter(account => account.role === 'customer').length, 'customer')} · ${users.filter(account => account.role !== 'customer').length} staff`} />
      </div>

      <div className="chart-grid">
        <ChartCard wide title="Monthly revenue" subtitle={`Sample sales, ${firstMonth} to ${latestMonth}`}
          table={{ columns: ['Month', 'Units sold', 'Revenue'], rows: salesByMonth.map(month => [monthName(month.month, 'long'), number.format(month.units), formatPrice(month.revenue)]) }}>
          <LineChart data={revenue} name="Revenue" format={formatPrice} formatTick={value => compactPrice.format(value)} />
        </ChartCard>

        <ChartCard title="Units sold by product" subtitle="Sample sales over the last 6 months, best sellers first"
          table={{ columns: ['Product', 'Units sold', 'Revenue'], rows: sales.map(item => [item.label, number.format(item.units), formatPrice(item.revenue)]) }}>
          <BarList format={value => number.format(value)} series={[{ key: 'units', name: 'Units sold', color: seriesColors[0] }]}
            items={sales.map(item => ({ id: item.id, label: item.label, values: { units: item.units } }))} />
        </ChartCard>

        <ChartCard title="Stock levels" subtitle={`Units in stock now, lowest first. Under ${lowStockLimit} units counts as low stock.`}
          table={{ columns: ['Product', 'Units in stock', 'Status'], rows: stock.map(product => [product.title, number.format(product.quantity), statusOf(product.quantity).label]) }}>
          <BarList format={value => number.format(value)} series={[{ key: 'quantity', name: 'Units in stock' }]}
            items={stock.map(product => ({ id: product.id, label: product.title, values: { quantity: product.quantity }, status: statusOf(product.quantity) }))} />
        </ChartCard>

        <ChartCard title="Regular vs selling price" subtitle="Current price before and after each product's discount"
          legend={[{ label: 'Regular price', color: seriesColors[0] }, { label: 'Selling price', color: seriesColors[1] }]}
          table={{ columns: ['Product', 'Regular price', 'Discount', 'Selling price'], rows: products.map(product => [product.title, formatPrice(product.price), `${product.discount}%`, formatPrice(salePrice(product))]) }}>
          <BarList format={formatPrice} series={[{ key: 'price', name: 'Regular price', color: seriesColors[0] }, { key: 'sale', name: 'Selling price', color: seriesColors[1] }]}
            items={products.map(product => ({ id: product.id, label: product.title, values: { price: product.price, sale: salePrice(product) } }))} />
        </ChartCard>

        <ChartCard title="Accounts by role" subtitle="All customer and staff accounts"
          table={{ columns: ['Role', 'Accounts'], rows: roles.map(role => [role.label, number.format(role.value)]) }}>
          <StackedBar segments={roles} format={value => number.format(value)} />
        </ChartCard>
      </div>
    </>
  )
}
