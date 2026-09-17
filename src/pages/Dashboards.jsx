import { Link } from 'react-router-dom'
import { mockProducts } from '../data/mockProducts.js'
import { existingCustomers } from '../data/mockCustomers.js'
import { existingEmployees } from '../data/mockEmployees.js'
import { useStaffSession } from '../data/staffSession.js'

const Stat = ({ value, label }) => <article className="stat"><strong>{value}</strong><span>{label}</span></article>
const dateFormat = new Intl.DateTimeFormat('en-AU', { dateStyle: 'medium', timeZone: 'UTC' })

/* Table of products with last updated date and updated by user. */
function ProductTable({ products, caption }) {
  return (
    <div className="table-wrap">
      <table>
        <caption>{caption}</caption>
        <thead>
          <tr>
            <th scope="col">Product name</th>
            <th scope="col">Last updated date</th>
            <th scope="col">Updated by</th>
          </tr>
        </thead>
        <tbody>
          {products.length ? products.map(product => (
            <tr key={product.id}>
              <td><Link to={`/products/${product.id}`}>{product.title}</Link></td>
              <td>
                {product.updatedAt ? (
                  <time dateTime={product.updatedAt}>
                    {dateFormat.format(new Date(product.updatedAt))}
                  </time>
                ) : 'Not recorded'}
              </td>
              <td>{product.updatedBy || 'Not recorded'}</td>
            </tr>
          )) : (
            <tr><td colSpan={3}>No updated products yet.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  )
}

/* Staff dashboard for both admin and employee roles. */
function StaffDashboard() {
  const user = useStaffSession()
  if (!user) return null

  const role = user.role === 'admin' ? 'Admin' : 'Employee'
  const recentProducts = mockProducts.filter(product => product.updatedAt)
    .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt)).slice(0, 5)

  return (
    <section className="section shell dashboard-page">
      <p className="eyebrow">{role} dashboard</p>
      <h1>Welcome, {user.name}!</h1>
      <p className="lead">Signed in as <span className="pill">{role}</span></p>
      <p>Overview based on sample products and accounts.</p>
      <div className="stats">
        <Stat value={mockProducts.length} label="Total products" />
        <Stat value={existingCustomers.length} label="Customer accounts" />
        <Stat value={existingEmployees.length} label="Employee accounts" />
      </div>
      <ProductTable products={recentProducts} caption="Recently updated products" />
    </section>
  )
}

export function AdminDashboard() {
  return <StaffDashboard />
}

export function EmployeeDashboard() {
  return <StaffDashboard />
}
