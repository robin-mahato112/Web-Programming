import { useOutletContext } from 'react-router-dom'
import { BarList, ChartCard, LineChart, StackedBar } from '../../components/charts.jsx'
import { seriesColors } from '../../components/chartColors.js'
import ResourceStatus from '../../components/ResourceStatus.jsx'
import { countRows, createResource, useResource } from '../../data/backend.js'
import { catalogue, lowStockLimit } from '../../data/catalogue.js'
import { useDiscounts } from '../../data/discountStore.js'
import { formatPrice, salePrice } from '../../data/productStore.js'
import { accounts } from '../../data/staffAccounts.js'
import { roleLabel } from '../../data/session.js'

const orderCount = createResource(() => countRows('Orders'))

// Reserved status colours; each always ships with an icon and a label so colour never carries meaning alone.
const stockStatus = {
  ok: { label: 'In stock', icon: '✓', color: '#0ca30c', ink: '#fff' },
  low: { label: 'Low stock', icon: '!', color: '#fab219', ink: '#252720' },
  out: { label: 'Out of stock', icon: '✕', color: '#d03b3b', ink: '#fff' },
}
const statusOf = quantity => quantity === 0 ? stockStatus.out : quantity < lowStockLimit ? stockStatus.low : stockStatus.ok

const number = new Intl.NumberFormat('en-AU')
const count = (value, noun) => `${number.format(value)} ${noun}${value === 1 ? '' : 's'}`
const sum = (items, value) => items.reduce((total, item) => total + value(item), 0)
const priceBands = [[0, 10], [10, 20], [20, 30], [30, 40], [40, 50], [50, Infinity]]
const bandLabel = ([low, high]) => high === Infinity ? `${formatPrice(low)} and over` : `${formatPrice(low)} – ${formatPrice(high - 0.01)}`

function Stat({ label, value, detail }) {
  return (
    <article className="stat">
      <span className="stat__label">{label}</span>
      <strong>{value}</strong>
      {detail && <small>{detail}</small>}
    </article>
  )
}

function AccountsCard({ state }) {
  const roles = state.data && [
    { key: 'customer', label: 'Customers', value: state.data.customers.length, color: seriesColors[0] },
    { key: 'employee', label: 'Employees', value: state.data.staff.filter(user => user.role === 'employee').length, color: seriesColors[1] },
    { key: 'admin', label: 'Admins', value: state.data.staff.filter(user => user.role === 'admin').length, color: seriesColors[2] },
  ]
  return (
    <ChartCard title="Accounts by role" subtitle="Customers (Patrons) and staff (User) accounts"
      table={roles && { columns: ['Role', 'Accounts'], rows: roles.map(role => [role.label, number.format(role.value)]) }}>
      <ResourceStatus state={state} resource={accounts} label="accounts">
        {roles && <StackedBar segments={roles} format={value => number.format(value)} />}
      </ResourceStatus>
    </ChartCard>
  )
}

