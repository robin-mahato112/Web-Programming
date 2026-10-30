# Customer accounts with the supplied course API

The lecturer confirmed that recovery email can be simulated and customer name/email should remain read-only because marking uses the supplied database/backend. The current account UI follows that guidance.

## Start against the original backend

Start the supplied v1.1 Docker backend normally (`docker compose up -d` in its prepared folder). Run `npm ci`, then `npm run dev` in this frontend and open `http://localhost:3000`. The frontend defaults to the supplied API at `http://localhost:3001`, and the supplied backend already allows `http://localhost:3000`. No frontend environment file is needed for those standard ports.

If reusing a customized team installation, retain its ignored `.env.local` override (for example `VITE_API_URL=http://localhost:13001`). The default change does not replace explicit settings. Do not copy private/local environment files into a marking ZIP. If port 3000 is busy, stop the earlier frontend instance before restarting; a different frontend origin needs an allowed backend CORS entry.

Password recovery demonstration requires the supplied backend's development mode (its default). No mailbox, SMTP password, customer extension, or custom database schema is needed. Checkout and staff extensions are a separate team concern; these instructions do not replace their setup or claim their custom endpoints are available on the base API.

## Demonstrate the account flow

1. Register a test customer or sign in with an existing customer account.
2. Open My account: name/email are displayed read-only. Edit phone/address, save and refresh to verify persistence. Reset discards unsaved edits.
3. Sign out and open Forgot password. Enter that registered account's email and select Send reset code.
4. The page identifies email delivery as a simulation and displays the development reset code returned by the supplied API. Choose Use this code, enter a new password and confirm it, then Change password.
5. Sign in with the new password. The old password should fail. A successfully used reset code cannot be reused. This tests the actual password update, not real mailbox ownership.
6. Open View order history on My account. If this customer has orders, expand the order items. The page reads existing Orders/ProductsInOrders/Stocktake/Product records through the supplied API; it does not create a purchase. An account without orders shows an empty state.

If no development code is returned, check that the account exists and the backend runs in development mode. Do not claim that an email was delivered. Restarting the backend clears its in-memory reset codes. Password changes do not revoke existing cookies in the original backend.

## Existing installation of the old customer extension

This only applies to a backend previously patched by `install-course-customer.js`. Do not install that extension again for this course mode. The following guarded script restores the supplied customer routes from the local pre-customer backup, leaving teammate route implementations unchanged:

```powershell
$env:COURSE_BACKEND_DIRECTORY='C:\path\to\existing\backend'
node scripts/restore-course-customer.js
node scripts/restore-course-customer.js --apply
```

The first invocation validates without writing. The second saves a backup and restores only the customer route changes. Unknown source layouts are refused. Rebuild only `auth` using your existing Compose project/files; keep the SQL service, volume, ports and environment configuration intact. Never reset the database for this change. Private Gmail settings remain local and unused by the restored account routes.

## Verification

`npm run check` covers formatting, lint, unit tests and build. `npm run test:ui` checks desktop/mobile behavior with deterministic fixtures. `tests/course-baseline.integration.js` is opt-in (`CUSTOMER_ISOLATED_WRITE_TEST=yes`) and hardcoded to isolated API port 13003; it writes synthetic test accounts/orders only. It must be connected to the isolated test database, not the team's StoreDB. Its order fixtures verify account reads and do not test payment processing.

Earlier SMTP and editable identity test records document the previous implementation, not the current course mode.
