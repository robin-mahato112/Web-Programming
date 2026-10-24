# Entertainment Guild

A Vite/React application containing a catalogue, customer accounts, and staff dashboards using the INFT3050 backend API. This customer-account update is based on team commit `a9798a7` on `Admin-And-Employee`, prepared on `feature/customer-accounts-final` for team review. See `docs/customer-account-candidate.md` for scope and remaining verification.

## Home and customer accounts (live backend)

- **Home** (`/`) — the live catalogue for everyone, signed in or not: search by title or author, filter by genre, sub-genre and stock, sort by price, title or release date, and page through with Show more. Each card shows the cheapest format's price (with any discount), the formats, and stock. The hero features the most recently updated product in stock.
- **Customer registration** (`/register`) — creates a Patrons row (the backend hashes the password), signs the customer in, and saves their phone and delivery address as a TO row. Emails already registered are rejected using `/patronLookup`. Staff accounts are not created here; admins add them in User management.
- **Customer sign in** (`/login`) — email and password through `/patronLogin`.
- **My account** (`/account`) — the customer's name and email (from Patrons, read only because customers cannot edit Patrons) and their delivery details, which they can update (TO).

## Staff area (live backend)

Admins sign in at `/admin/login` and employees at `/employee/login`; each page links to the other and refuses accounts of the other role. Admins use a backend User account (for example `adminAccount` / `adminPW` from the course Postman collection) plus the admin code (`ADMIN001` by default, set with `VITE_ADMIN_CODE`) and open `/admin`; employees use their username and password and open `/employee`. The admin code is checked in the browser only, so it is a prototype gate rather than real security.

The existing mock admin is disabled by default and in production builds. It is available only in development with `VITE_ENABLE_MOCK_ADMIN=true`. The backend does not know this account, so it cannot save to the database. Use real course accounts for integration verification.

- **Dashboard** — live product, stock, price, order, and account figures with charts. Every chart has a data table.
- **Product management** — all products with search, genre and stock filters. Price and quantity are stored per format (Stocktake row). Admins add products (with one or more formats), edit prices and stock, and delete products; deleting also removes the product's formats and order lines. Employees have a read-only view.
- **User management** (admin only) — add, edit, and delete staff accounts in the User table, and view customer accounts from Patrons. The backend hashes new passwords. You cannot delete or change the role of your own account, and at least one admin must remain. Products list their last updater by username, so deleting a user reassigns those products to the admin doing the delete.

The database has no discount column, so discounts are saved per product in this browser's local storage only. The backend does not validate values, so all validation happens in the forms.

## Install and run

Requires a current Node.js LTS release, npm, and Docker Desktop.

1. Start the backend from the course's `inft3050_2026_v1.0` folder (SQL Server on port 1433, API on port 3001):

   ```bash
   docker compose up -d
   ```

   If the `auth` container shows as exited (it can start before the database is ready), run `docker compose up -d` again.

2. Start the frontend. The same-origin `/backend` proxy forwards requests to the course API. Vite starts on port 3000 and selects the next free port if it is occupied; use the URL printed in the terminal:

   ```bash
   npm ci
   npm run dev
   ```

3. Optional: copy `.env.example` to `.env` and set `API_PROXY_TARGET` for a different backend. Keep `VITE_API_URL=/backend` when using the proxy. Do not put database credentials in frontend environment variables.

The development and preview proxies are not included in the built JavaScript. Deployment needs an HTTPS reverse proxy forwarding `/backend` to the API, or a deliberately configured API URL and CORS/cookie settings.

Visit `/test-connection` to check the frontend can reach the API. Postman (collection in `postman/`) is useful for trying endpoints by hand: call **Login** first so later requests carry the cookie.

## Checks

```bash
npm run lint
npm run build
npm test
npm run preview
```

## Available routes

| Route | Page |
| --- | --- |
| `/` | Home |
| `/login` | Customer sign in |
| `/register` | Customer registration |
| `/account` | Customer account and delivery details |
| `/profile` | Redirect to `/account` for older customer links |
| `/admin/login` | Staff sign in (admins and employees) |
| `/employee/login` | Employee sign in |
| `/admin` | Admin dashboard |
| `/admin/products` | Product management |
| `/admin/users` | User management |
| `/employee` | Employee dashboard |
| `/employee/products` | Read-only product inventory |
| `/test-connection` | Backend connection check |

Register and Staff sign in are hidden from the top navigation. The customer sign-in form links to `/register` and to Staff sign in.

Unknown routes redirect to Home. Staff pages redirect signed-out visitors to Staff sign in and staff with a different role to their own dashboard. My account redirects signed-out visitors to Sign in and staff to their dashboard. Staff and customers share the backend's one sign-in cookie, so signing in as one signs out the other. The cookie lasts one hour; when it expires the next request signs you out.

Browser tests use isolated API fixtures and do not require Docker or modify a database. They run in Microsoft Edge on desktop and mobile-sized viewports. To use a Playwright Chromium installation instead, run `npx playwright install chromium` and set `PLAYWRIGHT_CHANNEL=chromium`. API-fixture tests are not a substitute for real-backend acceptance tests.

## Project structure

- `src/components/` — shared Button, Input, DeliveryFields, Header, Layout, ProductCard, and ProductVisual components
- `src/api.js` — axios client for the backend (base URL from `VITE_API_URL`, sends the login cookie)
- `src/data/backend.js` — API helpers (paginated list, read, count, patch) and the shared loading store
- `src/data/session.js` — sign in and out for staff and customers, and the signed-in user
- `src/data/catalogue.js`, `staffAccounts.js`, `customerAccount.js`, `discountStore.js` — live products and stock, staff accounts, customer registration and delivery details, and browser-only discounts
- `src/data/productStore.js` — price, discount and validation helpers
- `src/pages/` — Home, AuthPages (customer sign in and registration), AccountPage, AdminLogin (staff sign in), and `staff/` (layout, dashboard, product and user management)
- `src/components/charts.jsx` — dashboard charts
- `src/styles.css` — stylesheet entry point; import this file from `src/main.jsx`
- `src/styles/` — supplied cream/orange theme, catalogue, cover art, commerce, and responsive styles; `app.css` adapts the existing forms and dashboards to the same theme
- `docs/` — original project planning documents

## Prototype limitations

Customers cannot change their name or email, because the backend does not let patrons edit Patrons. There is no cart or checkout yet. Home loads the whole catalogue once and filters it in the browser. Discounts exist only in the browser that set them. The backend's `GET /Source` list and `ProductsInOrders` endpoints currently fail, so format names are read one source at a time and there is no per-product sales history.