function Dashboard({ products, accountsState, orders }) {
  const discounts = useDiscounts()
  const stockLines = products.flatMap(product => product.stock.map(item => ({ ...item, sellingPrice: salePrice({ price: item.price, discount: discounts[product.id] ?? 0 }) })))
  const unitsInStock = sum(products, product => product.quantity)
  const inventoryValue = sum(stockLines, item => item.quantity * item.sellingPrice)
  const lowStock = products.filter(product => product.quantity > 0 && product.quantity < lowStockLimit).length
  const outOfStock = products.filter(product => product.quantity === 0).length
  const genreCounts = Object.entries(Object.groupBy(products, product => product.genre)).map(([genre, items]) => `${number.format(items.length)} ${genre.toLowerCase()}`)

  const updatedYears = products.map(product => new Date(product.updatedAt).getFullYear()).filter(Number.isFinite)
  const firstYear = Math.min(...updatedYears)
  const lastYear = Math.max(...updatedYears)
  const updates = Array.from({ length: lastYear - firstYear + 1 }, (_, index) => {
    const year = firstYear + index
    return { label: String(year), short: String(year), value: updatedYears.filter(value => value === year).length }
  })

  const formats = Object.entries(Object.groupBy(stockLines, item => item.source))
    .map(([source, items]) => ({ id: source, label: source, lines: items.length, units: sum(items, item => item.quantity) }))
    .sort((a, b) => b.units - a.units)
  const lowest = [...products].sort((a, b) => a.quantity - b.quantity || a.title.localeCompare(b.title)).slice(0, 10)
  const bands = priceBands.map(band => ({ id: bandLabel(band), label: bandLabel(band), lines: stockLines.filter(item => item.sellingPrice >= band[0] && item.sellingPrice < band[1]).length }))

  const staff = accountsState.data?.staff ?? []
  const customers = accountsState.data?.customers ?? []

  return (
    <>
      <div className="stats">
        <Stat label="Products" value={number.format(products.length)} detail={genreCounts.join(' · ')} />
        <Stat label="Units in stock" value={number.format(unitsInStock)} detail={`${count(lowStock, 'product')} low · ${number.format(outOfStock)} out of stock`} />
        <Stat label="Inventory value" value={formatPrice(inventoryValue)} detail="Units in stock × selling price" />
        <Stat label="Average selling price" value={formatPrice(stockLines.length ? sum(stockLines, item => item.sellingPrice) / stockLines.length : 0)} detail={`Across ${count(stockLines.length, 'product format')}`} />
        <Stat label="Orders" value={orders.status === 'ready' ? number.format(orders.data) : '—'} detail={orders.status === 'error' ? orders.error : 'Placed through the shop'} />
        <Stat label="Accounts" value={accountsState.status === 'ready' ? number.format(staff.length + customers.length) : '—'} detail={accountsState.status === 'ready' ? `${count(customers.length, 'customer')} · ${number.format(staff.length)} staff` : 'Loading…'} />
      </div>

      <div className="chart-grid">
        <ChartCard wide title="Catalogue updates by year" subtitle={updatedYears.length ? `Products grouped by the year their record was last updated, ${firstYear} to ${lastYear}` : 'No dated product records yet.'}
          table={{ columns: ['Year', 'Products updated'], rows: updates.map(point => [point.label, number.format(point.value)]) }}>
          <LineChart data={updates} name="Products updated" format={value => count(value, 'product')} formatTick={value => number.format(value)} />
        </ChartCard>

        <ChartCard title="Stock by format" subtitle="Units in stock across all products, largest first"
          table={{ columns: ['Format', 'Products', 'Units in stock'], rows: formats.map(item => [item.label, number.format(item.lines), number.format(item.units)]) }}>
          <BarList format={value => number.format(value)} series={[{ key: 'units', name: 'Units in stock', color: seriesColors[0] }]}
            items={formats.map(item => ({ id: item.id, label: item.label, values: { units: item.units } }))} />
        </ChartCard>

        <ChartCard title="Lowest stock" subtitle={`The 10 products with the fewest units. Under ${lowStockLimit} units counts as low stock.`}
          table={{ columns: ['Product', 'Units in stock', 'Status'], rows: lowest.map(product => [product.title, number.format(product.quantity), statusOf(product.quantity).label]) }}>
          <BarList format={value => number.format(value)} series={[{ key: 'quantity', name: 'Units in stock' }]}
            items={lowest.map(product => ({ id: product.id, label: product.title, values: { quantity: product.quantity }, status: statusOf(product.quantity) }))} />
        </ChartCard>

        <ChartCard title="Selling price bands" subtitle="Product formats by current selling price, after discounts"
          table={{ columns: ['Selling price', 'Product formats'], rows: bands.map(band => [band.label, number.format(band.lines)]) }}>
          <BarList format={value => number.format(value)} series={[{ key: 'lines', name: 'Product formats', color: seriesColors[0] }]}
            items={bands.map(band => ({ id: band.id, label: band.label, values: { lines: band.lines } }))} />
        </ChartCard>

        <AccountsCard state={accountsState} />
      </div>
    </>
  )
}

export default function DashboardPage() {
  const user = useOutletContext()
  const catalogueState = useResource(catalogue)
  const accountsState = useResource(accounts)
  const orders = useResource(orderCount)

  return (
    <>
      <p className="eyebrow">{roleLabel(user.role)} dashboard</p>
      <h1>Welcome, {user.name}!</h1>
      <p className="lead">Live figures from the store database. Discounts are the ones saved in this browser. Prices are in AUD.</p>
      <ResourceStatus state={catalogueState} resource={catalogue} label="the catalogue">
        {catalogueState.data && <Dashboard products={catalogueState.data.products} accountsState={accountsState} orders={orders} />}
      </ResourceStatus>
    </>
  )
}
