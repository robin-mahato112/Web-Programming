import { useEffect } from 'react'
import { Link, Outlet, useLocation } from 'react-router-dom'
import Header from './Header.jsx'

/**
 * Wrap customer routes in the shared header, main landmark and footer.
 * Outlet renders whichever child route App selects. The main-content ID is the
 * target of the skip link in index.html, letting keyboard users bypass navigation.
 */
export default function Layout() {
  const { pathname } = useLocation()
  useEffect(() => {
    const previous = window.history.scrollRestoration
    window.history.scrollRestoration = 'manual'
    return () => {
      window.history.scrollRestoration = previous
    }
  }, [])
  useEffect(() => {
    if (pathname !== '/products') window.scrollTo({ top: 0, behavior: 'instant' })
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
          <p>Books, games and movies</p>
          <Link to="/admin/login">Staff sign in</Link>
        </div>
      </footer>
    </div>
  )
}
