# Customer account extension — setup and verification

Technical implementation notes, 30 October 2026. Team main reviewed: `13f7348`. This extension builds on the university v1.1 backend and the team's current API installer; it does not replace the supplied database or the shopping/staff modules.

## Completed account flow

- Registration and sign-in retain the supplied salted password format and HttpOnly cookie.
- My account edits the customer's name and sign-in email after checking their current password. Duplicate emails are rejected. The target user ID comes from the cookie; the form cannot change another user or a role.
- Delivery details and order history retain the existing course API. Changing identity does not rewrite historical delivery records. Checkout resolves the current account email from SQL.
- Forgot password requests an email, then accepts the emailed code and a new password. Codes expire after 15 minutes, are stored hashed in server memory, and work once. A new request supersedes the earlier code. API responses never contain the code.
- Password/email changes invalidate old customer sessions across account and checkout routes. A successful email change refreshes the editing browser's cookie; other sessions sign in again. Staff authentication is unchanged.

## Install on the existing backend

Run from the frontend repository, with the actual extracted university backend path:

```powershell
$env:COURSE_BACKEND_DIRECTORY='C:\path\to\course-backend.local'
node scripts/install-course-checkout.js
node scripts/install-course-customer.js
```

The second installer checks the supplied source layout before editing. It copies the account module and locked mail dependency into `auth/customer-extension`, replaces the development reset handlers, and adds `.customer.env` to the existing auth service. Originals are saved as `.before-customer`. It never runs SQL or writes `db/`.

For local demonstration, edit the backend's `.customer.env`:

```dotenv
CUSTOMER_MAIL_MODE=local
SMTP_HOST=mailpit
SMTP_PORT=1025
SMTP_FROM=accounts@example.test
SMTP_USER=
SMTP_PASSWORD=
```

Use the **existing** Compose project name from `docker compose ls`; keep its database service, volumes, credentials and port mappings:

```powershell
docker compose -p YOUR_EXISTING_PROJECT -f C:\path\to\compose.yml -f C:\path\to\this-repo\docker\customer-mail.compose.yml up -d mailpit
docker compose -p YOUR_EXISTING_PROJECT -f C:\path\to\compose.yml -f C:\path\to\this-repo\docker\customer-mail.compose.yml up -d --no-deps --build auth
```

The optional inbox is at `http://localhost:18026`. It is bound to loopback. SMTP stays inside the Compose network. The page labels this as demo mode: messages **do not reach external email accounts**. It contains reset secrets, so do not publish the inbox port.

The default frontend is `http://localhost:3000`, API `http://localhost:13001`. Use `npm run dev` from this repository. If already running, open the existing page instead of starting another process on the same port. All account, catalogue and staff clients must use the same `VITE_API_URL` and the API must allow that frontend origin.

## External email with Gmail

For personal Gmail, follow [the guided Gmail setup](customer-gmail-setup.md). Its local PowerShell prompt hides the app password and requires a code from the received test email before activating the configuration.

Set `CUSTOMER_MAIL_MODE=smtp` and the provider's `SMTP_HOST`, `SMTP_PORT`, verified `SMTP_FROM`, `SMTP_USER` and `SMTP_PASSWORD` in the backend file only. Port 465 uses implicit TLS; other SMTP ports require STARTTLS. Recreate the auth service after configuration changes. Never put mail credentials in frontend variables or commit `.customer.env`.

Real Gmail inbox delivery was verified on 29 October 2026 on the local development backend. The website sent a recovery email to a dedicated disposable customer mailbox, and the received code successfully reset that customer's password. The SMTP settings remain private to this machine; other team installations need their own server-side configuration. Empty configuration disables email recovery instead of claiming that an email was sent. Mailpit remains an optional local demonstration mode.

## Added API contract

All requests use the existing API origin. Writes require JSON, an allowed `Origin`, and `X-Customer-Request: 1`. Authenticated writes also require the existing cookie.

