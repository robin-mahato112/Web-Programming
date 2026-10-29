# Entertainment Guild

Combined INFT3050 web application: customer accounts and delivery profiles, product browsing, a persistent shopping bag, simulated checkout, and staff administration. The React app uses the supplied university v1.1 cookie API and StoreDB. Products, prices and stock come from SQL Server.

## Run locally

Use Node.js 24 LTS, npm and Docker Desktop. Keep your existing university database and Docker volumes.

1. Run `npm ci` in this repository.
2. Copy `.env.example` to `.env.local`. The default API is `http://localhost:13001`.
3. Start the university API with this project's extensions (see below).
4. Run `npm run dev` and open `http://localhost:3000`.

| Environment                  | Frontend | API on Windows | API inside Docker |
| ---------------------------- | -------- | -------------- | ----------------- |
| Main                         | 3000     | 13001          | 3001              |
| Existing isolated test setup | 3002     | 13002          | 3001              |

`VITE_API_URL` is shared by account, staff and shopping requests. All clients send the HttpOnly login cookie. The university CORS configuration must include the frontend origin. Browser and Postman sessions are separate. Do not expose database passwords or signing keys through `VITE_*` variables.

For the existing isolated installation:

```powershell
$env:VITE_API_URL='http://localhost:13002'
$env:VITE_CATALOGUE_SOURCE='course-2026'
npm.cmd run dev -- --port 3002
```

## Install the university API extensions

The university backend ZIP and database files are not committed. Extract the supplied v1.1 backend into an ignored `course-backend.local` directory, or point the installer at your existing extracted directory. Do not replace an existing database directory with a fresh ZIP.

```powershell
$env:COURSE_BACKEND_DIRECTORY='C:\path\to\existing\course-backend.local'
node scripts/install-course-checkout.js
node scripts/install-course-customer.js
```

The installer copies the extension, installs the reviewed API package/lockfile, removes sensitive debug logging, restricts generic CRUD writes, and adds a durable checkout journal. It preserves the signing key and saves original changed configuration files as ignored `.before-checkout` files. It does not run SQL or change the schema.

The customer installer adds own-account name/email editing and email-based password recovery. Configure its server-only `.customer.env` before rebuilding. See [customer account setup and verification](docs/customer-account-final.md) for the optional local mail inbox, SMTP configuration and API contracts. Existing customer cookies require one new sign-in after installation; staff cookies are unchanged.

Rebuild **only the API service** using the existing Compose project name and file. Find the project name from Docker Desktop or `docker compose ls` first:

```powershell
docker compose -p YOUR_EXISTING_PROJECT -f C:\path\to\compose.yml up -d --no-deps --build auth
```

Keep the current SQL service, host ports, credentials and volumes. Main API mapping is `13001:3001`; the isolated API uses `13002:3001`. For a completely new database installation, follow the university setup instructions separately. Never run a migration from the legacy Windows SQL path against the university Docker database.

## Customer workflow

1. Browse Home or open **The collection**. The collection supports a Search button/Enter, SQL keyword search, category, price, availability and sorting. Search state stays in the URL through product details and checkout. The original Home catalogue retains its browser-side filters.
2. Open a product, read its description and related titles, and choose a source. Each source is identified by `Stocktake.ItemId`, with its own price and stock.
3. Add to the bag and continue shopping. Two sources of the same title remain separate. Change quantities, remove items, clear the bag or refresh; restored items are checked against current stock.
4. Sign in, or choose **Create an account** below the sign-in form. Registration uses the university password hashing endpoint. **My account** edits the saved delivery address. Staff use the separate staff sign-in link.
5. Checkout loads the customer profile or a newer delivery draft saved in this browser. Review/edit delivery, enter a simulator card, then review the order. Only the explicit **Pay** button submits an order.
6. Confirmation/retry uses the original attempt identifier. Reloading a receipt does not place another order. An expired session keeps the bag and pending attempt; re-login does not automatically submit payment.

No card number or CVC is stored in browser storage, the journal or order records. Use test cards only. Approved simulator number: `4242424242424242`; declined: `4000000000000002`; timeout: `4111111111111111`. Use a future expiry and three-digit test CVC. These are simulator inputs, not stored customer credentials or a real payment service.

## Staff workflow

Staff sign in with an existing university User account. The server role determines the dashboard; there is no browser admin code or mock-login bypass.

- **Administrators:** dashboard, product creation with source listings, price/quantity editing, stock controls, and staff account management. Product/listing edits commit together. Stale prices or quantities return a conflict instead of overwriting a newer change.
- **Employees:** dashboard and read-only product inventory. The API denies catalogue writes.
- Product deletion is refused when its listings have order history. Use zero stock to make those listings unavailable.
- Staff cannot delete/demote themselves or remove the last administrator. Account deletion reassigns product updater references in the same transaction.
- Customer sessions cannot access management writes; staff sessions cannot purchase through customer checkout. All roles share one university login cookie.

The database has no discount column. Browser-only discounts are not applied; catalogue, administration and checkout use the same stored prices.

## API contracts

