# Entertainment Guild

A Vite/React prototype containing a home page, account authentication forms, and staff dashboards.

## Products and inventory

Home displays all six sample products with descriptions, AUD prices, discounts, stock quantities, and availability. Staff dashboards show the full inventory, account and stock totals, the previous price and latest price change, and update timestamps and names.

Admins can edit a product's price, quantity, and discount using Edit → Save changes. Employees have a read-only view. Selling prices are calculated from the base price and percentage discount; zero stock is shown as Out of stock. Quantities must be non-negative whole numbers, prices must have at most two decimal places, and discounts must be between 0 and 100%.

Product edits are saved in this browser's local storage and shared between Home and the dashboard. If storage is unavailable, the dashboard reports that changes only last for the current session. This is prototype browser persistence, not a shared database.

## Install and run

Requires a current Node.js LTS release and npm.

```bash
npm install
npm run dev
```

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
| `/admin/login` | Admin sign in |
| `/admin` | Admin dashboard |
| `/employee` | Employee dashboard |

Register and Admin login are hidden from the top navigation. The employee/customer sign-in form includes a Create an account link to `/register` and an Admin Account button. Registration requires choosing Admin, Employee, or Staff before validating the form; it does not create or sign in an account.

Unknown routes redirect to Home. Successful admin and employee sign-ins open their respective dashboards. Signed-in staff can access their dashboard or log out using the header. Dashboard routes redirect signed-out visitors to sign in and staff with a different role to their own dashboard.

## Project structure

- `src/components/` — shared Button, Input, Header, Layout, and ProductCard components
- `src/data/` — mock product and account records and client-side staff sessions
- `src/pages/` — Home, AuthPages, AdminLogin, and Dashboards
- `src/styles.css` — shared responsive styles
- `docs/` — original project planning documents

## Prototype limitations

Authentication uses mock records rather than a backend. Customer sign in validates credentials and displays confirmation; registration validates the form without creating an account. Staff sessions use browser session storage. No database or server-side authentication is implemented.
