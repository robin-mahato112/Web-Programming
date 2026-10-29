import { useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import Input from '../components/Input.jsx'
import PasswordInput from '../components/PasswordInput.jsx'
import { customerReturnPath, focusFirstError } from '../data/accountNavigation.js'
import {
  getRecoveryDelivery,
  requestRecoveryEmail,
  resetCustomerPassword,
  validatePasswordRecovery,
} from '../data/passwordRecovery.js'
import { validCustomerEmail } from '../data/customerEmail.js'

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
  const [email, setEmail] = useState('')
  const [emailError, setEmailError] = useState('')
  const [emailNotice, setEmailNotice] = useState('')
  const [emailFailure, setEmailFailure] = useState('')
  const [requesting, setRequesting] = useState(false)
  const [delivery, setDelivery] = useState(null)
  const requestingRef = useRef(false)
  const returnTo = customerReturnPath(params.get('returnTo'))
  useEffect(() => {
    let active = true
    getRecoveryDelivery()
      .then((value) => {
        if (active) setDelivery(value)
      })
      .catch(() => {})
    return () => {
      active = false
    }
  }, [])

  async function sendCode(event) {
    event.preventDefault()
    if (requestingRef.current) return
    setEmailNotice('')
    setEmailFailure('')
    if (!validCustomerEmail(email)) {
      setEmailError('Enter a valid email address.')
      focusFirstError({ recoveryEmail: true })
      return
    }
    setEmailError('')
    requestingRef.current = true
    setRequesting(true)
    try {
      const result = await requestRecoveryEmail(email)
      setEmailNotice(result.message)
    } catch (error) {
      setEmailFailure(error.message)
    } finally {
      requestingRef.current = false
      setRequesting(false)
    }
  }

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
      await resetCustomerPassword(values)
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
            <p>Request a reset code using your account email, then enter the code below.</p>
            {delivery?.delivery === 'local' && (
              <p className="notice">
                Demo mode: recovery emails are captured in the local mail inbox. They are not
                delivered to external email accounts.
              </p>
            )}
            {delivery?.enabled === false && (
              <p className="notice">
                Recovery email is currently unavailable. Please contact support.
              </p>
            )}
            <form
              noValidate
              onSubmit={sendCode}
              aria-busy={requesting}
              aria-label="Request recovery email"
            >
              <Input
                id="recoveryEmail"
                name="email"
                label="Account email"
                type="email"
                autoComplete="email"
                maxLength={255}
                value={email}
                disabled={requesting}
                error={emailError}
                onChange={(event) => {
                  setEmail(event.target.value)
                  setEmailError('')
                  setEmailNotice('')
                  setEmailFailure('')
                }}
              />
              {emailNotice && (
                <p className="notice" role="status">
                  {emailNotice}
                </p>
              )}
              {emailFailure && (
                <p className="notice notice--error" role="alert">
                  {emailFailure}
                </p>
              )}
              <button className="button button--secondary" disabled={requesting || busy}>
                {requesting ? 'Requesting…' : 'Send reset code'}
              </button>
            </form>
            <h2>Reset your password</h2>
            <p>Codes expire after 15 minutes. If you requested a new code, use the newest email.</p>
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
