import { useOutletContext } from 'react-router-dom'
import UserManagement from '../../components/UserManagement.jsx'
import { useUsers } from '../../data/userStore.js'

export default function UserManagementPage() {
  const user = useOutletContext()
  const users = useUsers()

  return (
    <>
      <p className="eyebrow">Admin area</p>
      <h1>User management</h1>
      <p className="lead">View account names, emails, and roles. Edit a name or change access between customer, employee, and admin.</p>
      <UserManagement users={users} actor={user} />
    </>
  )
}
