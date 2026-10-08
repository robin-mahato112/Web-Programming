import { useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { useSession } from '../auth/SessionContext.js'

const links = [
  ['/products', 'The collection'],
  ['/cart', 'Bag'],
]

export default function Header() {
  const [open, setOpen] = useState(false)
  // Zehai's customer accounts section starts here: session-aware navigation and logout.
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const { user, status, signOut } = useSession()
  const navigate = useNavigate()
  const accountLinks = status !== 'ready' ? [] : user
    ? [['/profile', 'Profile']]
    : [['/login', 'Sign in'], ['/register', 'Register']]

  async function handleSignOut() {
    setBusy(true)
    setError('')
    try {
      await signOut()
      setOpen(false)
      navigate('/login', { replace: true })
    } catch (error) { setError(error.message) }
    finally { setBusy(false) }
  }
  // Zehai's customer accounts section stops here. The surrounding header is shared UI.

  return (
    <header className="site-header">
      <div className="shell header-inner">
        <NavLink className="brand" to="/products" onClick={() => setOpen(false)}>
          <span className="brand-mark" aria-hidden="true">eg.</span>
          <span className="brand-full">Entertainment<br />Guild</span>
        </NavLink>

        <button
          className="menu-button"
          type="button"
          aria-expanded={open}
          aria-controls="site-nav"
          onClick={() => setOpen(current => !current)}
        >
          {open ? 'Close' : 'Menu'}
        </button>

        <nav
          id="site-nav"
          className={open ? 'site-nav site-nav--open' : 'site-nav'}
          aria-label="Main navigation"
        >
          {/* Zehai: add account links and session controls to the shared navigation. */}
          {[...links, ...accountLinks].map(([path, label]) => (
            <NavLink
              key={path}
              to={path}
              onClick={() => setOpen(false)}
              className={({ isActive }) => (isActive ? 'active' : '')}
            >
              {label}
            </NavLink>
          ))}
          {user && <button className="nav-signout" type="button" disabled={busy} onClick={handleSignOut}>{busy ? 'Signing out...' : 'Sign out'}</button>}
          {status === 'loading' && <span role="status">Checking account...</span>}
        </nav>
      </div>
      {error && <p className="shell notice notice--error" role="alert">{error}</p>}
    </header>
  )
}
