# Assignment 1.2 - Progress SCRUM 1, GitCommit, & Update

**Student role:** Member 2 - Customer Accounts
**Progress date:** 11 September 2026
**Development status:** In progress

## New Progress Since the Previous SCRUM

- Added customer session state to the React application.
- Added browser persistence for the mock customer and newly registered accounts.
- Changed registration from validation-only to creating a local prototype account.
- Changed login from validation-only to starting a persistent prototype session.
- Protected the customer profile route from unauthenticated access.
- Added profile editing, validation, saving, and reset controls.
- Added conditional Profile, Sign in, and Sign out navigation.
- Documented the manual demonstration and remaining backend work.

## Git Commit Title

`Progress SCRUM 1 - Add customer account flow (in progress)`

## Individual Contribution Report (226 words)

Since the previous SCRUM, I continued my Member 2 responsibility for customer accounts and developed the login, registration, and profile prototypes into a connected front-end account flow. I added shared authentication state to the React application and browser-based persistence so a customer remains signed in after refreshing the page. The supplied mock customer can now complete a login, while a new user can register a prototype account and be signed in automatically.

I added a protected route for the customer profile. If a user tries to open the profile without signing in, the application redirects them to the login page and returns them to the profile after a successful login. The site navigation now changes according to authentication state, displaying Sign in for visitors and Profile and Sign out for authenticated customers.

I also changed the profile from a read-only demonstration into an editable form. Customers can update their name, email, phone number, address, suburb, state, and postcode. The form validates required fields, email format and uniqueness, and the four-digit postcode before saving changes to browser storage. I documented a manual demonstration flow and clearly labelled the feature as in progress because secure password hashing, API authentication, and database persistence still need to be implemented.

My next step is to replace browser storage with backend API calls connected to the supplied database and add automated tests for authentication and validation behaviour.

## 2-3 Minute SCRUM Demonstration Script

Hi, I am Member 2 and I am responsible for customer accounts. Since the previous SCRUM, I have continued the login, registration, and customer profile work and turned the separate pages into a connected account flow.

First, the login page now creates a customer session instead of only validating the form. I can sign in with the mock account, refresh the browser, and remain signed in. I also protected the profile route, so a visitor who opens the profile is redirected to login. After successful login, they are returned to the profile page.

Second, registration now creates a prototype customer account in browser storage and signs the new customer in automatically. Duplicate email, password strength, matching password, required fields, and postcode validation are still checked.

Third, the customer profile is now editable. A signed-in customer can update contact and delivery details, save them, and confirm that the changes remain after a refresh. The navigation also responds to the session by showing Profile and Sign out only when a customer is authenticated.

This work is marked in progress because it uses browser storage for demonstration. It does not yet provide secure server authentication, password hashing, or database persistence. My next step is to connect the same flow to an API and the supplied database, and then add automated tests.

## Questions for the Senior Developer

1. Which backend framework should our team use for authentication and profile APIs?
2. Should a customer be signed in automatically after successful registration?
3. Should login sessions use secure cookies or another method for the final prototype?
4. Which supplied database table should own customer authentication credentials?
5. Should customers be allowed to change their email address from the profile page?
6. What automated testing depth is expected for the next SCRUM?
