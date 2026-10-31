import { useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import Button from '../../components/Button.jsx'
import Input from '../../components/Input.jsx'
import ResourceStatus from '../../components/ResourceStatus.jsx'
import { useResource } from '../../data/backend.js'
import { catalogue, createProduct, deleteProduct, lowStockLimit, saveProduct } from '../../data/catalogue.js'
import { formatPrice } from '../../data/productStore.js'
import { roleLabel } from '../../data/session.js'

const pageSize = 20
const dateFormat = new Intl.DateTimeFormat('en-AU', { dateStyle: 'medium' })
const yearOf = value => value ? new Date(value).getFullYear() : ''
const availability = quantity => quantity === 0 ? 'Out of stock' : quantity < lowStockLimit ? 'Low stock' : 'Available'

function priceRange(stock) {
  const prices = stock.map(item => item.price)
  if (!prices.length) return '—'
  const low = Math.min(...prices)
  const high = Math.max(...prices)
  return low === high ? formatPrice(low) : `${formatPrice(low)} – ${formatPrice(high)}`
}

function ProductEditor({ product, user, onCancel, onSave }) {
  const [values, setValues] = useState({
    title: product.title,
    author: product.author ?? '',
    stock: Object.fromEntries(product.stock.map(item => [item.itemId, { price: String(item.price), quantity: String(item.quantity) }])),
  })
  const [errors, setErrors] = useState({})
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)
  const update = event => setValues({ ...values, [event.target.name]: event.target.value })
  const updateStock = (itemId, name) => event => setValues({ ...values, stock: { ...values.stock, [itemId]: { ...values.stock[itemId], [name]: event.target.value } } })
  const submit = async event => {
    event.preventDefault()
    setPending(true)
    const result = await saveProduct(product, values, user)
    setPending(false)
    setErrors(result.errors || {})
    setError(result.error || '')
    if (!result.errors && !result.error) onSave(result)
  }

  return (
    <form className="product-editor" onSubmit={submit} noValidate aria-label={`Edit ${product.title}`} aria-busy={pending}>
      <h3>Edit {product.title}</h3>
      <div className="product-editor__fields">
        <Input id={`product-${product.id}-title`} name="title" label="Title" value={values.title} onChange={update} error={errors.title} maxLength={255} />
        <Input id={`product-${product.id}-author`} name="author" label="Author, director, or studio" value={values.author} onChange={update} error={errors.author} maxLength={255} />
      </div>
      {product.stock.map(item => {
        const row = values.stock[item.itemId]
        return (
          <fieldset key={item.itemId} className="stock-fieldset">
            <legend>{item.source}</legend>
            <div className="product-editor__fields">
              <Input id={`stock-${item.itemId}-price`} label="Price (AUD)" type="number" min="0" max="1000000" step="0.01" value={row.price} onChange={updateStock(item.itemId, 'price')} error={errors[`${item.itemId}-price`]} />
              <Input id={`stock-${item.itemId}-quantity`} label="Quantity in stock" type="number" min="0" step="1" value={row.quantity} onChange={updateStock(item.itemId, 'quantity')} error={errors[`${item.itemId}-quantity`]} />
            </div>
          </fieldset>
        )
      })}
      {error && <p className="notice notice--error" role="alert">{error}</p>}
      <div className="actions">
        <Button type="submit" disabled={pending}>{pending ? 'Saving…' : 'Save changes'}</Button>
        <Button type="button" variant="secondary" onClick={onCancel}>Cancel</Button>
      </div>
    </form>
  )
}

const emptyProduct = { title: '', author: '', description: '', genreId: '', subGenreId: '', published: '', stock: {} }

