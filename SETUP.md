# Meal & Expense Tracker — Setup (React + Express + Neon)

Track your 3 daily meals (morning / afternoon / night) and what they cost.
Data is stored in **Neon** (serverless Postgres) behind a small **Express API**
with email + password login. The **React** frontend never touches the database
directly.

```
Browser (React)  →  /api/*  →  Express server  →  Neon Postgres
```

---

## Prerequisites

- **Node.js** 18.11+ (you have it) — check with `node -v`.

## 1. Install dependencies

```powershell
# from the "food recorder" folder
npm install
```

## 2. Create a Neon database (free)

1. Go to <https://neon.tech> and sign in.
2. **Create a project** (any name / region).
3. Click **Connect** and copy the **connection string**. It looks like:
   ```
   postgresql://alex:npg_xxx@ep-cool-name-123456-pooler.us-east-2.aws.neon.tech/neondb?sslmode=require
   ```

## 3. Configure `.env`

Open the **`.env`** file in this folder and fill in:

```
NEON_DATABASE_URL=postgresql://...POOLED connection string...
NEON_DATABASE_URL_UNPOOLED=postgresql://...DIRECT connection string...
JWT_SECRET=some-long-random-string-you-make-up
PORT=3001
```

- `JWT_SECRET` — any long random string; it signs login tokens.
- The database **tables are created automatically** the first time the server
  starts — there is no SQL to run by hand.

### Pooled vs. direct (non-pooled) connection strings

On Neon's **Connect** dialog there's a **Connection pooling** toggle:

| Toggle | Host looks like            | Use it for                         | Goes in                        |
|--------|----------------------------|------------------------------------|--------------------------------|
| **ON** | `ep-xxxx-pooler.<region>…` | Normal app queries (many, short)   | `NEON_DATABASE_URL`            |
| **OFF**| `ep-xxxx.<region>…`        | Creating tables / migrations       | `NEON_DATABASE_URL_UNPOOLED`   |

The only difference is `-pooler` in the hostname. The app uses the **pooled** URL
at runtime and the **direct** URL when it creates/updates tables on startup
(direct connections are recommended for schema changes). If you only fill in the
pooled URL, the app falls back to it for migrations too — fine for this small app.

> `.env` is git-ignored. `.env.example` shows the format.

## 3b. (Optional) Enable "Continue with Google"

Skip this if you're happy with email + password — the Google button simply stays
hidden until configured.

1. Go to <https://console.cloud.google.com> → create (or pick) a project.
2. **APIs & Services → OAuth consent screen**: choose **External**, fill in app
   name + your email, **Save**. (You can leave it in "Testing" mode and add your
   own Google account under **Test users**.)
3. **APIs & Services → Credentials → Create credentials → OAuth client ID**:
   - Application type: **Web application**
   - **Authorized JavaScript origins** — add both:
     - `http://localhost:5173` (the dev app)
     - your production URL later (e.g. `https://meals.example.com`)
   - Create, then copy the **Client ID** (ends with `.apps.googleusercontent.com`).
4. Put that same Client ID into **both** lines in `.env`:
   ```
   GOOGLE_CLIENT_ID=1234-abc.apps.googleusercontent.com
   VITE_GOOGLE_CLIENT_ID=1234-abc.apps.googleusercontent.com
   ```
   - `GOOGLE_CLIENT_ID` (server) verifies the token Google returns.
   - `VITE_GOOGLE_CLIENT_ID` (browser) renders the button. Vite bakes this in at
     startup, so **restart `npm run dev`** after editing it.
5. Reload the app — a **Continue with Google** button appears under the form.

