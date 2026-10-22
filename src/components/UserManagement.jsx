import { useEffect, useState } from 'react'
import Button from './Button.jsx'
import Input from './Input.jsx'
import { errorMessage } from '../data/backend.js'
import { countProductsUpdatedBy, createStaffUser, deleteBlocker, deleteStaffUser, staffRoles, updateStaffUser } from '../data/staffAccounts.js'
import { roleLabel } from '../data/userStore.js'

function RoleSelect({ id, value, onChange, error, disabled, hint }) {
  const helpId = `${id}-help`
  return (
    <div className="field">
      <label htmlFor={id}>User role</label>
      <select id={id} name="role" value={value} onChange={onChange} disabled={disabled} aria-invalid={Boolean(error)} aria-describedby={error || hint ? helpId : undefined}>
        {staffRoles.map(role => <option key={role} value={role}>{roleLabel(role)}</option>)}
      </select>
      {(error || hint) && <small id={helpId} className={error ? 'field__error' : 'field__hint'}>{error || hint}</small>}
    </div>
  )
}

function UserEditor({ account, actor, onCancel, onSave }) {
  const [values, setValues] = useState({ name: account.name, role: account.role })
  const [errors, setErrors] = useState({})
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)
  const update = event => setValues({ ...values, [event.target.name]: event.target.value })
  const submit = async event => {
    event.preventDefault()
    setPending(true)
    const result = await updateStaffUser(account, values, actor)
    setPending(false)
    setErrors(result.errors || {})
    setError(result.error || '')
    if (!result.error && !result.errors) onSave()
  }
  const prefix = `user-${account.userId}`
  const isSelf = account.userId === actor.userId
  return <form className="product-editor" onSubmit={submit} noValidate aria-label={`Edit ${account.name}`} aria-busy={pending}>
    <h3>Edit user</h3>
    <p>{account.username}{account.email && ` · ${account.email}`}</p>
    <div className="form-grid">
      <Input id={`${prefix}-name`} name="name" label="Full name" value={values.name} onChange={update} error={errors.name} maxLength={100} />
      <RoleSelect id={`${prefix}-role`} value={values.role} onChange={update} error={errors.role} disabled={isSelf} hint={isSelf ? 'You cannot change your own role.' : undefined} />
    </div>
    {error && <p className="notice notice--error" role="alert">{error}</p>}
    <div className="actions"><Button type="submit" disabled={pending}>{pending ? 'Saving…' : 'Save changes'}</Button><Button type="button" variant="secondary" onClick={onCancel}>Cancel</Button></div>
  </form>
}

const emptyUser = { name: '', username: '', email: '', role: 'employee', password: '', confirm: '' }

function AddUserForm({ actor, onCancel, onAdded }) {
  const [values, setValues] = useState(emptyUser)
  const [errors, setErrors] = useState({})
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)
  const update = event => setValues({ ...values, [event.target.name]: event.target.value })
  const submit = async event => {
    event.preventDefault()
    setPending(true)
    const result = await createStaffUser(values, actor)
    setPending(false)
    setErrors(result.errors || {})
    setError(result.error || '')
    if (result.user) onAdded(result.user)
  }
  return <form className="product-editor add-panel" onSubmit={submit} noValidate aria-labelledby="add-user-heading" aria-busy={pending}>
    <h3 id="add-user-heading">Add staff account</h3>
    <div className="form-grid">
      <Input id="new-user-name" name="name" label="Full name" autoComplete="off" value={values.name} onChange={update} error={errors.name} maxLength={100} />
      <Input id="new-user-username" name="username" label="Username" autoComplete="off" value={values.username} onChange={update} error={errors.username} maxLength={50} hint="Used to sign in." />
      <Input id="new-user-email" name="email" label="Email (optional)" type="email" autoComplete="off" value={values.email} onChange={update} error={errors.email} />
      <RoleSelect id="new-user-role" value={values.role} onChange={update} error={errors.role} />
      <Input id="new-user-password" name="password" label="Password" type="password" autoComplete="new-password" value={values.password} onChange={update} error={errors.password} hint="Use 8+ characters with letters and numbers." />
      <Input id="new-user-confirm" name="confirm" label="Confirm password" type="password" autoComplete="new-password" value={values.confirm} onChange={update} error={errors.confirm} />
    </div>
    {error && <p className="notice notice--error" role="alert">{error}</p>}
    <div className="actions"><Button type="submit" disabled={pending}>{pending ? 'Adding…' : 'Add account'}</Button><Button type="button" variant="secondary" onClick={onCancel}>Cancel</Button></div>
  </form>
}

