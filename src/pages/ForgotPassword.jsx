import { useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { loginPath } from '../lib/auth-navigation.js'
import { courseResetPassword } from '../services/course-api.js'

/** Reset codes stay in this form, never in URLs or browser storage. */
export default function ForgotPassword() {
  const [params] = useSearchParams()
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState('')
  const [complete, setComplete] = useState(false)
  const submitting = useRef(false)

  async function resetPassword(event) {
    event.preventDefault()
    if (submitting.current) return
    submitting.current = true
    const form = event.currentTarget
    const fields = new FormData(form)
    setBusy(true)
    setFailure('')
    try {
      await courseResetPassword(Object.fromEntries(fields))
      form.reset()
      setComplete(true)
    } catch (error) {
      setFailure(error.message)
    } finally {
      form.elements.password.value = ''
      form.elements.confirmPassword.value = ''
      submitting.current = false
      setBusy(false)
    }
  }

  return (
    <section className="section shell">
      <div className="auth-panel">
        <p className="eyebrow">Entertainment Guild</p>
        <h1>Forgot password?</h1>
        {complete ? (
          <p role="status">Your password has been changed. Sign in with your new password.</p>
        ) : (
          <>
            <p>Enter your reset code and choose a new password.</p>
            <p>
              Email delivery is not configured for this project. A valid reset code is required.
            </p>
            <form onSubmit={resetPassword} aria-busy={busy}>
              <label className="field">
                Reset code
                <input
                  name="token"
                  autoComplete="off"
                  spellCheck={false}
                  required
                  disabled={busy}
                />
              </label>
              <label className="field">
                New password
                <input
                  name="password"
                  type="password"
                  autoComplete="new-password"
                  minLength={8}
                  maxLength={128}
                  required
                  disabled={busy}
                  aria-describedby="reset-password-help"
                />
              </label>
              <p id="reset-password-help">Use 8–128 characters.</p>
              <label className="field">
                Confirm password
                <input
                  name="confirmPassword"
                  type="password"
                  autoComplete="new-password"
                  minLength={8}
                  maxLength={128}
                  required
                  disabled={busy}
                />
              </label>
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
          <Link to={loginPath(params.get('returnTo'))}>Back to sign in</Link>
        </p>
      </div>
    </section>
  )
}
