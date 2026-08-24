# Entertainment Guild

Entertainment Guild is a three-member INFT3050 React team project for browsing and eventually managing entertainment products. This repository currently contains the Sprint 1 foundation and interface prototypes for Customer, Employee, and Administrator roles.

## Sprint 1 scope

Sprint 1 includes a Vite/React application, routing, a responsive shared layout, reusable interface components, isolated mock products, example form validation, role-page prototypes, planning documents, and low-fidelity wireframes. It is intended for the Start-Up SCRUM demonstration—not as a complete application.

## Install and run

Prerequisites: a current Node.js LTS release and npm.

```bash
npm install
npm run dev
```

Vite prints the local development URL, normally `http://localhost:5173`.

Quality checks:

```bash
npm run lint
npm run build
npm run preview
```

## Available routes

| Route | Prototype |
| --- | --- |
| `/` | Home |
| `/products` | Product catalogue and search |
| `/products/:productId` | Product details |
| `/cart` | Empty cart |
| `/login` | Login validation example |
| `/register` | Registration validation example |
| `/profile` | Customer profile |
| `/admin` | Administrator dashboard |
| `/admin/products` | Product management placeholder |
| `/admin/users` | User management placeholder |
| `/employee` | Read-only employee dashboard |

## Team responsibilities

- Robin: product catalogue, search, product details, and cart
- Member 2: registration, login, customer profile, and validation
- Member 3: admin dashboard, product/user management, and employee permissions
- Whole team: shared decisions, integration review, accessibility checks, and Sprint demonstration

These are planned responsibility areas, not fabricated contribution records. Git history and individual reports should reflect the work each member actually completes.

## Project structure

- `src/components/` — reusable Button, Input, ProductCard, Header, and Layout components
- `src/data/mockProducts.js` — interface-only mock data isolated from future persistence
- `src/pages/` — route-level prototypes
- `docs/` — Sprint plan, conduct, permissions, SCRUM questions, contribution template, and wireframes

## Known limitations

- There is no database integration; the supplied database was not present in this repository.
- Authentication, authorization, sessions, and real users are not implemented.
- Cart persistence, checkout, payment, orders, and stock management are not implemented.
- Administrator write actions and Employee data are placeholders.
- Mock products and dashboard counts are demonstration values only.
- Automated component/end-to-end tests have not yet been added.

## Future work

After lecturer confirmation, inspect the supplied database schema and define a backend/API boundary. Later sprints can add secure authentication and server-side role checks, live product and user data, cart persistence, checkout requirements, automated tests, and deployment. Do not infer the database schema or payment design from the Sprint 1 mock data.
