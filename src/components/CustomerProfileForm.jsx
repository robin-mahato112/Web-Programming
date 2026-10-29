import { useRef, useState } from 'react'
import Button from './Button.jsx'
import Input from './Input.jsx'
import PasswordInput from './PasswordInput.jsx'
import { focusFirstError } from '../data/accountNavigation.js'
import { saveCustomerProfile } from '../data/customerProfile.js'

export default function CustomerProfileForm({ user }) {
  const initial = { name: user.name, email: user.email, currentPassword: '' }
  const [values, setValues] = useState(initial)
  const [editing, setEditing] = useState(false)
  const [errors, setErrors] = useState({})
  const [message, setMessage] = useState('')
  const [failure, setFailure] = useState('')
  const [busy, setBusy] = useState(false)
  const pending = useRef(false)
  const update = (event) => {
    setValues((current) => ({ ...current, [event.target.name]: event.target.value }))
    setErrors({})
    setFailure('')
    setMessage('')
  }
  const submit = async (event) => {
    event.preventDefault()
    if (pending.current) return
    pending.current = true
    setBusy(true)
    const result = await saveCustomerProfile(values)
    setBusy(false)
    pending.current = false
    setErrors(result.errors || {})
    focusFirstError(result.errors || {})
    setFailure(result.error || '')
    setValues((current) => ({ ...current, currentPassword: '' }))
    if (result.saved) {
      setValues({ name: result.profile.name, email: result.profile.email, currentPassword: '' })
      setEditing(false)
      setMessage('Account details saved. Use your updated email the next time you sign in.')
    }
  }
  return (
    <div className="customer-profile-editor">
      <p>
        <span>Name</span>
        <strong>{user.name}</strong>
      </p>
      <p>
        <span>Email</span>
        <strong>{user.email}</strong>
      </p>
      {!editing ? (
        <Button
          type="button"
          variant="secondary"
          onClick={() => {
            setValues(initial)
            setErrors({})
            setFailure('')
            setMessage('')
            setEditing(true)
          }}
        >
          Edit account details
        </Button>
      ) : (
        <form noValidate onSubmit={submit} aria-busy={busy} aria-label="Edit account details">
          <fieldset className="account-fields" disabled={busy}>
            <Input
              id="profileName"
              name="name"
              label="Full name"
              maxLength={100}
              autoComplete="name"
              value={values.name}
              error={errors.profileName}
              onChange={update}
            />
            <Input
              id="profileEmail"
              name="email"
              label="Email address"
              type="email"
              maxLength={255}
              autoComplete="email"
              value={values.email}
              error={errors.profileEmail}
              onChange={update}
            />
            <PasswordInput
              id="currentPassword"
              name="currentPassword"
              label="Current password"
              autoComplete="current-password"
              maxLength={128}
              value={values.currentPassword}
              error={errors.currentPassword}
              onChange={update}
            />
          </fieldset>
          <p className="customer-order-note">
            Your email is your sign-in address. Confirm changes with your current password.
          </p>
          <div className="actions">
            <Button type="submit" disabled={busy}>
              {busy ? 'Saving…' : 'Save account details'}
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={busy}
              onClick={() => {
                setEditing(false)
                setValues(initial)
                setErrors({})
                setFailure('')
              }}
            >
              Cancel
            </Button>
          </div>
        </form>
      )}
      {failure && (
        <p className="notice notice--error" role="alert">
          {failure}
        </p>
      )}
      {message && (
        <p className="notice" role="status">
          {message}
        </p>
      )}
    </div>
  )
}
