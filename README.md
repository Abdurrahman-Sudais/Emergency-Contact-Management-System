# BeSafe: emergency contact manager

BeSafe keeps your emergency contacts in the order you'd call them, so the first one is a single tap away. It is a web application with a strong focus on **web application security**.

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
  store.js, db.js    the PostgreSQL database and every query
  start.js           connects to the database and builds the app
api/index.js       ← entry point when hosted on Vercel
server.js          ← entry point when run on your computer (or Render)
tests/             ← 107 automated tests (see TESTING.md)
```

The pages are normal HTML files. When one loads, its script asks the server for data (`fetch("/api/contacts")`) and fills the page in. Forms send their data the same way. The server is still needed: password hashing, sessions, role checks and SQL-injection protection have to happen somewhere users can't tamper with, and anyone can edit the JavaScript running in their own browser.

## Running it

You need **Node.js 24.7 or newer** (it has Argon2 password hashing built in).

The database is **PostgreSQL**. Online it is Supabase. On your own computer, and in the tests, the app uses PGlite, a real PostgreSQL that runs inside Node with nothing to install. Its data lives in `data/pgdata`.

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
| 04 | Validation in the browser **and** again on the server, using the same rules; profile photos checked by their real contents, max 2 MB, location data stripped | `public/js/validate.js`, `src/security/images.js` |
| 05 | SQL injection: every query uses `$1, $2…` parameters | `src/store.js` |
| 06 | XSS: pages insert data with `textContent`; strict Content Security Policy | `public/js/api.js`, `src/security/headers.js` |
| 07 | Sessions: random 256-bit token, HttpOnly/Secure/SameSite cookie, new ID at login, 15-min idle timeout, CSRF tokens | `src/security/sessions.js`, `csrf.js` |
| 08 | Access control: every contact query includes the owner's id; attempts on other people's data are logged | `src/routes/contacts.js` |
| 09 | Medical notes and contact notes encrypted with AES-256-GCM; key kept in `.env`; errors never leak details | `src/security/encryption.js` |
| 10 | HTTPS forced in production, HSTS and hardening headers on every response | `src/security/headers.js`, `server.js` |

## Hosting on Vercel + Supabase (free)

The database lives on Supabase and the website runs on Vercel. A Supabase project called **incase** already exists, with all five tables created and locked down: row-level security is on with no policies, so Supabase's public API can't read anything and only this server can.

### 1. Get the database address from Supabase
1. Open [supabase.com/dashboard](https://supabase.com/dashboard) → project **incase**.
2. **Set a database password:** Project Settings → Database → **Reset database password**. Save it somewhere safe.
3. Click **Connect** (top of the page) → **Transaction pooler**, and copy the URI. It looks like
   `postgresql://postgres.zbyqmzorlgcawmwrumli:[YOUR-PASSWORD]@aws-0-eu-west-2.pooler.supabase.com:6543/postgres`
   Replace `[YOUR-PASSWORD]` with the password from step 2.

**Optional test before deploying:** put that address in your local `.env` as `DATABASE_URL=...` and run `npm start`. The app now uses Supabase from your computer. Remove the line afterwards to go back to the local database.

### 2. Deploy on Vercel
1. Push the code to GitHub.
2. On [vercel.com](https://vercel.com), click **Add New → Project**, import the repository, and leave the build settings alone (`vercel.json` sets them).
3. Under **Environment Variables**, add:

| Name | Value |
|---|---|
| `DATABASE_URL` | the Supabase address from step 1 |
| `DATA_KEY` | a new key: run `npm run key` and paste what it prints |
| `NODE_ENV` | `production` |
| `SMTP_HOST` | `smtp.gmail.com` |
| `SMTP_PORT` | `465` |
| `SMTP_USER` | the Gmail address that sends the codes |
| `SMTP_PASS` | that Gmail account's **app password** (see below) |
| `MAIL_FROM` | `BeSafe <that Gmail address>` |

4. Click **Deploy**. The site is live at `https://<project>.vercel.app`, with HTTPS already on.

### Email codes (Gmail)
New accounts confirm their email with a 6-digit code, so the live site must be able to send email. A free Gmail account works:
1. Use (or create) a Gmail account for the project and turn on **2-Step Verification** (Google Account → Security).
2. Go to [myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords), create an app password called "BeSafe", and copy the 16 letters.
3. Put those into the `SMTP_*` and `MAIL_FROM` settings above. Gmail allows about 500 emails a day.

On your own computer you can leave `SMTP_HOST` empty: codes are then printed in the terminal where `npm start` runs. In production the app refuses to start without email settings, because nobody could sign up.

### Google sign-in (optional)
The "Continue with Google" button only appears once these are set:
1. Go to [console.cloud.google.com](https://console.cloud.google.com), create a project called "BeSafe".
2. **APIs & Services → OAuth consent screen**: choose **External**, fill in the app name and your email, and add the scopes `openid`, `email` and `profile`.
3. **APIs & Services → Credentials → Create credentials → OAuth client ID**: choose **Web application**. Under **Authorized redirect URIs** add
   `https://<your-site>.vercel.app/api/auth/google/callback` (and `http://localhost:3000/api/auth/google/callback` for testing on your computer).
4. Copy the **Client ID** and **Client secret** into Vercel as `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`, and set `APP_URL` to `https://<your-site>.vercel.app`.
5. While the consent screen is in "Testing" mode, only the Google accounts you add as test users can sign in. Click **Publish app** when you're ready for everyone.

### 3. Make yourself an admin
Sign up on the live site. Then, in Supabase → **SQL Editor**, run:
```sql
UPDATE users SET role = 'admin' WHERE lower(email) = lower('your@email.com');
```

### Good to know
- **Keep `DATA_KEY` safe.** If it is lost or changed, encrypted notes and medical details can't be read again.
- **Don't run `npm run seed` against Supabase.** The demo passwords are published in this README.
- **The free Supabase plan pauses after a week with no visitors.** Nothing is deleted: open the dashboard and click **Restore project**, then wait about a minute. Open the site a day before presenting.
- **Stricter database encryption check (optional):** download the SSL certificate from Supabase (Project Settings → Database → SSL Configuration) and paste its contents into a `DATABASE_CA_CERT` variable. The app then verifies it is really talking to Supabase.

### Speed
- `vercel.json` runs the app in Vercel's **London** region (`lhr1`), next to the Supabase database, so each database question takes a few milliseconds instead of a trip across the Atlantic.
- Styles, scripts and images skip the database and are cached by Vercel's CDN.
- When running on your own computer against Supabase, each query still has to travel to London (about 0.2 seconds), so it will feel slower than the live site. For everyday local work, leave `DATABASE_URL` empty to use the built-in local database.

## Help requests
People who can't log in (locked, suspended, forgot their password) can use **Contact an admin** (`support.html`, linked from the login page). Requests appear under **Help requests** on the Admin page, with buttons to unlock or reinstate the account, reply by email, or mark the request resolved. Each email can send up to 3 requests an hour.

## Alternative: Render (paid, about $7/month)

`render.yaml` is also included. On [render.com](https://render.com): **New → Blueprint** → pick the repo → **Apply**. Render runs the local PostgreSQL (PGlite) on a 1 GB disk, so Supabase isn't needed. To make an admin, open the service's **Shell** tab and run `npm run make-admin -- your@email.com`.
