import { Navigate, NavLink, Outlet } from 'react-router-dom'
import { useStaffSession } from '../../data/staffSession.js'
import { roleLabel } from '../../data/userStore.js'

// Guards every staff page and shows the section tabs. Child pages read the signed-in user from the outlet context.
export default function StaffLayout({ requiredRole }) {
  const user = useStaffSession()
  if (!user) return <Navigate to={requiredRole === 'admin' ? '/admin/login' : '/login'} replace />
  if (user.role !== requiredRole) return <Navigate to={user.role === 'admin' ? '/admin' : '/employee'} replace />

  const base = `/${user.role}`
  const tabs = [
    [base, 'Dashboard'],
    [`${base}/products`, user.role === 'admin' ? 'Product management' : 'Products'],
    ...(user.role === 'admin' ? [[`${base}/users`, 'User management']] : []),
  ]

  return (
    <section className="section shell dashboard-page">
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
