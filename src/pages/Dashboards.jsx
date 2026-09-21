import { useState } from 'react'
import { Navigate } from 'react-router-dom'
import Button from '../components/Button.jsx'
import Input from '../components/Input.jsx'
import { formatPrice, salePrice, updateProduct, useProducts, validateProduct } from '../data/productStore.js'
import { useUsers } from '../data/userStore.js'
import UserManagement from '../components/UserManagement.jsx'
import { useStaffSession } from '../data/staffSession.js'

const Stat = ({ value, label }) => <article className="stat"><strong>{value}</strong><span>{label}</span></article>
const dateFormat = new Intl.DateTimeFormat('en-AU', { dateStyle: 'medium', timeStyle: 'short' })

function ProductEditor({ product, user, onCancel, onSave }) {
  const [values, setValues] = useState({ price: String(product.price), quantity: String(product.quantity), discount: String(product.discount) })
  const [errors, setErrors] = useState({})
  const [error, setError] = useState('')
  const update = event => setValues({ ...values, [event.target.name]: event.target.value })
  const valid = Object.keys(validateProduct(values)).length === 0
  const submit = event => {
    event.preventDefault()
    const result = updateProduct(product.id, values, user)
    setErrors(result.errors || {})
    setError(result.error || '')
    if (!result.errors && !result.error) onSave(result.persisted)
  }

  return (
    <form className="product-editor" onSubmit={submit} noValidate aria-label={`Edit ${product.title}`}>
      <h3>Edit {product.title}</h3>
      <div className="product-editor__fields">
        <Input id={`${product.id}-price`} name="price" label="Price (AUD)" type="number" min="0" max="1000000" step="0.01" value={values.price} onChange={update} error={errors.price} />
        <Input id={`${product.id}-quantity`} name="quantity" label="Quantity in stock" type="number" min="0" step="1" value={values.quantity} onChange={update} error={errors.quantity} />
        <Input id={`${product.id}-discount`} name="discount" label="Discount (%)" type="number" min="0" max="100" step="0.01" value={values.discount} onChange={update} error={errors.discount} />
      </div>
      <p aria-live="polite">{valid ? `Selling price: ${formatPrice(salePrice(values))} · ${Number(values.quantity) > 0 ? 'Available' : 'Out of stock'}` : 'Enter valid values to preview the selling price.'}</p>
      {error && <p className="notice notice--error" role="alert">{error}</p>}
      <div className="actions">
        <Button type="submit">Save changes</Button>
        <Button type="button" variant="secondary" onClick={onCancel}>Cancel</Button>
      </div>
    </form>
  )
}

function ProductRow({ product, user }) {
  const [editing, setEditing] = useState(false)
  const [message, setMessage] = useState('')
  const canEdit = user.role === 'admin'
  const change = product.previousPrice === null ? null : Math.round((product.price - product.previousPrice) * 100) / 100
  const save = persisted => {
    setEditing(false)
    setMessage(persisted ? `${product.title} updated and saved in this browser.` : `${product.title} updated for this session. Browser storage was unavailable, so changes will not survive a reload.`)
  }

  return (
    <>
      <tr>
        <th scope="row" className="product-table__info">
          <strong>{product.title}</strong>
          <small>{product.category} · {product.rating} / 5</small>
          <p>{product.description}</p>
        </th>
        <td>
          <strong>{formatPrice(product.price)}</strong>
          <small className="price-change">{change === null ? 'No price changes yet' : `Previously ${formatPrice(product.previousPrice)} (${change > 0 ? '+' : ''}${formatPrice(change)})`}</small>
        </td>
        <td>{product.discount}%</td>
        <td><strong>{formatPrice(salePrice(product))}</strong></td>
        <td>{product.quantity}</td>
        <td><span className={product.quantity > 0 ? 'pill' : 'pill pill--muted'}>{product.quantity > 0 ? 'Available' : 'Out of stock'}</span></td>
        <td><time dateTime={product.updatedAt}>{dateFormat.format(new Date(product.updatedAt))}</time><small className="price-change">{product.updatedBy}</small></td>
        {canEdit && <td><Button type="button" variant="secondary" aria-label={`Edit ${product.title}`} aria-expanded={editing} aria-controls={`editor-${product.id}`} onClick={() => { setEditing(!editing); setMessage('') }}>{editing ? 'Close' : 'Edit'}</Button></td>}
      </tr>
      {canEdit && <tr hidden={!editing && !message}>
        <td colSpan={8} id={`editor-${product.id}`}>
          {editing && <ProductEditor product={product} user={user} onCancel={() => setEditing(false)} onSave={save} />}
          {message && <p className="notice" role="status">{message}</p>}
        </td>
      </tr>}
    </>
  )
}

function StaffDashboard({ requiredRole }) {
  const user = useStaffSession()
  const products = useProducts()
  const users = useUsers()
  if (!user) return <Navigate to={requiredRole === 'admin' ? '/admin/login' : '/login'} replace />
  if (user.role !== requiredRole) return <Navigate to={user.role === 'admin' ? '/admin' : '/employee'} replace />

  const role = user.role === 'admin' ? 'Admin' : 'Employee'

  return (
    <section className="section shell dashboard-page">
      <p className="eyebrow">{role} dashboard</p>
      <h1>Welcome, {user.name}!</h1>
      <p className="lead">Signed in as <span className="pill">{role}</span></p>
      <p>Overview based on sample products and accounts. Prices are in AUD.</p>
      <div className="stats">
        <Stat value={products.length} label="Total products" />
        <Stat value={products.reduce((total, product) => total + product.quantity, 0)} label="Total units in stock" />
        <Stat value={products.filter(product => product.quantity > 0).length} label="Available products" />
        <Stat value={products.filter(product => product.discount > 0).length} label="Discounted products" />
        <Stat value={users.filter(account => account.role === 'customer').length} label="Customer accounts" />
        <Stat value={users.filter(account => account.role === 'employee').length} label="Employee accounts" />
      </div>
      {user.role === 'admin' && <UserManagement users={users} actor={user} />}
      <h2>Product inventory</h2>
      <p>{user.role === 'admin' ? 'Edit prices, stock quantities, and discounts. Saved changes also appear on Home.' : 'View current prices, stock quantities, and discounts. Contact an admin to make changes.'}</p>
      <div className="table-wrap" role="region" aria-label="Product inventory" tabIndex={0}>
        <table className="product-table">
          <caption>All products, pricing, availability, and latest updates</caption>
          <thead><tr>
            <th scope="col">Product information</th>
            <th scope="col">Price / last change</th>
            <th scope="col">Discount</th>
            <th scope="col">Selling price</th>
            <th scope="col">Quantity</th>
            <th scope="col">Availability</th>
            <th scope="col">Last updated / by</th>
            {user.role === 'admin' && <th scope="col">Actions</th>}
          </tr></thead>
          <tbody>{products.map(product => <ProductRow key={product.id} product={product} user={user} />)}</tbody>
        </table>
      </div>
    </section>
  )
}

export function AdminDashboard() {
  return <StaffDashboard requiredRole="admin" />
}

export function EmployeeDashboard() {
  return <StaffDashboard requiredRole="employee" />
}