| Endpoint                                    | Purpose                                                                     |
| ------------------------------------------- | --------------------------------------------------------------------------- |
| `GET /api/products?q=...`                   | Parameterised product search with source offers                             |
| `/patronLogin`, `/login`, `/me`, `/logout`  | Supplied customer/staff cookie authentication                               |
| `/api/inft3050/Patrons`, `/api/inft3050/TO` | Supplied registration and owner-scoped delivery records                     |
| `POST /api/checkout/prepare`                | Validate customer/listing IDs/quantities and calculate current totals       |
| `POST /api/checkout/payment-method`         | Exchange simulator card inputs for a signed masked reference                |
| `POST /api/checkout/confirm`                | Validate reviewed prices/stock, then transactionally save order/lines/stock |
| `GET /api/checkout/:attemptId`              | Owner-only confirmation/recovery                                            |
| `GET/PATCH /api/admin/stock[/itemId]`       | Current listings and guarded quantity updates                               |
| `POST /api/admin/products`                  | Create a product and its source listings together                           |
| `PATCH/DELETE /api/admin/products/:id`      | Atomic listing edits or deletion without order-history loss                 |
| `PATCH/DELETE /api/admin/users/:id`         | Transactional staff edits/removal                                           |

Management writes require the current administrator role from SQL, an allowed Origin and `X-Management-Request: 1`. Checkout uses `X-Checkout-Request: 1`; stock quantity controls use `X-Stock-Request: 1`. Generic Product/Stocktake/order writes and generic staff edits/deletes are blocked so they cannot bypass those controls.

Product edit body: `{ listings: [{ itemId, price, quantity, expected: { price, quantity } }] }`. Product create body: `{ title, author, description, genreId, subGenreId, published, listings: [{ sourceId, price, quantity }] }`. Staff edit body: `{ name, role: "admin" | "employee" }`. Checkout receives listing IDs and quantities, never a browser-authoritative total.

## Checks and Postman

```powershell
npm.cmd run check
npm.cmd run test:ui
```

`check` runs formatting, lint, Node tests and the production build. `test:ui` runs the group account tests in desktop/mobile Edge against deterministic API fixtures; it does not write to StoreDB.

Customer integration rechecked on 30 October 2026: formatting, lint, production build and 146 Node tests passed. All 78 desktop/mobile account checks passed (74 existing checks and four legacy-account compatibility checks). Isolated SQL and live-browser tests verified profile updates, checkout after an email change, order ownership, SMTP recovery and staff/admin permissions. These write tests used `AccountVerification`, not the team's StoreDB. See [account verification details](docs/customer-account-final.md).

Earlier baseline verification on 27 October 2026:

| Check                              | Result                                                                         |
| ---------------------------------- | ------------------------------------------------------------------------------ |
| Formatting, lint, production build | Passed                                                                         |
| Node automated checks              | 127 passed                                                                     |
| Desktop/mobile account checks      | 40 passed, including checkout registration handoff                             |
| Isolated live catalogue/cart       | Search, both sources, refresh, quantity/removal, empty stock and mobile passed |
| Isolated live customer session     | Delivery/review and expiry recovery passed; confirmations intercepted          |
| Isolated live administrator        | Dashboard, product/user/stock pages and customer-checkout denial passed        |
| Isolated management writes         | Temporary product and employee create/edit/delete passed; fixtures removed     |

No new purchase was run against either database during the 27 October integration. Its transaction/rollback checks used deterministic database fixtures; intercepted confirmation is not evidence of a newly committed SQL order. The later customer checks above created orders only in the isolated test database.

Live scripts require private environment variables:

- `tests/course.browser.js`: real catalogue/source/bag checks, read-only.
- `tests/course-session.browser.js`: real patron session and checkout review, with every order-confirmation request intercepted before networking.
- `tests/course-management.browser.js`: real administrator pages and customer-checkout denial, read-only.
- `tests/course-management.integration.js`: requires API 13002 and `COURSE_MANAGEMENT_WRITES=1`; creates/removes its own product and employee fixtures, never an order.

Set `REVIEW_URL`, `COURSE_API_URL`, and private `TEST_PATRON_EMAIL`/`TEST_PATRON_PASSWORD` or `TEST_ADMIN_USERNAME`/`TEST_ADMIN_PASSWORD` as appropriate. Never commit populated settings. The optional purchase test additionally requires `COURSE_CHECKOUT_WRITES=1` and only accepts isolated ports; it retains an isolated order and is not part of `check`.

Import `docs/postman/University-Checkout.postman_collection.json` and the matching Main/Isolated environment. Credentials are blank placeholders. Checkout, stock and management writes are disabled by default and restricted to the isolated API by collection scripts. The original university Postman workspace remains under `postman/`; its examples have credential placeholders and port 13001.

## Storage, limitations and open decisions

Back up StoreDB, `checkout-state.local` and `.checkout.env` together while checkout writes are paused. Restore the matching set; a database-only backup cannot restore the receipt/retry journal. Preserve the signing key and share the durable journal if running multiple API instances.

Payments are simulated. Customer password recovery sends single-use, 15-minute reset codes through server-configured SMTP; real Gmail delivery has been verified locally. Each deployment must install the customer extension and configure its own private `.customer.env`; cloning the repository does not copy mail credentials. See [Gmail setup](docs/customer-gmail-setup.md). Recovery requests are rate-limited, while email verification, sign-in rate limiting and concurrent duplicate-registration protection still require backend work. The course generic API is not a production security boundary for every table.

Lecturer decisions remain: shipping/tax rules, external-provider handoff versus purchase, and a formal discontinued status. Zero stock means out of stock, not permanently discontinued. No rules or charges are invented.

The root dependency audit reports four high-severity affected packages: `@azure/identity`, `@azure/msal-node`, `vite` and `zod`; passing tests does not establish production security. No main StoreDB purchase, production deployment or new-computer installation is claimed by this integration.

The existing planning documents and individual contribution notes describe earlier work. This README describes the combined application; earlier test counts are not evidence for the merged version.
