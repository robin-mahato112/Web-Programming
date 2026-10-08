# Assignment 1.3 - Progress SCRUM 2 & GitCommit

Student: ZeHai Feng

Student number: c3490965

Date: 8 October 2026

Status: Customer account integration implemented; overall team prototype in progress.

## Individual contribution

Since Assignment 1.2, the customer account pages connect to the lecturer-provided API and SQL Server instead of mock customer records.

- `src/services/customerApi.js`: registration, login, cookie session, profile retrieval, delivery details updates and logout.
- `src/auth/`: shared session state, session restoration, account route protection and retry handling.
- `src/pages/AuthPages.jsx`: asynchronous login and registration, validation, disabled pending forms, server errors and navigation.
- `src/pages/CustomerProfile.jsx`: read current customer details, save/reset delivery information and recover from load errors.
- `src/components/Header.jsx`, `src/App.jsx`, `src/main.jsx`: integrate customer session state into navigation and routes.
- `src/components/PasswordInput.jsx`: retains the Assignment 1.2 visibility/strength component and corrects the zero-rule strength label.
- `vite.config.js`: local proxy to the course API.
- `src/styles.css`: account layout and navigation styles, alongside the previously adopted team UI styling.

English section comments identify the customer account contribution. Existing team pages, shared UI components and product mock data are included to keep the project runnable; they are not claimed as new individual feature work. Existing Git authorship is preserved. Button/Layout and broader styling changes adapt the shared team UI already used in the local demo.

## Run locally

1. Start Docker Desktop and the lecturer-provided backend using `docker compose up -d` in its own directory. The API must be reachable at `http://localhost:3001`.
2. In the backend's `.env`, include the frontend origins in the allowlist:

```dotenv
CORS_ORIGINS=http://localhost:3000,http://localhost:5183,http://127.0.0.1:5183,http://localhost:5184,http://127.0.0.1:5184
```

3. Run `docker compose up -d auth` there to apply the configuration.
4. In this frontend directory:

```bash
npm ci
npm run dev
```

Open `http://127.0.0.1:5183`. If already running, use that page or stop the previous Vite terminal with Ctrl+C. An alternative is `npm run dev -- --port 5184`.

The development proxy forwards `/backend` requests to the course API. Cookies carry authentication; passwords and tokens are not saved in localStorage. A production deployment needs an equivalent reverse proxy and HTTPS. `npm run preview` alone does not provide the development API proxy.

## Verification

`npm run lint` and `npm run build` pass. Local browser checks covered registration, duplicate/wrong credential API checks, navigation visibility, direct guest profile access, refresh, delivery save/reset, logout, expired sessions, failed-profile-load retry, password visibility and mobile menu/layout. Use fictional details and a test-only password when creating an account.

## Current limits

- Name and login email are read-only because the supplied API does not permit patrons to update the account table.
- Registration and delivery creation are separate API operations. If account creation succeeds but delivery setup fails, the user is directed to complete their profile.
- Products, cart and admin/employee screens retain their existing prototype behavior.
- The lecturer's backend, database files, local environment settings and installed dependencies are not included.
- This Git repository is the code submission. The individual report is submitted separately to Canvas and SCRUM attendance is in person.