function AddProductForm({ data, user, onCancel, onAdded }) {
  const [values, setValues] = useState(emptyProduct)
  const [errors, setErrors] = useState({})
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)
  const genreId = Number(values.genreId)
  const subGenres = data.subGenres[genreId] ?? []
  const formats = data.sources.filter(source => source.genreId === genreId)
  const update = event => setValues({ ...values, [event.target.name]: event.target.value })
  // A different genre has different sub-genres and formats, so clear those choices.
  const changeGenre = event => setValues({ ...values, genreId: event.target.value, subGenreId: '', stock: {} })
  const toggleFormat = sourceId => event => {
    const { [sourceId]: _removed, ...rest } = values.stock
    setValues({ ...values, stock: event.target.checked ? { ...rest, [sourceId]: { price: '', quantity: '0' } } : rest })
  }
  const updateStock = (sourceId, name) => event => setValues({ ...values, stock: { ...values.stock, [sourceId]: { ...values.stock[sourceId], [name]: event.target.value } } })
  const submit = async event => {
    event.preventDefault()
    setPending(true)
    const result = await createProduct(values, user)
    setPending(false)
    setErrors(result.errors || {})
    setError(result.error || '')
    if (result.product) onAdded(result.product)
  }

  return (
    <form className="product-editor add-panel" onSubmit={submit} noValidate aria-labelledby="add-product-heading" aria-busy={pending}>
      <h2 id="add-product-heading">Add product</h2>
      <div className="form-grid">
        <Input id="new-product-title" name="title" label="Title" value={values.title} onChange={update} error={errors.title} maxLength={255} />
        <Input id="new-product-author" name="author" label="Author, director, or studio" value={values.author} onChange={update} error={errors.author} maxLength={255} />
        <div className="field">
          <label htmlFor="new-product-genre">Genre</label>
          <select id="new-product-genre" name="genreId" value={values.genreId} onChange={changeGenre} aria-invalid={Boolean(errors.genreId)} aria-describedby={errors.genreId ? 'new-product-genre-help' : undefined}>
            <option value="">Choose a genre</option>
            {data.genres.map(genre => <option key={genre.id} value={genre.id}>{genre.name}</option>)}
          </select>
          {errors.genreId && <small id="new-product-genre-help" className="field__error">{errors.genreId}</small>}
        </div>
        <div className="field">
          <label htmlFor="new-product-subgenre">Sub-genre</label>
          <select id="new-product-subgenre" name="subGenreId" value={values.subGenreId} onChange={update} disabled={!subGenres.length} aria-invalid={Boolean(errors.subGenreId)} aria-describedby={errors.subGenreId ? 'new-product-subgenre-help' : undefined}>
            <option value="">{values.genreId ? 'Choose a sub-genre' : 'Choose a genre first'}</option>
            {subGenres.map(subGenre => <option key={subGenre.id} value={subGenre.id}>{subGenre.name}</option>)}
          </select>
          {errors.subGenreId && <small id="new-product-subgenre-help" className="field__error">{errors.subGenreId}</small>}
        </div>
        <Input id="new-product-published" name="published" label="Published or released (optional)" type="date" value={values.published} onChange={update} error={errors.published} />
      </div>
      <div className="field">
        <label htmlFor="new-product-description">Description (optional)</label>
        <textarea id="new-product-description" name="description" rows={3} value={values.description} onChange={update} />
      </div>

      <fieldset className="stock-fieldset" aria-describedby={errors.formats ? 'new-product-formats-help' : undefined}>
        <legend>Formats</legend>
        {!formats.length && <p>Choose a genre to see its formats.</p>}
        {errors.formats && <p id="new-product-formats-help" className="field__error" role="alert">{errors.formats}</p>}
        {formats.map(source => {
          const item = values.stock[source.id]
          return (
            <div key={source.id} className="format-option">
              <label className="format-option__toggle">
                <input type="checkbox" checked={Boolean(item)} onChange={toggleFormat(source.id)} />
                {source.name}
              </label>
              {item && <div className="product-editor__fields">
                <Input id={`new-format-${source.id}-price`} label={`${source.name} price (AUD)`} type="number" min="0" max="1000000" step="0.01" value={item.price} onChange={updateStock(source.id, 'price')} error={errors[`${source.id}-price`]} />
                <Input id={`new-format-${source.id}-quantity`} label={`${source.name} quantity`} type="number" min="0" step="1" value={item.quantity} onChange={updateStock(source.id, 'quantity')} error={errors[`${source.id}-quantity`]} />
              </div>}
            </div>
          )
        })}
      </fieldset>

      {error && <p className="notice notice--error" role="alert">{error}</p>}
      <div className="actions">
        <Button type="submit" disabled={pending}>{pending ? 'Adding…' : 'Add product'}</Button>
        <Button type="button" variant="secondary" onClick={onCancel}>Cancel</Button>
      </div>
    </form>
  )
}

