import { useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import useCustomerAuth from '../auth/useCustomerAuth.js'

const links = [
  ['/', 'Home'], ['/products', 'Products'], ['/cart', 'Cart'],
]

export default function Header() {
  const [open, setOpen] = useState(false)
  // Zehai's code starts here: session-aware customer navigation and sign out.
  const { customer, signOut } = useCustomerAuth()
  const navigate = useNavigate()

  const handleSignOut = () => {
    signOut()
    setOpen(false)
    navigate('/')
  }
  // Zehai's code stops here.

  return (
    <header className="site-header">
      <div className="shell header-inner">
        <NavLink className="brand" to="/" onClick={() => setOpen(false)}><span aria-hidden="true">EG</span> Entertainment Guild</NavLink>
        <button className="menu-button" type="button" aria-expanded={open} aria-controls="site-nav" onClick={() => setOpen(!open)}>Menu</button>
        <nav id="site-nav" className={open ? 'site-nav site-nav--open' : 'site-nav'} aria-label="Main navigation">
          {links.map(([path, label]) => <NavLink key={path} to={path} onClick={() => setOpen(false)} className={({ isActive }) => isActive ? 'active' : ''}>{label}</NavLink>)}
          {/* Zehai's code starts here: show customer links according to authentication state. */}
          {customer ? <>
            <NavLink to="/profile" onClick={() => setOpen(false)} className={({ isActive }) => isActive ? 'active' : ''}>Profile</NavLink>
            <button className="nav-action" type="button" onClick={handleSignOut}>Sign out</button>
          </> : <NavLink to="/login" onClick={() => setOpen(false)} className={({ isActive }) => isActive ? 'active' : ''}>Sign in</NavLink>}
          {/* Zehai's code stops here. */}
        </nav>
      </div>
    </header>
  )
}
