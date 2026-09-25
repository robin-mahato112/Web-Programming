import { useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { signOutStaff, useStaffSession } from '../data/staffSession.js'

const links = [
  ['/', 'Home'], ['/login', 'Sign in'],
]

export default function Header() {
  const [open, setOpen] = useState(false)
  const user = useStaffSession()
  const navigate = useNavigate()
  const visibleLinks = user ? [['/', 'Home'], [user.role === 'admin' ? '/admin' : '/employee', 'Dashboard']] : links
  const logout = () => {
    signOutStaff()
    setOpen(false)
    navigate(user.role === 'admin' ? '/admin/login' : '/login', { replace: true })
  }
  return (
    <header className="site-header">
      <div className="shell header-inner">
        <NavLink className="brand" to="/" onClick={() => setOpen(false)}><span aria-hidden="true">EG</span> Entertainment Guild</NavLink>
        <button className="menu-button" type="button" aria-expanded={open} aria-controls="site-nav" onClick={() => setOpen(!open)}>Menu</button>
        <nav id="site-nav" className={open ? 'site-nav site-nav--open' : 'site-nav'} aria-label="Main navigation">
          {visibleLinks.map(([path, label]) => <NavLink key={path} to={path} end onClick={() => setOpen(false)} className={({ isActive }) => isActive ? 'active' : ''}>{label}</NavLink>)}
          {user && <button type="button" className="button button--secondary" onClick={logout}>Logout</button>}
        </nav>
      </div>
    </header>
  )
}
