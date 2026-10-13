# InCase: emergency contact manager

InCase keeps your emergency contacts in the order you'd call them, so the first one is a single tap away. It is a web application with a strong focus on **web application security**.

## How it's built

```
public/            ← the website: plain HTML, CSS and JavaScript (open these to change how it looks)
  index.html         splash screen
  step1-3.html       quick tour          step4.html   add your first contact
  login.html         signup.html         home.html    contacts.html
  profile.html       security.html       admin.html   404.html
  app.css, style.css the styles
  script.js, show.js drawer and show-password scripts
  js/                one script per page (home.js, contacts.js, ...) plus:
    api.js             helper every page uses to talk to the server
    validate.js        form rules, shared by the browser AND the server
    nav.js             top bar: your name, Admin link, Log out
src/               ← the server (Node.js + Express)
  app.js             serves public/ and the /api routes; blocks private pages when signed out
  routes/            the API: auth, home, contacts, profile, admin
  security/          password hashing, sessions, CSRF tokens, encryption, headers
  store.js, db.js    the SQLite database and every query
tests/             ← 94 automated tests (see TESTING.md)
```

The pages are normal HTML files. When one loads, its script asks the server for data (`fetch("/api/contacts")`) and fills the page in. Forms send their data the same way. The server is still needed: password hashing, sessions, role checks and SQL-injection protection have to happen somewhere users can't tamper with, and anyone can edit the JavaScript running in their own browser.

## Running it

You need **Node.js 24.7 or newer** (it has Argon2 and SQLite built in).

```bash
npm install
npm run setup     # creates .env with a random encryption key (never commit .env)
npm run seed      # optional: demo accounts and contacts
npm start         # http://localhost:3000
```

Demo accounts created by `npm run seed`:

| Role  | Email               | Password         |
|-------|---------------------|------------------|
| Admin | admin@incase.test   | `Admin!Demo2026` |
| User  | amina@example.com   | `Amina!Demo2026` |

Other commands:

| Command | What it does |
|---|---|
| `npm test` | runs all automated tests |
| `npm run dev` | starts the server and restarts it when you save a file |
| `npm run make-admin -- someone@example.com` | makes an existing account an admin |
| `npm run cert` | creates a self-signed certificate so you can try HTTPS locally (then set `TLS_KEY_FILE`/`TLS_CERT_FILE` in `.env`) |

## Security features

Each one is explained on the in-app **Security** page and proven by tests in `tests/security.test.js`.

| # | Safeguard | Where |
|---|---|---|
| 01 | Login/logout; logout deletes the session on the server; 5 failed logins lock the account for 15 min | `src/routes/auth.js` |
| 02 | Passwords stored only as salted **Argon2id** hashes | `src/security/passwords.js` |
| 03 | Roles (User/Admin) read from the database on every request | `src/routes/guards.js`, `src/app.js` |
| 04 | Validation in the browser **and** again on the server, using the same rules | `public/js/validate.js` |
| 05 | SQL injection: every query uses `?` parameters | `src/store.js` |
| 06 | XSS: pages insert data with `textContent`; strict Content Security Policy | `public/js/api.js`, `src/security/headers.js` |
| 07 | Sessions: random 256-bit token, HttpOnly/Secure/SameSite cookie, new ID at login, 15-min idle timeout, CSRF tokens | `src/security/sessions.js`, `csrf.js` |
| 08 | Access control: every contact query includes the owner's id; attempts on other people's data are logged | `src/routes/contacts.js` |
| 09 | Medical notes and contact notes encrypted with AES-256-GCM; key kept in `.env`; errors never leak details | `src/security/encryption.js` |
| 10 | HTTPS forced in production, HSTS and hardening headers on every response | `src/security/headers.js`, `server.js` |

## Deploying

Set `NODE_ENV=production` and `DATA_KEY` on the host. If the host terminates HTTPS for you (Render, Railway and similar), also set `TRUST_PROXY=1`. In production, plain HTTP is redirected to HTTPS and cookies are marked `Secure`.
