# Member 2 - Customer Accounts

## Scope

This contribution covers the customer account area for Sprint 1:

- Registration wireframe and basic React registration page
- Login wireframe and basic React login page
- Customer profile wireframe and prototype page
- Client-side form validation documentation

The pages are prototypes only. Authentication, sessions, password hashing, and database writes are planned for later sprints.

## Wireframes

| Screen | Desktop web wireframe |
| --- | --- |
| Registration | `docs/member2-wireframes/desktop-registration-wireframe.svg` |
| Login | `docs/member2-wireframes/desktop-login-wireframe.svg` |
| Customer profile | `docs/member2-wireframes/desktop-customer-profile-wireframe.svg` |

## Implemented React Files

| Deliverable | File |
| --- | --- |
| Login and registration forms | `src/pages/AuthPages.jsx` |
| Customer profile page | `src/pages/CustomerProfile.jsx` |
| Customer mock data | `src/data/mockCustomers.js` |
| Shared route setup | `src/App.jsx` |
| Navigation link | `src/components/Header.jsx` |
| Form/profile styling | `src/styles.css` |

## Test Login

The Sprint 1 mock customer can be used to demonstrate successful login validation:

- Email: `jane.l.j.citizen@somemail.com`
- Password: `Password123`

## Validation Rules

| Screen | Field | Rule | Feedback |
| --- | --- | --- | --- |
| Registration | Full name | Required; cannot be blank | Enter your full name. |
| Registration | Email | Required; valid email format; cannot already exist in mock customer list | Enter a valid email address. / This email is already registered. |
| Registration | Password | Required; at least 8 characters; must include letters and numbers | Use 8+ characters with letters and numbers. |
| Registration | Confirm password | Must match password | Passwords must match. |
| Registration | Phone number | Required | Enter your phone number. |
| Registration | Street address | Required | Enter your street address. |
| Registration | Suburb | Required | Enter your suburb. |
| Registration | State | Required | Enter your state. |
| Registration | Postcode | Required; exactly 4 digits | Postcode must be 4 digits. |
| Login | Email | Required; valid email format | Enter a valid email address. |
| Login | Password | Required | Enter your password. |
| Login | Credentials | Email and password must match a stored customer record | Email or password is incorrect. |
| Profile | Name, email, phone, address fields | Displayed as editable prototype fields; save disabled until API exists | Backend/API required before updates are persisted. |

## Database Mapping

| Database area | Intended use |
| --- | --- |
| `Patrons` | Customer identity fields such as user ID, name, email, and stored password value |
| `TO` | Customer contact and delivery profile fields such as phone number, street address, suburb, state, and postcode |

## Sprint 1 Explanation

I created the Member 2 customer account prototype in React by expanding the login and registration pages, adding customer-specific validation, and creating a customer profile page. I also documented the validation rules and how the prototype fields relate to the supplied customer database tables. This work is ready to demonstrate in the Start-Up SCRUM as front-end evidence, while backend authentication and database persistence remain future sprint work.
