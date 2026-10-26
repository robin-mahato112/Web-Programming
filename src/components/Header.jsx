import { useEffect, useRef, useState } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import { isStaff, signOut, staffHome, useSession } from '../data/session.js'

function navLinks(user) {
  if (!user) return [['/', 'Home'], ['/login', 'Sign in']]
  if (isStaff(user)) return [['/', 'Home'], [staffHome(user), 'Dashboard']]
  return [['/', 'Home'], ['/account', 'My account']]
}

export default function Header() {
  const [open, setOpen] = useState(false)
  const user = useSession()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  // Navigation runs as a transition but signing out re-renders at once, so a customer signing out on My account
  // would be sent to Sign in by that page's guard. Customers leave for Home first and are signed out once there.
  const leavingTo = useRef(null)
  useEffect(() => {
    if (leavingTo.current !== pathname) return
    leavingTo.current = null
    signOut()
  }, [pathname])
  const logout = () => {
    setOpen(false)
    // Staff pages already send signed-out visitors to Staff sign in, so staff sign out straight away.
    if (isStaff(user)) {
      signOut()
      navigate('/admin/login', { replace: true })
    } else if (pathname === '/') signOut()
    else {
      leavingTo.current = '/'
      navigate('/', { replace: true })
    }
  }
  return (
    <header className="site-header">
      <div className="shell header-inner">
        <NavLink className="brand" to="/" onClick={() => setOpen(false)}><span className="brand-mark" aria-hidden="true">EG</span><span className="brand-full">Entertainment<br />Guild</span></NavLink>
        <button className="menu-button" type="button" aria-expanded={open} aria-controls="site-nav" onClick={() => setOpen(!open)}>Menu</button>
        <nav id="site-nav" className={open ? 'site-nav site-nav--open' : 'site-nav'} aria-label="Main navigation">
          {navLinks(user).map(([path, label]) => <NavLink key={path} to={path} end={path === '/'} onClick={() => setOpen(false)} className={({ isActive }) => isActive ? 'active' : ''}>{label}</NavLink>)}
          {user && <button type="button" className="button button--secondary" onClick={logout}>Logout</button>}
        </nav>
      </div>
    </header>
  )
}
