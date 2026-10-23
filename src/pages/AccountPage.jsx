import { useState } from 'react'
import { Link, Navigate, useLocation } from 'react-router-dom'
import Button from '../components/Button.jsx'
import DeliveryFields from '../components/DeliveryFields.jsx'
import ResourceStatus from '../components/ResourceStatus.jsx'
import { useResource } from '../data/backend.js'
import { deliveryDetails, saveDeliveryDetails } from '../data/customerAccount.js'
import { isStaff, staffHome, useSession, useSessionStatus } from '../data/session.js'

const emptyDetails = { phoneNumber: '', streetAddress: '', suburb: '', state: '', postcode: '' }

function DeliveryForm({ details }) {
  const [values, setValues] = useState(details ?? emptyDetails)
  const [errors, setErrors] = useState({})
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [pending, setPending] = useState(false)
  const update = event => {
    setValues({ ...values, [event.target.name]: event.target.value })
    setMessage('')
  }
  const submit = async event => {
    event.preventDefault()
    setPending(true)
    const result = await saveDeliveryDetails(values, details)
    setPending(false)
    setErrors(result.errors || {})
    setError(result.error || '')
    setMessage(result.details ? 'Delivery details saved.' : '')
  }

  return (
    <form className="info-panel" noValidate onSubmit={submit} aria-busy={pending} aria-labelledby="delivery-heading">
      <h2 id="delivery-heading">Delivery details</h2>
      {!details && <p>You haven't saved a delivery address yet.</p>}
      <div className="form-grid">
        <DeliveryFields values={values} errors={errors} onChange={update} />
      </div>
      {error && <p className="notice notice--error" role="alert">{error}</p>}
      {message && <p className="notice" role="status">{message}</p>}
      <div className="actions">
        <Button type="submit" disabled={pending}>{pending ? 'Saving…' : 'Save delivery details'}</Button>
      </div>
    </form>
  )
}

function Account({ user }) {
  const { state } = useLocation()
  const details = useResource(deliveryDetails)

  return (
    <section className="section shell account-page">
      <p className="eyebrow">My account</p>
      <h1>Hello, {user.name}</h1>
      {state?.registered && <p className="notice" role="status">Welcome to the guild! Your account has been created and you're signed in.</p>}
      {state?.detailsError && <p className="notice notice--error" role="alert">Your delivery details weren't saved: {state.detailsError} Enter them again below.</p>}

      <div className="account-layout">
        <aside className="summary-card" aria-labelledby="profile-heading">
          <h2 id="profile-heading">Profile</h2>
          <p><span>Name</span><strong>{user.name}</strong></p>
          <p><span>Email</span><strong>{user.email}</strong></p>
          <small>Your email is your sign-in name. Contact us to change your name or email.</small>
          <hr />
          <Link className="card-link" to="/">Browse the collection →</Link>
        </aside>
        <ResourceStatus state={details} resource={deliveryDetails} label="your delivery details">
          {details.data && <DeliveryForm details={details.data.details} />}
        </ResourceStatus>
      </div>
    </section>
  )
}

export default function AccountPage() {
  const user = useSession()
  const status = useSessionStatus()
  if (status === 'loading') return <section className="section shell"><p role="status">Checking your sign in…</p></section>
  if (!user) return <Navigate to="/login" replace />
  if (isStaff(user)) return <Navigate to={staffHome(user)} replace />
  return <Account user={user} />
}
