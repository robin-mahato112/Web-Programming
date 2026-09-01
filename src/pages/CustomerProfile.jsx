import Button from '../components/Button.jsx'
import Input from '../components/Input.jsx'
import { sampleCustomer } from '../data/mockCustomers.js'

export default function CustomerProfile() {
  return (
    <section className="section shell customer-profile-page">
      <p className="eyebrow">Member 2 customer accounts</p>
      <h1>Customer profile</h1>
      <p className="lead compact">A Sprint 1 profile prototype showing how customer account and contact fields will map to the supplied database.</p>

      <div className="profile-layout">
        <aside className="profile-summary panel">
          <div className="avatar" aria-hidden="true">JC</div>
          <h2>{sampleCustomer.name}</h2>
          <p>{sampleCustomer.email}</p>
          <dl>
            <dt>Patrons.UserID</dt>
            <dd>{sampleCustomer.userId}</dd>
            <dt>Profile source</dt>
            <dd>Mock data</dd>
          </dl>
        </aside>

        <form className="panel profile-form">
          <h2>Editable customer details</h2>
          <p className="status-note">Values are pre-filled demonstration data. Saving is disabled until the backend/API is connected.</p>
          <div className="form-grid">
            <Input id="profile-name" name="name" label="Full name" defaultValue={sampleCustomer.name} />
            <Input id="profile-email" name="email" type="email" label="Email address" defaultValue={sampleCustomer.email} />
            <Input id="profile-phone" name="phoneNumber" type="tel" label="Phone number" defaultValue={sampleCustomer.phoneNumber} />
            <Input id="profile-street" name="streetAddress" label="Street address" defaultValue={sampleCustomer.streetAddress} />
            <Input id="profile-suburb" name="suburb" label="Suburb" defaultValue={sampleCustomer.suburb} />
            <Input id="profile-state" name="state" label="State" defaultValue={sampleCustomer.state} />
            <Input id="profile-postcode" name="postcode" inputMode="numeric" label="Postcode" defaultValue={sampleCustomer.postcode} />
          </div>
          <div className="actions">
            <Button disabled>Save profile</Button>
            <Button variant="secondary" disabled>View order history</Button>
          </div>
        </form>
      </div>
    </section>
  )
}