function DeleteProduct({ product, user, onCancel, onDeleted }) {
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)
  const remove = async () => {
    setPending(true)
    const result = await deleteProduct(product, user)
    setPending(false)
    if (result.error) setError(result.error)
    else onDeleted(product)
  }
  return (
    <div className="confirm-panel" role="group" aria-labelledby={`delete-${product.id}-heading`}>
      <h3 id={`delete-${product.id}-heading`}>Delete {product.title}?</h3>
      <p>This permanently removes the product and its {product.stock.length === 1 ? 'format' : `${product.stock.length} formats`} from the database, including from any orders. It cannot be undone.</p>
      {error && <p className="notice notice--error" role="alert">{error}</p>}
      <div className="actions">
        <Button type="button" variant="danger" onClick={remove} disabled={pending}>{pending ? 'Deleting…' : 'Delete product'}</Button>
        <Button type="button" variant="secondary" onClick={onCancel}>Cancel</Button>
      </div>
    </div>
  )
}

function ProductRow({ product, user, onDeleted }) {
  const [mode, setMode] = useState(null) // null, 'edit' or 'delete'
  const [message, setMessage] = useState('')
  const canEdit = user.role === 'admin'
  const open = next => {
    setMode(mode === next ? null : next)
    setMessage('')
  }
  const save = ({ saved }) => {
    setMode(null)
    setMessage(saved ? 'Changes saved to the database.' : 'Nothing was changed.')
  }

  return (
    <>
      <tr>
        <th scope="row" className="product-table__info">
          <strong>{product.title}</strong>
          <small>{product.author}</small>
          <small>{product.genre}{product.subGenre && ` · ${product.subGenre}`}{product.published && ` · ${yearOf(product.published)}`}</small>
        </th>
        <td>
          <ul className="stock-list">
            {product.stock.map(item => <li key={item.itemId}><span>{item.source}</span> {formatPrice(item.price)} · {item.quantity}</li>)}
          </ul>
        </td>
        <td><strong>{priceRange(product.stock)}</strong></td>
        <td>{product.quantity}</td>
        <td><span className={product.quantity >= lowStockLimit ? 'pill' : 'pill pill--muted'}>{availability(product.quantity)}</span></td>
        <td>{product.updatedAt && <time dateTime={product.updatedAt}>{dateFormat.format(new Date(product.updatedAt))}</time>}<small className="price-change">{product.updatedBy}</small></td>
        {canEdit && <td>
          <div className="row-actions">
            <Button type="button" variant="secondary" aria-label={`Edit ${product.title}`} aria-expanded={mode === 'edit'} aria-controls={`editor-${product.id}`} onClick={() => open('edit')}>{mode === 'edit' ? 'Close' : 'Edit'}</Button>
            <Button type="button" variant="secondary" aria-label={`Delete ${product.title}`} aria-expanded={mode === 'delete'} aria-controls={`editor-${product.id}`} onClick={() => open('delete')}>Delete</Button>
          </div>
        </td>}
      </tr>
      {canEdit && <tr hidden={!mode && !message}>
        <td colSpan={7} id={`editor-${product.id}`}>
          {mode === 'edit' && <ProductEditor product={product} user={user} onCancel={() => setMode(null)} onSave={save} />}
          {mode === 'delete' && <DeleteProduct product={product} user={user} onCancel={() => setMode(null)} onDeleted={onDeleted} />}
          {message && <p className="notice" role="status">{message}</p>}
        </td>
      </tr>}
    </>
  )
}

