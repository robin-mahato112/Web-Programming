import { useEffect } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import Header from './Header.jsx'

export default function Layout() {
  const { pathname } = useLocation()

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' })
    document.getElementById('main-content')?.focus({ preventScroll: true })
  }, [pathname])

  return (
    <div className="site-frame">
      <Header />
      <main id="main-content" tabIndex={-1}>
        <Outlet />
      </main>
      <footer>
        <div className="shell footer-inner">
          <div>
            <strong>Good company. Great entertainment.</strong>
            <p>Entertainment Guild</p>
          </div>
          <p>Customer account prototype</p>
        </div>
      </footer>
    </div>
  )
}