| Method and route | Body / result |
| --- | --- |
| `GET /api/customer/recovery` | `{ enabled, delivery: "local" or "email" }` |
| `POST /requestPasswordReset` | `{ email }`; identical generic acknowledgement for known/unknown addresses; no reset code returned |
| `POST /resetPassword` | `{ token, password }`; 8–128 characters, letter and number; rejects invalid, expired and used codes |
| `PATCH /api/customer/profile` | `{ name, email, currentPassword }`; returns safe identity and refreshed cookie; accepts only the signed-in customer |

Expected failures: 400 invalid fields/code, 401 invalid customer session, 403 wrong password/role/origin, 409 duplicate email, 429 request limit, 503 unavailable SQL/mail configuration. A mail provider rejection returns the generic reset acknowledgement to avoid revealing account existence; the server logs a non-sensitive delivery failure.

Reset codes and request limits are held in memory, so an API restart invalidates outstanding codes. This is a single-instance coursework deployment. Durable reset storage and a distributed rate limiter would be needed for a multi-instance production service. The university hashing format is retained for compatibility; this extension does not redesign the supplied authentication system.

## Demonstration (synthetic customer recommended)

1. Register/sign in and open My account. Change name/email with the current password. Refresh and sign out/in using the changed email. An incorrect password or a duplicate email should fail without changing the account.
2. Save delivery details and refresh. Edit without saving, then Reset: the saved values return.
3. Sign out, open Forgot password, and request a code. Open the customer's real email inbox (or Mailpit when explicitly using local mode), copy the newest code, and change the password. The new password works; the old one and reused code fail.
4. Use a test product and simulator payment in the isolated database. Open order history and its items. A second customer must not see the first customer's order.
5. Check staff/admin sign-in, catalogue and bag. The new customer module does not add employee/admin permissions or alter product prices/payment logic.

## Evidence and requirements

- Unit/API suite: `npm test` (141 passed after Gmail configuration and failure-isolation checks).
- Desktop/mobile route tests: `npm run test:ui` (74 passed).
- Actual SQL + SMTP integration: `tests/customer-course.integration.js`, restricted to local API 13002 and the synthetic `AccountVerification` database; name/email, reset, checkout, history isolation and staff/admin checks passed.
- Real browser without route mocks: `tests/customer-course.browser.js`, frontend 3002/API 13002; profile save/refresh, SQL order items, SMTP capture/reset/new login and mobile layout passed. Test passwords/codes are not printed or stored in browser storage.
- The fixture schema is `tests/fixtures/customer-course.sql`. Integration scripts require `CUSTOMER_ISOLATED_WRITE_TEST=yes` and the private local test setup. Do not point write tests at the team's StoreDB.
- Real Gmail check, 29 October 2026: submitted the website recovery form for one disposable customer in the local StoreDB and received its email in Gmail. The received code completed the API reset; weak passwords, code reuse, the old password and the old session were rejected. New-password login succeeded, the customer identity and empty order history were preserved, and the shared product catalogue returned successfully. No existing customer's password or order was changed. Populated order-history checks are covered separately by the isolated SQL tests above.

Requirements checked against Canvas Assignment 3 (`/courses/36837/assignments/312209`), Assignment 3 FAQs, `BusinessScenarios_V02.pdf` (customer recovery email and account edits), and `EnterainmentGuild_SystemRequirementsDocument_V03.pdf` (supplied database and role separation). The accessible guidance did not explicitly forbid backend extensions; this is not an explicit approval from the lecturer. Recovery delivery has been verified with both local mail capture and a real Gmail inbox. Each deployment still needs its own mail configuration.

Scope: changed account UI/API and setup only; team catalogue, cart, checkout, management and database schema implementations are retained. The root dependency audit also reports existing Azure/MSAL transitive advisories present on main; no unrelated forced dependency upgrade was applied as part of this account change.
