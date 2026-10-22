import { useEffect, useState } from 'react'
import Button from './Button.jsx'
import Input from './Input.jsx'
import { updateUser, userRoles } from '../data/userStore.js'

const roleLabel = role => role.charAt(0).toUpperCase() + role.slice(1)

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

function UserCreator({ actor, onCancel, onSave }) {
  const [values, setValues] = useState({ name: '', email: '', password: '', role: 'customer', adminCode: '' })
  const [errors, setErrors] = useState({})
  const [error, setError] = useState('')
  const update = event => setValues({ ...values, [event.target.name]: event.target.value })
  const submit = event => {
    event.preventDefault()
    const result = addUser(values, actor)
    setErrors(result.errors || {})
    setError(result.error || '')
    if (!result.error && !result.errors) onSave(values.name.trim(), result.persisted)
  }
  return <form className="product-editor" onSubmit={submit} noValidate aria-label="Add user">
    <h3>Add user</h3>
    <div className="form-grid">
      <Input id="new-user-name" name="name" label="Full name" value={values.name} onChange={update} error={errors.name} maxLength={100} required />
      <Input id="new-user-email" name="email" label="Email" type="email" autoComplete="off" value={values.email} onChange={update} error={errors.email} required />
      <Input id="new-user-password" name="password" label="Password" type="password" autoComplete="new-password" value={values.password} onChange={update} error={errors.password} hint="Use 8+ characters with letters and numbers." required />
      <div className="field">
        <label htmlFor="new-user-role">User role</label>
        <select id="new-user-role" name="role" value={values.role} onChange={update} aria-invalid={Boolean(errors.role)} aria-describedby={errors.role ? 'new-user-role-error' : undefined}>
          {userRoles.map(role => <option key={role} value={role}>{roleLabel(role)}</option>)}
        </select>
        {errors.role && <span id="new-user-role-error" className="field__error" role="alert">{errors.role}</span>}
      </div>
      {values.role === 'admin' && <Input id="new-user-code" name="adminCode" label="Admin code" type="password" autoComplete="new-password" value={values.adminCode} onChange={update} error={errors.adminCode} hint="Give this code to the user for admin sign in." required />}
    </div>
    {error && <p className="notice notice--error" role="alert">{error}</p>}
    <div className="actions"><Button type="submit">Add user</Button><Button type="button" variant="secondary" onClick={onCancel}>Cancel</Button></div>
  </form>
}

export default function UserManagement({ users, actor }) {
  const [editingId, setEditingId] = useState(null)
  const [message, setMessage] = useState('')
  const editing = users.find(user => user.userId === editingId)
  return <section aria-labelledby="user-management-heading" className="user-management">
    <h2 id="user-management-heading">User management</h2>
    <p>View account names, emails, and roles. Edit a name or change access between customer, employee, and admin.</p>
    {message && <p className="notice" role="status">{message}</p>}
    <div className="table-wrap" role="region" aria-label="User accounts" tabIndex={0}>
      <table className="user-table">
        <caption>{users.length} user accounts</caption>
        <thead><tr><th scope="col">Name</th><th scope="col">Email</th><th scope="col">Role</th><th scope="col">Actions</th></tr></thead>
        <tbody>{users.map(account => <tr key={account.userId}>
          <th scope="row">{account.name}{actor.userId === account.userId && <small> (you)</small>}</th>
          <td>{account.email}</td><td><span className="pill">{roleLabel(account.role)}</span></td>
          <td><Button type="button" variant="secondary" aria-label={`Edit user ${account.name}`} aria-expanded={editingId === account.userId} aria-controls="user-editor" onClick={() => { setEditingId(account.userId); setMessage('') }}>Edit user</Button></td>
        </tr>)}</tbody>
      </table>
    </div>
  </div>
}
