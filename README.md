# Entertainment Guild

A Vite/React prototype containing a home page, account authentication forms, and staff dashboards. The staff area reads and writes the INFT3050 backend API; Home and the customer pages still use sample data.

## Staff area (live backend)

Staff sign in at `/admin/login` with a backend User account (for example `adminAccount` / `adminPW` from the course Postman collection). Admin accounts also enter the admin code (`ADMIN001` by default, set with `VITE_ADMIN_CODE`) and open `/admin`; other staff leave the code blank and open `/employee`. The admin code is checked in the browser only, so it is a prototype gate rather than real security.

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
| `/login` | Customer and employee sign-in validation |
| `/register` | Customer registration validation |
| `/admin/login` | Staff sign in (admins and employees) |
| `/admin` | Admin dashboard |
| `/admin/products` | Product management |
| `/admin/users` | User management |
| `/employee` | Employee dashboard |
| `/employee/products` | Read-only product inventory |
| `/test-connection` | Backend connection check |

Register and Staff sign in are hidden from the top navigation. The customer sign-in form links to `/register` and to Staff sign in.

Unknown routes redirect to Home. Staff pages redirect signed-out visitors to Staff sign in and staff with a different role to their own dashboard. The sign-in cookie lasts one hour; when it expires the next staff request signs you out.

## Project structure

- `src/components/` — shared Button, Input, Header, Layout, ProductCard, and ProductVisual components
- `src/api.js` — axios client for the backend (base URL from `VITE_API_URL`, sends the login cookie)
- `src/data/backend.js` — API helpers (paginated list, read, count, patch) and the shared loading store used by staff pages
- `src/data/staffSession.js`, `catalogue.js`, `staffAccounts.js`, `discountStore.js` — staff sign in, live products and stock, accounts, and browser-only discounts
- `src/data/mock*.js`, `productStore.js`, `userStore.js` — sample data still used by Home and the customer pages
- `src/pages/` — Home, AuthPages, AdminLogin (staff sign in), and `staff/` (layout, dashboard, product and user management)
- `src/components/charts.jsx` — dashboard charts
- `src/styles.css` — stylesheet entry point; import this file from `src/main.jsx`
- `src/styles/` — supplied cream/orange theme, catalogue, cover art, commerce, and responsive styles; `app.css` adapts the existing forms and dashboards to the same theme
- `docs/` — original project planning documents

## Prototype limitations

Customer sign in and registration still validate against sample records and do not call the backend's `/patronLogin` or Patrons endpoints. Home shows the six sample products. Discounts exist only in the browser that set them. The backend's `GET /Source` list and `ProductsInOrders` endpoints currently fail, so format names are read one source at a time and there is no per-product sales history.
