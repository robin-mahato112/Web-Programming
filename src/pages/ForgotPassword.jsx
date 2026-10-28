import { useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import Input from '../components/Input.jsx'
import PasswordInput from '../components/PasswordInput.jsx'
import { customerReturnPath, focusFirstError } from '../data/accountNavigation.js'
import { validatePasswordRecovery } from '../data/passwordRecovery.js'
import { courseResetPassword } from '../services/course-api.js'

const emptyFields = { token: '', password: '', confirmPassword: '' }

// AI-assisted: reuse account controls and keep reset codes out of URLs and browser storage.
export default function ForgotPassword() {
  const [params] = useSearchParams()
  const [values, setValues] = useState(emptyFields)
  const [errors, setErrors] = useState({})
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState('')
  const [complete, setComplete] = useState(false)
  const submitting = useRef(false)
  const returnTo = customerReturnPath(params.get('returnTo'))

  function update(event) {
    const { name, value } = event.target
    setValues((current) => ({ ...current, [name]: value }))
    setErrors((current) => ({
      ...current,
      [name]: undefined,
      ...(name === 'password' ? { confirmPassword: undefined } : {}),
    }))
    setFailure('')
  }

  async function resetPassword(event) {
    event.preventDefault()
    if (submitting.current) return
    const next = validatePasswordRecovery(values)
    setErrors(next)
    setFailure('')
    if (Object.keys(next).length) {
      focusFirstError(next)
      return
    }
    submitting.current = true
    setBusy(true)
    setFailure('')
    try {
      await courseResetPassword(values)
      setValues(emptyFields)
      setComplete(true)
    } catch (error) {
      setFailure(error.message)
      setValues((current) => ({ ...current, password: '', confirmPassword: '' }))
    } finally {
      submitting.current = false
      setBusy(false)
    }
  }

  return (
    <section className="auth-page">
      <div className="auth-card">
        <p className="eyebrow">Customer account</p>
        <h1>Forgot password?</h1>
        {complete ? (
          <p role="status">Your password has been changed. Sign in with your new password.</p>
        ) : (
          <>
            <p>Enter your reset code and choose a new password.</p>
            <p>
              Email delivery is not configured for this project. A valid reset code is required.
            </p>
            <form onSubmit={resetPassword} noValidate aria-busy={busy}>
              <fieldset className="account-fields" disabled={busy}>
                <Input
                  id="token"
                  name="token"
                  label="Reset code"
                  autoComplete="off"
                  spellCheck={false}
                  value={values.token}
                  onChange={update}
                  error={errors.token}
                />
                <PasswordInput
                  id="password"
                  name="password"
                  label="New password"
                  autoComplete="new-password"
                  maxLength={128}
                  value={values.password}
                  onChange={update}
                  error={errors.password}
                  hint="Use 8–128 characters with at least one letter and one number."
                  showStrength
                />
                <PasswordInput
                  id="confirmPassword"
                  name="confirmPassword"
                  label="Confirm password"
                  autoComplete="new-password"
                  maxLength={128}
                  value={values.confirmPassword}
                  onChange={update}
                  error={errors.confirmPassword}
                />
              </fieldset>
              {failure && (
                <p className="field-error" role="alert">
                  {failure}
                </p>
              )}
              <button className="button button--dark button--wide" disabled={busy}>
                {busy ? 'Changing password...' : 'Change password'}
              </button>
            </form>
          </>
        )}
        <p>
          <Link to={'/login?' + new URLSearchParams({ returnTo })}>Back to sign in</Link>
        </p>
      </div>
    </section>
  )
}
