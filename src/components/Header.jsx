import { useState } from 'react'
import { NavLink } from 'react-router-dom'

const links = [
  ['/', 'Home'], ['/products', 'Products'], ['/cart', 'Cart'], ['/profile', 'Profile'], ['/login', 'Sign in'],
]

export default function Header() {
  const [open, setOpen] = useState(false)
  return (
    <header className="site-header">
      <div className="shell header-inner">
        <NavLink className="brand" to="/" onClick={() => setOpen(false)}><span aria-hidden="true">EG</span> Entertainment Guild</NavLink>
        <button className="menu-button" type="button" aria-expanded={open} aria-controls="site-nav" onClick={() => setOpen(!open)}>Menu</button>
        <nav id="site-nav" className={open ? 'site-nav site-nav--open' : 'site-nav'} aria-label="Main navigation">
          {links.map(([path, label]) => <NavLink key={path} to={path} onClick={() => setOpen(false)} className={({ isActive }) => isActive ? 'active' : ''}>{label}</NavLink>)}
        </nav>
      </div>
    </header>
  )
}
