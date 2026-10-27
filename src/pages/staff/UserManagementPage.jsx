import { useOutletContext } from 'react-router-dom'
import ResourceStatus from '../../components/ResourceStatus.jsx'
import UserManagement from '../../components/UserManagement.jsx'
import { useResource } from '../../data/backend.js'
import { accounts } from '../../data/staffAccounts.js'

export default function UserManagementPage() {
  const user = useOutletContext()
  const state = useResource(accounts)

  return (
    <>
      <p className="eyebrow">Admin area</p>
      <h1>User management</h1>
      <p className="lead">
        View staff and customer accounts. Edit a staff member's name or switch them between employee
        and admin.
      </p>
      <ResourceStatus state={state} resource={accounts} label="accounts">
        {state.data && (
          <UserManagement staff={state.data.staff} customers={state.data.customers} actor={user} />
        )}
      </ResourceStatus>
    </>
  )
}
