export default function CustomerProfileForm({ user }) {
  return (
    <div className="customer-profile-editor">
      <p>
        <span>Name</span>
        <strong>{user.name}</strong>
      </p>
      <p>
        <span>Email</span>
        <strong>{user.email}</strong>
      </p>
      <p className="customer-order-note">
        Name and email are read-only. You can update your phone number and delivery address below.
      </p>
    </div>
  )
}
