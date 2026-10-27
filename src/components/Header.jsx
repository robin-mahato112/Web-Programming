import { useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { catalogueQuery } from '../lib/search.js'
import { useCart } from '../store/cartContext.js'
import { useAuth } from '../store/authContext.js'
import { loginPath, safeReturnTo } from '../lib/auth-navigation.js'

/**
 * Render the store navigation and read the current item count from CartProvider.
 * NavLink supplies the active-route styling, while local state controls whether
 * the mobile menu is expanded. Selecting a destination also closes that menu,
 * so it does not cover the next page. The toggle exposes the same open state
 * to assistive technology through aria-expanded and aria-controls.
 */
export default function Header() {
  const [open, setOpen] = useState(false)
  const { itemCount, loading } = useCart()
  const { user, loading: sessionLoading, logout } = useAuth()
  const [signingOut, setSigningOut] = useState(false)
  const [failure, setFailure] = useState('')
  const location = useLocation()
  const destination = ['/login', '/register', '/forgot-password'].includes(location.pathname)
    ? safeReturnTo(new URLSearchParams(location.search).get('returnTo'))
    : location.pathname + location.search
  const search = catalogueQuery(new URL(destination, 'https://store.invalid').search)
  const links = [
    ['/', 'Home'],
    ...(user?.role === 'customer' ? [['/account', 'My account']] : []),
    ...(['admin', 'employee'].includes(user?.role)
      ? [[user.role === 'admin' ? '/admin' : '/employee', 'Dashboard']]
      : []),
    ['/products' + search, 'The collection'],
    ['/cart' + search, loading ? 'Bag (loading)' : `Bag (${itemCount})`],
  ]

  async function signOut() {
    if (signingOut) return
    setSigningOut(true)
    setFailure('')
    try {
      await logout()
      setOpen(false)
    } catch (error) {
      setFailure(error.message)
    } finally {
      setSigningOut(false)
    }
  }

  return (
    <header className="site-header">
      <div className="shell header-inner">
        <NavLink className="brand" to={'/products' + search} onClick={() => setOpen(false)}>
          <span className="brand-mark" aria-hidden="true">
            eg.
          </span>
          <span className="brand-full">
            Entertainment
            <br />
            Guild
          </span>
        </NavLink>

        <button
          className="menu-button"
          type="button"
          aria-expanded={open}
          aria-controls="site-nav"
          onClick={() => setOpen(!open)}
        >
          {open ? 'Close' : 'Menu'}
        </button>

        <nav
          id="site-nav"
          className={open ? 'site-nav site-nav--open' : 'site-nav'}
          aria-label="Main navigation"
        >
          {user?.role === 'admin' && (
            <NavLink to="/admin/stock" onClick={() => setOpen(false)}>
              Manage stock
            </NavLink>
          )}
          {links.map(([path, label]) => (
            <NavLink
              key={path}
              to={path}
              end={path === '/'}
              onClick={() => setOpen(false)}
              className={({ isActive }) =>
                `${path.startsWith('/cart') ? 'bag-link' : ''} ${isActive ? 'active' : ''}`
              }
            >
              {label}
            </NavLink>
          ))}
          {sessionLoading ? (
            <span role="status">Checking session...</span>
          ) : user ? (
            <button className="text-button" onClick={signOut} disabled={signingOut}>
              {signingOut ? 'Signing out...' : 'Sign out'}
            </button>
          ) : (
            <NavLink to={loginPath(destination)} onClick={() => setOpen(false)}>
              Sign in
            </NavLink>
          )}
        </nav>
      </div>
      {failure && (
        <p className="shell field-error" role="alert">
          {failure}
        </p>
      )}
    </header>
  )
}
