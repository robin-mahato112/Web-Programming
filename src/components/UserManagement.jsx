import { useState } from 'react'
import Button from './Button.jsx'
import Input from './Input.jsx'
import { roleLabel, updateUser, userRoles } from '../data/userStore.js'

function UserEditor({ account, actor, onCancel, onSave }) {
  const [values, setValues] = useState({ name: account.name, role: account.role, adminCode: '' })
  const [errors, setErrors] = useState({})
  const [error, setError] = useState('')
  const update = event => setValues({ ...values, [event.target.name]: event.target.value })
  const submit = event => {
    event.preventDefault()
    const result = updateUser(account.userId, values, actor)
    setErrors(result.errors || {})
    setError(result.error || '')
    if (!result.error && !result.errors) onSave(result.persisted)
  }
  const prefix = `user-${account.userId}`
  return <form className="product-editor" onSubmit={submit} noValidate aria-label={`Edit ${account.name}`}>
    <h3>Edit user</h3>
    <p>{account.email}</p>
    <div className="form-grid">
      <Input id={`${prefix}-name`} name="name" label="Full name" value={values.name} onChange={update} error={errors.name} maxLength={100} />
      <div className="field">
        <label htmlFor={`${prefix}-role`}>User role</label>
        <select id={`${prefix}-role`} name="role" value={values.role} onChange={update} aria-invalid={Boolean(errors.role)} aria-describedby={errors.role ? `${prefix}-role-error` : undefined}>
          {userRoles.map(role => <option key={role} value={role}>{roleLabel(role)}</option>)}
        </select>
        {errors.role && <span id={`${prefix}-role-error`} className="field__error" role="alert">{errors.role}</span>}
      </div>
      {values.role === 'admin' && !account.adminCode && <Input id={`${prefix}-code`} name="adminCode" label="New admin code" type="password" autoComplete="new-password" value={values.adminCode} onChange={update} error={errors.adminCode} hint="Give this code to the user for admin sign in. Their password stays the same." />}
    </div>
    {error && <p className="notice notice--error" role="alert">{error}</p>}
    <div className="actions"><Button type="submit">Save changes</Button><Button type="button" variant="secondary" onClick={onCancel}>Cancel</Button></div>
  </form>
}

export default function UserManagement({ users, actor }) {
  const [editingId, setEditingId] = useState(null)
  const [message, setMessage] = useState('')
  const editing = users.find(user => user.userId === editingId)
  return <div className="user-management">
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
    <div id="user-editor">
      {editing && <UserEditor key={editing.userId} account={editing} actor={actor} onCancel={() => setEditingId(null)} onSave={persisted => {
        setEditingId(null)
        setMessage(persisted ? 'User updated and saved in this browser.' : 'User updated for this session. Browser storage is unavailable; changes will not survive a reload.')
      }} />}
    </div>
  </div>
}