function DeleteUser({ account, actor, onCancel, onDeleted }) {
  const [products, setProducts] = useState(null)
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)
  useEffect(() => {
    let current = true
    countProductsUpdatedBy(account.username)
      .then(count => current && setProducts(count))
      .catch(failure => current && setError(errorMessage(failure)))
    return () => { current = false }
  }, [account.username])
  const remove = async () => {
    setPending(true)
    const result = await deleteStaffUser(account, actor)
    setPending(false)
    if (result.error) setError(result.error)
    else onDeleted(account)
  }
  return <div className="confirm-panel" role="group" aria-labelledby="delete-user-heading">
    <h3 id="delete-user-heading">Delete {account.name} ({account.username})?</h3>
    <p>This permanently removes the staff account. It cannot be undone.</p>
    {products === null && !error && <p role="status">Checking which products this user last updated…</p>}
    {products > 0 && <p>{account.username} is listed as the last updater of {products === 1 ? '1 product' : `${products} products`}. The database requires an existing user there, so {products === 1 ? 'it' : 'they'} will be reassigned to you ({actor.username}).</p>}
    {error && <p className="notice notice--error" role="alert">{error}</p>}
    <div className="actions">
      <Button type="button" variant="danger" onClick={remove} disabled={pending || products === null}>{pending ? 'Deleting…' : 'Delete account'}</Button>
      <Button type="button" variant="secondary" onClick={onCancel}>Cancel</Button>
    </div>
  </div>
}

export default function UserManagement({ staff, customers, actor }) {
  const [panel, setPanel] = useState(null) // { mode: 'add' | 'edit' | 'delete', userId }
  const [message, setMessage] = useState('')
  const selected = staff.find(user => user.userId === panel?.userId)
  const open = (mode, userId) => {
    setPanel(panel?.mode === mode && panel?.userId === userId ? null : { mode, userId })
    setMessage('')
  }
  const close = text => {
    setPanel(null)
    if (text) setMessage(text)
  }
  return <div className="user-management">
    <div className="section-heading">
      <h2>Staff accounts</h2>
      <Button type="button" aria-expanded={panel?.mode === 'add'} aria-controls="user-editor" onClick={() => open('add')}>{panel?.mode === 'add' ? 'Close' : 'Add staff account'}</Button>
    </div>
    {message && <p className="notice" role="status">{message}</p>}
    <div id="user-editor">
      {panel?.mode === 'add' && <AddUserForm actor={actor} onCancel={() => close()} onAdded={user => close(`${user.name} (${user.username}) was added. They can sign in at Staff sign in${user.role === 'admin' ? ' with the admin code' : ''}.`)} />}
    </div>
    <div className="table-wrap" role="region" aria-label="Staff accounts" tabIndex={0}>
      <table className="user-table">
        <caption>{staff.length} staff accounts</caption>
        <thead><tr><th scope="col">Name</th><th scope="col">Username</th><th scope="col">Email</th><th scope="col">Role</th><th scope="col">Actions</th></tr></thead>
        <tbody>{staff.map(account => {
          const blocker = deleteBlocker(account, actor, staff)
          return <tr key={account.userId}>
            <th scope="row">{account.name}{actor.userId === account.userId && <small> (you)</small>}</th>
            <td>{account.username}</td>
            <td>{account.email || '—'}</td>
            <td><span className="pill">{roleLabel(account.role)}</span></td>
            <td><div className="row-actions">
              <Button type="button" variant="secondary" aria-label={`Edit user ${account.name}`} aria-expanded={panel?.mode === 'edit' && panel.userId === account.userId} aria-controls="user-panel" onClick={() => open('edit', account.userId)}>Edit</Button>
              <Button type="button" variant="secondary" aria-label={`Delete user ${account.name}`} aria-expanded={panel?.mode === 'delete' && panel.userId === account.userId} aria-controls="user-panel" disabled={Boolean(blocker)} title={blocker || undefined} onClick={() => open('delete', account.userId)}>Delete</Button>
            </div></td>
          </tr>
        })}</tbody>
      </table>
    </div>
    <div id="user-panel">
      {panel?.mode === 'edit' && selected && <UserEditor key={selected.userId} account={selected} actor={actor} onCancel={() => close()} onSave={() => close('User updated in the database. A role change applies the next time that user signs in.')} />}
      {panel?.mode === 'delete' && selected && <DeleteUser key={selected.userId} account={selected} actor={actor} onCancel={() => close()} onDeleted={account => close(`${account.name} (${account.username}) was deleted.`)} />}
    </div>

    <h2>Customer accounts</h2>
    <p>Customers register and sign in through the shop. Their accounts are read-only here.</p>
    <div className="table-wrap" role="region" aria-label="Customer accounts" tabIndex={0}>
      <table className="user-table">
        <caption>{customers.length} customer {customers.length === 1 ? 'account' : 'accounts'}</caption>
        <thead><tr><th scope="col">Name</th><th scope="col">Email</th><th scope="col">Customer ID</th></tr></thead>
        <tbody>{customers.map(account => <tr key={account.userId}>
          <th scope="row">{account.name}</th>
          <td>{account.email}</td>
          <td>{account.userId}</td>
        </tr>)}</tbody>
      </table>
    </div>
  </div>
}
