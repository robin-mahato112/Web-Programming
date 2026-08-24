import { Outlet } from 'react-router-dom'
import Header from './Header.jsx'

export default function Layout() {
  return (
    <div className="site-frame">
      <Header />
      <main id="main-content"><Outlet /></main>
      <footer><div className="shell footer-inner"><div><strong>Entertainment Guild</strong><p>Find your next story, game or soundtrack.</p></div><p>INFT3050 · Sprint 1 prototype · No live purchases</p></div></footer>
    </div>
  )
}