A Google sign-in is matched to a normal account **by email address**: signing in
with Google and with email/password using the same address lands on the same data.
(Google accounts are created without a password; to also use a password for that
email, you'd register it via the form.)

## 4. Run it

```powershell
npm run dev
```

This starts **both** processes together:
- the **API server** on `http://localhost:3001`
- the **React app** on `http://localhost:5173` (opens automatically)

The React dev server proxies `/api/*` to the API, so you only interact with
<http://localhost:5173>. Create an account, sign in, and start tracking.
Sign in with the same email on your phone (same network → use your PC's IP, or
deploy as below) and everything syncs.

### Production build

```powershell
npm run build     # bundles the React app into dist/
npm start         # serves dist/ AND the API from http://localhost:3001
```

In production the Express server serves the built frontend and the API on one
port, so you can host it on any Node platform (Render, Railway, Fly.io, a VPS).
Set `NEON_DATABASE_URL`, `JWT_SECRET`, and `NODE_ENV=production` in the host's
environment.

---

## How the costs work

| Day        | Morning | Afternoon | Night | Total |
|------------|--------:|----------:|------:|------:|
| Mon – Sat  |     ₹35 |       ₹50 |   ₹35 |  ₹120 |
| Sunday     |     ₹35 |       ₹80 |   ₹35 |  ₹150 |

- Every amount is **editable** (type a value, press Enter or click away to save).
  Edit one day inline, or change the defaults for all future days under **⚙️ Rates**.
- Only meals you mark **taken** count toward the spend.

## API reference

All data routes require `Authorization: Bearer <token>` (handled automatically
by the frontend after login).

| Method | Route               | Purpose                              |
|--------|---------------------|--------------------------------------|
| GET    | `/api/health`       | `{ configured }` — is the DB wired?  |
| POST   | `/api/auth/signup`  | Create account → `{ token, user }`   |
| POST   | `/api/auth/login`   | Sign in → `{ token, user }`          |
| POST   | `/api/auth/google`  | Verify Google ID token → `{ token, user }` |
| GET    | `/api/me`           | Current user from token              |
| GET    | `/api/settings`     | `{ rates }` (default per-day rates)  |
| PUT    | `/api/settings`     | Save `{ rates }`                     |
| GET    | `/api/meals?month=YYYY-MM` | `{ entries: [...] }` for a month |
| PUT    | `/api/meals`        | Upsert `{ date, meal, taken, amount }` |

## Project structure

```
food recorder/
├─ index.html              Vite entry (mounts React)
├─ .env                    NEON_DATABASE_URL, JWT_SECRET, PORT (git-ignored)
├─ .env.example            Template for .env
├─ vite.config.js          Dev server + /api proxy → :3001
├─ api/
│  └─ index.js            Vercel serverless entry (wraps the Express app)
├─ server/
│  ├─ app.js               Express app: auth + data routes (shared)
│  ├─ index.js             Local dev entry: listens on PORT
│  └─ db.js                Neon HTTP driver + auto-creates tables
├─ vercel.json             Vercel build config
├─ DEPLOY.md               Deployment guide (Vercel)
└─ src/
   ├─ main.jsx             React entry
   ├─ App.jsx              Decides: setup / login / app
   ├─ api.js               fetch wrapper + token storage
   ├─ constants.js         Meals, default rates, names
   ├─ dateUtils.js         Date key helpers
   ├─ index.css            Styles (mobile-first, responsive)
   ├─ context/ToastContext.jsx
   └─ components/
      ├─ AuthView.jsx      Email sign-in / sign-up (+ Google button)
      ├─ GoogleButton.jsx  "Continue with Google" (Google Identity Services)
      ├─ SetupBanner.jsx   Shown until the DB is connected
      ├─ Tracker.jsx       Main app: state + API calls
      ├─ DayNav.jsx        Day navigation
      ├─ MealRow.jsx       One meal (toggle + editable amount)
      ├─ RatesPanel.jsx    Editable default rates
      ├─ MonthSummary.jsx  Monthly totals + day table
      └─ NumberField.jsx   Numeric input (commit on blur/Enter)
legacy/                    The original plain HTML/CSS/JS version (kept for reference)
```

## Database tables (created automatically)

- **users** — `id`, `email` (unique), `password_hash`, `created_at`
- **user_settings** — `user_id`, `rates` (jsonb), `updated_at`
- **meal_entries** — `user_id`, `date`, `meal`, `taken`, `amount` — PK `(user_id, date, meal)`

Each query is scoped to the signed-in user's `user_id`, so users only ever see
their own data (the API enforces this in place of Supabase's row-level security).

## Troubleshooting

- **Setup screen won't go away** → `.env` still has placeholders, or you didn't
  restart `npm run dev` after editing it. The server prints
  `✅ Connected to Neon...` when it's working.
- **Server log shows "Could not connect to Neon"** → re-check `NEON_DATABASE_URL`
  (copy it again from Neon → Connect; keep `?sslmode=require`).
- **"Wrong email or password"** → no email confirmation step exists here; just use
  the exact email/password you signed up with.
- **Port already in use** → change `PORT` in `.env` (and it still works, because the
  Vite proxy points at `http://localhost:3001` — if you change the port, update the
  proxy target in `vite.config.js` too).
