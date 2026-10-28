import { useState } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import Button from '../components/Button.jsx'
import DeliveryFields from '../components/DeliveryFields.jsx'
import CustomerOrderHistory from '../components/CustomerOrderHistory.jsx'
import ResourceStatus from '../components/ResourceStatus.jsx'
import SessionStatus from '../components/SessionStatus.jsx'
import { customerReturnPath, focusFirstError } from '../data/accountNavigation.js'
import { useResource } from '../data/backend.js'
import { deliveryDetails, saveDeliveryDetails } from '../data/customerAccount.js'
import {
  isStaff,
  staffHome,
  useSession,
  useSessionError,
  useSessionStatus,
} from '../data/session.js'

const emptyDetails = { phoneNumber: '', streetAddress: '', suburb: '', state: '', postcode: '' }

function DeliveryForm({ details, onSaved }) {
  const sessionError = useSessionError()
  const [values, setValues] = useState(details ?? emptyDetails)
  const [errors, setErrors] = useState({})
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [pending, setPending] = useState(false)
  const update = (event) => {
    setValues({ ...values, [event.target.name]: event.target.value })
    setErrors((current) => ({ ...current, [event.target.name]: undefined }))
    setError('')
    setMessage('')
  }
  const submit = async (event) => {
    event.preventDefault()
    if (pending || sessionError) return
    setMessage('')
    setPending(true)
    const result = await saveDeliveryDetails(values, details)
    setPending(false)
    setErrors(result.errors || {})
    focusFirstError(result.errors || {})
    setError(result.error || '')
    setMessage(result.details ? 'Delivery details saved.' : '')
    if (result.details) {
      setValues(result.details)
      onSaved()
    }
  }
  const reset = () => {
    setValues(details ?? emptyDetails)
    setErrors({})
    setError('')
    setMessage('Unsaved changes discarded.')
  }

  return (
    <form
      className="delivery-form"
      noValidate
      onSubmit={submit}
      aria-busy={pending}
      aria-labelledby="delivery-heading"
    >
      <h2 id="delivery-heading">Delivery details</h2>
      {!details && <p>You haven't saved a delivery address yet.</p>}
      <fieldset className="account-fields form-grid" disabled={pending}>
        <DeliveryFields values={values} errors={errors} onChange={update} />
      </fieldset>
      {error && (
        <p className="notice notice--error" role="alert">
          {error}
        </p>
      )}
      {message && (
        <p className="notice" role="status">
          {message}
        </p>
      )}
      <div className="actions">
        <Button type="submit" disabled={pending || Boolean(sessionError)}>
          {pending ? 'Saving…' : 'Save delivery details'}
        </Button>
        <Button type="button" variant="secondary" disabled={pending} onClick={reset}>
          Reset
        </Button>
      </div>
    </form>
  )
}

function Account({ user }) {
  const location = useLocation()
  const { state } = location
  const navigate = useNavigate()
  const details = useResource(deliveryDetails)
  const clearDeliveryWarning = () => {
    if (!state?.detailsError) return
    // Replace history state so a resolved registration warning stays cleared on reload.
    navigate(
      { pathname: location.pathname, search: location.search, hash: location.hash },
      {
        replace: true,
        state: { ...state, detailsError: null },
      },
    )
  }

  return (
    <section className="section shell account-page">
      <p className="eyebrow">My account</p>
      <h1>Hello, {user.name}</h1>
      <SessionStatus />
      {state?.registered && (
        <p className="notice" role="status">
          Welcome to the guild! Your account has been created and you're signed in.
        </p>
      )}
      {state?.detailsError && (
        <p className="notice notice--error" role="alert">
          Your delivery details weren't saved: {state.detailsError} Enter them again below.
        </p>
      )}

      <div className="account-layout">
        <aside className="account-summary" aria-labelledby="profile-heading">
          <h2 id="profile-heading">Profile</h2>
          <p>
            <span>Name</span>
            <strong>{user.name}</strong>
          </p>
          <p>
            <span>Email</span>
            <strong>{user.email}</strong>
          </p>
          <small>Your email is your sign-in name. Contact us to change your name or email.</small>
          <hr />
          <Link className="card-link" to="/">
            Browse the collection →
          </Link>
          {state?.returnTo &&
            !['/', '/account'].includes(customerReturnPath(state.returnTo, '/')) && (
              <p>
                <Link to={customerReturnPath(state.returnTo, '/')}>Continue shopping</Link>
              </p>
            )}
        </aside>
        <ResourceStatus state={details} resource={deliveryDetails} label="your delivery details">
          {details.data && (
            <DeliveryForm
              key={user.userId}
              details={details.data.details}
              onSaved={clearDeliveryWarning}
            />
          )}
        </ResourceStatus>
      </div>
      <CustomerOrderHistory key={user.userId} userId={user.userId} />
    </section>
  )
}

export default function AccountPage() {
  const location = useLocation()
  const user = useSession()
  const status = useSessionStatus()
  if (status !== 'ready')
    return (
      <section className="section shell">
        <SessionStatus />
      </section>
    )
  if (!user)
    return (
      <Navigate to="/login" replace state={{ returnTo: location.pathname + location.search }} />
    )
  if (isStaff(user)) return <Navigate to={staffHome(user)} replace />
  return <Account key={user.userId} user={user} />
}
