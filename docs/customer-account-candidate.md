# Customer Account Release Candidate

Prepared for ZeHai Feng; updated on 24 October 2026 for team review on
`feature/customer-accounts-final`. The intended pull request base is
`Admin-And-Employee`, which already has the team's pending PR #3 into `main`.
Robin should review this update before merging it into the team release. This
handoff does not submit to Classroom50 or change the original demo directory.

## Scope and attribution

The base is the team's `Admin-And-Employee` commit `a9798a7`. Existing catalogue,
staff management, API helpers, customer registration, and delivery data mapping
are team code, not newly claimed individual work. This update was AI-assisted;
review and understand the changes and retain the course-required disclosure when
preparing the final submission.

New or revised customer work:

- `PasswordInput.jsx` and `passwordRules.js`: show/hide, accessible feedback and
  one shared set of registration password rules. The meter measures requirements,
  not password entropy or resistance to attack.
- `AuthPages.jsx`: return after sign-in, first-invalid-field focus, duplicate
  submission prevention, disabled inputs during requests and clearing stale errors.
- `AccountPage.jsx`: reset to the last saved address, prevent edits during saves,
  retain failed edits, clear resolved registration warnings (including on reload),
  registration recovery and the `/profile` compatibility route.
- `accountNavigation.js`: same-site return path validation and invalid-field focus.
- `SessionStatus.jsx`, `session.js`, `Header.jsx`: explicit service failures,
  retry, server-confirmed logout, focus-based account restoration and stale request
  guards. Temporary session-check failures preserve unsaved delivery edits and
  disable saving until retry succeeds; expiry/account changes still clear stale
  account data. Uses the existing single team session rather than a second provider.
- `backend.js`: old in-flight requests cannot repopulate resources after reset.
- `customerAccount.js`: shared password validation, phone digit validation,
  saved-contact cache updates and account-change protection.
- `accounts.css`: password button positioning and responsive account layout.
- `api.js`, `vite.config.js`, `.env.example`: same-origin proxy, request timeout,
  free-port fallback and development-only opt-in mock admin.
- Small local compatibility fixes: staff routes display session failures instead
  of redirecting to login; empty catalogue charts no longer crash the dashboard.
- `tests/accounts.spec.js`: desktop and mobile API-contract regression tests.

## Local checks

```powershell
npm ci
npm run lint
npm run build
npm test
npm run dev
```

The test fixtures cover registration, duplicate email, invalid inputs, password
visibility, partial registration recovery, login failure, reload, profile guard,
save/reset, a missing contact, failed logout, expired sessions, service recovery,
customer/staff separation, account changes, stale requests and safe return paths.
They assert that there are no uncaught browser errors. These tests do not prove
database persistence or server-side authorization.

Verified on 24 October 2026: 38 desktop/mobile checks passed, along with
`npm run lint`, `npm run build`, and `git diff --check`.

## Live-backend acceptance still required

The course Docker backend was subsequently started and a public read endpoint
responded successfully. The full account workflow below has not yet been tested
against that real backend for this candidate. Use the course backend unchanged
and a separate test customer:

1. Register, confirm the Patrons and TO API requests succeed, then reload.
2. Change delivery details, save, reload and sign in again. Confirm they persist.
3. Reset an unsaved edit; confirm no save request is sent.
4. Verify wrong passwords, duplicate email, logout and a new browser session.
5. With two test patrons, verify the server prevents cross-account reads/writes.
6. Recheck real staff login and role restrictions with the teammate responsible.
7. Test a backend outage and recovery, including a failed logout.

## Not a complete final team release yet

- This repository version has no working cart or checkout routes. Integration
  with Robin's newest code is a separate team step. Do not claim that
  placing or paying for an order is implemented here.
- Existing name/email fields stay read-only because the course patron role does
  not allow those updates. There is no new password-reset feature.
- The admin code is a pre-existing client-side convenience check, not security.
  Authorization must be enforced by the backend, not hidden frontend buttons.
- Existing discounts remain browser-local; this update does not alter that design.
- Backend uniqueness constraints, password storage policy, sensitive logging,
  HTTPS, payment handling and deployed cookie configuration need team review.
- Several writes are separate API operations, not a database transaction. The
  customer sees a recovery message if registration succeeds but address save fails.
- Use the actual final marking rubric and business rules for final acceptance;
  they have not been fully supplied or verified in this task.
