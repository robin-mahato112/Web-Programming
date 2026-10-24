import { useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { isStaff, signOut, staffHome, useSession, useSessionStatus } from '../data/session.js'

function navLinks(user) {
  if (!user) return [['/', 'Home'], ['/login', 'Sign in']]
  if (isStaff(user)) return [['/', 'Home'], [staffHome(user), 'Dashboard']]
  return [['/', 'Home'], ['/account', 'My account']]
}

export default function Header() {
  const [open, setOpen] = useState(false)
  const user = useSession()
  const status = useSessionStatus()
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const navigate = useNavigate()
  const logout = async () => {
    if (pending) return
    setOpen(false)
    setPending(true)
    setError('')
    const destination = isStaff(user) ? `${staffHome(user)}/login` : '/login'
    const result = await signOut()
    setPending(false)
    if (result.error) setError(result.error)
    else navigate(destination, { replace: true })
  }
  return (
    <header className="site-header">
      <div className="shell header-inner">
        <NavLink className="brand" to="/" onClick={() => setOpen(false)}><span className="brand-mark" aria-hidden="true">EG</span><span className="brand-full">Entertainment<br />Guild</span></NavLink>
        <button className="menu-button" type="button" aria-expanded={open} aria-controls="site-nav" onClick={() => setOpen(!open)}>Menu</button>
        <nav id="site-nav" className={open ? 'site-nav site-nav--open' : 'site-nav'} aria-label="Main navigation">
          {(status === 'loading' ? [['/', 'Home']] : navLinks(user)).map(([path, label]) => <NavLink key={path} to={path} end={path === '/'} onClick={() => setOpen(false)} className={({ isActive }) => isActive ? 'active' : ''}>{label}</NavLink>)}
          {user && <button type="button" className="button button--secondary" disabled={pending} onClick={logout}>{pending ? 'Signing out...' : 'Sign out'}</button>}
        </nav>
      </div>
      {error && <p className="shell notice notice--error" role="alert">{error}</p>}
    </header>
  )
}
