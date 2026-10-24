import { Navigate, NavLink, Outlet } from 'react-router-dom'
import { roleLabel, staffHome, useSessionStatus, useStaffSession } from '../../data/session.js'
import SessionStatus from '../../components/SessionStatus.jsx'

// Guards every staff page and shows the section tabs. Child pages read the signed-in user from the outlet context.
export default function StaffLayout({ requiredRole }) {
  const user = useStaffSession()
  const status = useSessionStatus()
  if (status !== 'ready') return <section className="section shell dashboard-page"><SessionStatus /></section>
  if (!user) return <Navigate to={`/${requiredRole}/login`} replace />
  if (user.role !== requiredRole) return <Navigate to={staffHome(user)} replace />

  const base = `/${user.role}`
  const tabs = [
    [base, 'Dashboard'],
    [`${base}/products`, user.role === 'admin' ? 'Product management' : 'Products'],
    ...(user.role === 'admin' ? [[`${base}/users`, 'User management']] : []),
  ]

  return (
    <section className="section shell dashboard-page">
      <SessionStatus />
      <div className="staff-bar">
        <p>Signed in as <strong>{user.name}</strong> <span className="pill">{roleLabel(user.role)}</span></p>
        <nav className="staff-tabs" aria-label={`${roleLabel(user.role)} sections`}>
          {tabs.map(([path, label]) => <NavLink key={path} to={path} end>{label}</NavLink>)}
        </nav>
      </div>
      <Outlet context={user} />
    </section>
  )
}
