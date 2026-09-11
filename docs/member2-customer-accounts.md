# Member 2 - Customer Accounts

## Scope

This contribution covers the customer account area across the Start-Up SCRUM and Progress SCRUM 1:

- Registration wireframe and basic React registration page
- Login wireframe and basic React login page
- Customer profile wireframe and prototype page
- Client-side form validation documentation

Progress SCRUM 1 adds a browser-based authentication flow, protected profile route, editable customer profile, and local persistence. The feature remains marked as in progress because secure server authentication, password hashing, and database writes are not connected yet.

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
| Browser-based account persistence | `src/auth/customerStorage.js` |
| Authentication state provider | `src/auth/CustomerAuthProvider.jsx` |
| Protected customer route | `src/components/ProtectedRoute.jsx` |
| Shared route setup | `src/App.jsx` |
| Navigation link | `src/components/Header.jsx` |
| Form/profile styling | `src/styles.css` |

## Test Login

The original mock customer can be used to demonstrate successful login and persistent session handling:

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
| Profile | Name, email, phone, address fields | Required fields, email uniqueness, valid postcode | Changes are saved in browser storage for prototype testing. |

## Progress SCRUM 1 Demonstration

1. Sign in with the mock account and show that `/profile` opens.
2. Refresh the page and show that the customer remains signed in.
3. Edit a profile field, save it, and refresh to show local persistence.
4. Sign out and open `/profile` to show the protected-route redirect.
5. Register a new account and show automatic sign-in with its profile.

This is new prototype code implemented after the Start-Up SCRUM. It is intentionally labelled **in progress** until the same workflow is backed by secure API and database operations.

## Database Mapping

| Database area | Intended use |
| --- | --- |
| `Patrons` | Customer identity fields such as user ID, name, email, and stored password value |
| `TO` | Customer contact and delivery profile fields such as phone number, street address, suburb, state, and postcode |

## Sprint 1 Explanation

I created the Member 2 customer account prototype in React by expanding the login and registration pages, adding customer-specific validation, and creating a customer profile page. I also documented the validation rules and how the prototype fields relate to the supplied customer database tables. This work is ready to demonstrate in the Start-Up SCRUM as front-end evidence, while backend authentication and database persistence remain future sprint work.