function ProductTable({ data, user }) {
  const { products, genres } = data
  const [query, setQuery] = useState('')
  const [genre, setGenre] = useState('')
  const [stockFilter, setStockFilter] = useState('')
  const [page, setPage] = useState(1)
  const [adding, setAdding] = useState(false)
  const [notice, setNotice] = useState('')
  const isAdmin = user.role === 'admin'

  const search = query.trim().toLowerCase()
  const matches = products.filter(product =>
    (!search || product.title.toLowerCase().includes(search) || product.author?.toLowerCase().includes(search)) &&
    (!genre || product.genre === genre) &&
    (!stockFilter || (stockFilter === 'low' ? product.quantity < lowStockLimit : product.quantity === 0)))
  const pages = Math.max(1, Math.ceil(matches.length / pageSize))
  const current = Math.min(page, pages)
  const visible = matches.slice((current - 1) * pageSize, current * pageSize)
  const filter = setter => event => {
    setter(event.target.value)
    setPage(1)
  }
  const added = product => {
    setAdding(false)
    // Show the new product straight away by searching for it.
    setQuery(product.title)
    setGenre('')
    setStockFilter('')
    setPage(1)
    setNotice(`${product.title} was added to the database.`)
  }

  return (
    <>
      {isAdmin && <div className="page-actions">
        <Button type="button" aria-expanded={adding} aria-controls="add-product" onClick={() => { setAdding(!adding); setNotice('') }}>{adding ? 'Close' : 'Add product'}</Button>
      </div>}
      <div id="add-product">
        {adding && <AddProductForm data={data} user={user} onCancel={() => setAdding(false)} onAdded={added} />}
      </div>
      {notice && <p className="notice" role="status">{notice}</p>}
      <div className="table-filters" role="search">
        <Input id="product-search" label="Search title or author" type="search" value={query} onChange={filter(setQuery)} />
        <div className="field">
          <label htmlFor="product-genre">Genre</label>
          <select id="product-genre" value={genre} onChange={filter(setGenre)}>
            <option value="">All genres</option>
            {genres.map(option => <option key={option.id} value={option.name}>{option.name}</option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor="product-stock">Stock</label>
          <select id="product-stock" value={stockFilter} onChange={filter(setStockFilter)}>
            <option value="">All stock levels</option>
            <option value="low">Low or out of stock (under {lowStockLimit})</option>
            <option value="out">Out of stock</option>
          </select>
        </div>
      </div>
      <div className="table-wrap" role="region" aria-label="Product inventory" tabIndex={0}>
        <table className="product-table">
          <caption aria-live="polite">{matches.length === products.length ? `All ${products.length} products` : `${matches.length} of ${products.length} products`}{matches.length > pageSize && `, page ${current} of ${pages}`}</caption>
          <thead><tr>
            <th scope="col">Product information</th>
            <th scope="col">Formats · price · stock</th>
            <th scope="col">Price</th>
            <th scope="col">Quantity</th>
            <th scope="col">Availability</th>
            <th scope="col">Last updated / by</th>
            {isAdmin && <th scope="col">Actions</th>}
          </tr></thead>
          <tbody>
            {visible.map(product => <ProductRow key={product.id} product={product} user={user} onDeleted={deleted => setNotice(`${deleted.title} was deleted from the database.`)} />)}
            {!visible.length && <tr><td colSpan={7}>No products match these filters.</td></tr>}
          </tbody>
        </table>
      </div>
      {pages > 1 && <nav className="pagination" aria-label="Product pages">
        <Button type="button" variant="secondary" disabled={current === 1} onClick={() => setPage(current - 1)}>Previous</Button>
        <span>Page {current} of {pages}</span>
        <Button type="button" variant="secondary" disabled={current === pages} onClick={() => setPage(current + 1)}>Next</Button>
      </nav>}
    </>
  )
}

export default function ProductManagementPage() {
  const user = useOutletContext()
  const state = useResource(catalogue)
  const isAdmin = user.role === 'admin'

  return (
    <>
      <p className="eyebrow">{roleLabel(user.role)} area</p>
      <h1>{isAdmin ? 'Product management' : 'Product inventory'}</h1>
      <p className="lead">{isAdmin ? 'Add, edit, and delete products. All changes are saved to the database.' : 'View current prices and stock quantities. Contact an admin to make changes.'} Prices are in AUD.</p>
      <ResourceStatus state={state} resource={catalogue} label="products">
        {state.data && <ProductTable data={state.data} user={user} />}
      </ResourceStatus>
    </>
  )
}
