# Entertainment Guild

A Vite/React prototype containing a home page, customer accounts, and staff dashboards. Every page reads and writes the INFT3050 backend API; there is no sample data in the app.

## Home and customer accounts (live backend)

- **Home** (`/`) — the live catalogue for everyone, signed in or not: search by title or author, filter by genre, sub-genre and stock, sort by price, title or release date, and page through with Show more. Each card shows the cheapest format's price (with any discount), the formats, and stock. The hero features the most recently updated product in stock.
- **Customer registration** (`/register`) — creates a Patrons row (the backend hashes the password), signs the customer in, and saves their phone and delivery address as a TO row. Emails already registered are rejected using `/patronLookup`. Staff accounts are not created here; admins add them in User management.
- **Customer sign in** (`/login`) — email and password through `/patronLogin`. Entering a staff username (anything without `@`), such as `employee`, signs in through the staff login instead and opens that account's dashboard.
- **My account** (`/account`) — the customer's name and email (from Patrons, read only because customers cannot edit Patrons) and their delivery details, which they can update (TO).

## Staff area (live backend)

Staff sign in at `/admin/login` with a backend User account. Test accounts in the local StoreDB:

| Role | Username | Password |
|---|---|---|
| Admin | `adminAccount` | `adminPW` (from the course Postman collection) |
| Admin | `admin` | `Admin12345` |
| Employee | `employee` | `Employee12345` |

`admin` and `employee` were added through the API (`POST /api/inft3050/User`), so each team member's Docker database needs them created once; add them under User management while signed in as `adminAccount`. The account's backend role decides the dashboard: admins (`IsAdmin`) open `/admin` and other staff open `/employee`.

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

2. Start the frontend. It must run on port 3000, the only origin the backend's CORS settings allow:

   ```bash
   npm install
   npm run dev
   ```

3. Optional: copy `.env.example` to `.env` to point `VITE_API_URL` at a different backend.

Visit `/test-connection` to check the frontend can reach the API. Postman (collection in `postman/`) is useful for trying endpoints by hand: call **Login** first so later requests carry the cookie.

## Checks

```bash
npm run lint
npm run build
npm run preview
```

## Available routes

| Route | Page |
| --- | --- |
| `/` | Home |
| `/login` | Customer sign in |
| `/register` | Customer registration |
| `/account` | Customer account and delivery details |
| `/admin/login` | Staff sign in (admins and employees) |
| `/admin` | Admin dashboard |
| `/admin/products` | Product management |
| `/admin/users` | User management |
| `/employee` | Employee dashboard |
| `/employee/products` | Read-only product inventory |
| `/test-connection` | Backend connection check |

Register and Staff sign in are hidden from the top navigation. The customer sign-in form links to `/register` and to Staff sign in.

Unknown routes redirect to Home. Staff pages redirect signed-out visitors to Staff sign in and staff with a different role to their own dashboard. My account redirects signed-out visitors to Sign in and staff to their dashboard. Staff and customers share the backend's one sign-in cookie, so signing in as one signs out the other. The cookie lasts one hour; when it expires the next request signs you out.

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
