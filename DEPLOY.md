# Deploying to Vercel

The app is set up for Vercel:

- **Frontend** (Vite) builds to `dist/` and is served from Vercel's CDN.
- **API** runs as a single serverless function at `api/index.js`, which wraps
  the Express app in `server/app.js`.
- **Database** is Neon, accessed over its **HTTP driver** (`@neondatabase/serverless`)
  — perfect for serverless (no persistent connections).

```
Browser ── /api/* ──► Vercel function (Express) ──► Neon (HTTP)
        └─ everything else ─► static dist/ (CDN)
```

---

## 1. Push the code to GitHub

From the project folder:

```powershell
git init
git add -A
git commit -m "Meal & expense tracker"
git branch -M main
git remote add origin https://github.com/<you>/<repo>.git
git push -u origin main
```

> `.gitignore` already excludes `node_modules`, `dist`, and **`.env`** — your
> secrets are NOT committed. You'll set them in Vercel instead (step 3).

## 2. Import the project in Vercel

1. Go to <https://vercel.com> → **Add New… → Project** → import your GitHub repo.
2. Vercel auto-detects the framework (**Vite**). Leave the build settings as-is
   (they're also pinned in `vercel.json`: build `npm run build`, output `dist`).
3. **Don't deploy yet** — add the environment variables first (next step), or
   deploy once and then add them and redeploy.

## 3. Add environment variables

In the Vercel project → **Settings → Environment Variables**, add these for the
**Production** (and Preview) environments:

| Name | Value |
|------|-------|
| `NEON_DATABASE_URL` | your Neon **pooled** connection string (host has `-pooler`) |
| `JWT_SECRET` | a long random string (e.g. from `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"`) |
| `GOOGLE_CLIENT_ID` | your Google OAuth client ID (only if using Google sign-in) |
| `VITE_GOOGLE_CLIENT_ID` | same value as `GOOGLE_CLIENT_ID` |
| `VAPID_PUBLIC_KEY` | for push reminders (only if using reminders) |
| `VITE_VAPID_PUBLIC_KEY` | same value as `VAPID_PUBLIC_KEY` |
| `VAPID_PRIVATE_KEY` | for push reminders — keep secret |
| `VAPID_SUBJECT` | `mailto:you@example.com` |
| `CRON_SECRET` | a random string; protects the daily cron endpoint |

Notes:
- `VITE_*` vars are read **at build time**, so after adding/changing them you must
  **redeploy** (for the Google button and the reminders bell to appear).
- You do **not** need `PORT` or `NEON_DATABASE_URL_UNPOOLED` on Vercel.
- Tables are created automatically on the first request after deploy.

### Daily reminder (optional)

`vercel.json` registers a cron that calls `/api/cron/remind` at **16:30 UTC = 10:00 PM IST**
every day. If a signed-in device has reminders enabled and hasn't logged all 3
meals for the day, it pushes a notification.

- Generate the VAPID keys once: `node -e "console.log(require('web-push').generateVAPIDKeys())"`,
  then put the public key in **both** `VAPID_PUBLIC_KEY` and `VITE_VAPID_PUBLIC_KEY`.
- Set `CRON_SECRET` — Vercel automatically sends it as `Authorization: Bearer …` to the cron.
- Vercel **Hobby** crons run **once per day** (perfect here); the exact minute is approximate.
- In the app, tap the **bell (Reminders)** in the header on each device to opt in
  (the browser asks for notification permission).
- To change the time, edit the `schedule` in `vercel.json` (UTC). For a different
  timezone set `REMINDER_TZ_OFFSET_MIN` (minutes; IST = 330).
- Manual test: `curl -H "Authorization: Bearer <CRON_SECRET>" https://your-app.vercel.app/api/cron/remind`

## 4. Deploy

Click **Deploy** (or push a commit). You'll get a URL like
`https://your-app.vercel.app`. Open it — you should see the login screen.

Quick check: `https://your-app.vercel.app/api/health` should return
`{"configured":true,...}`.

## 5. Allow your Vercel URL in Google (only if using Google sign-in)

Google blocks sign-in from origins it doesn't know about.

1. <https://console.cloud.google.com> → **APIs & Services → Credentials** → your
   OAuth client.
2. Under **Authorized JavaScript origins**, add your exact Vercel URL:
   - `https://your-app.vercel.app` (no trailing slash)
   - add your custom domain too, if you set one up.
3. Save. Changes take a few minutes to apply.

Email/password sign-in works without this; only Google needs it.

---

## How updates deploy

Every `git push` to `main` triggers a new Vercel build + deploy automatically.
Pull requests get their own preview URLs.

## Local development is unchanged

```powershell
npm run dev      # API on :3001 + Vite on :5173 (proxying /api)
```

`server/index.js` is the local entry; `api/index.js` is only used by Vercel.

## Troubleshooting

- **Login screen never loads / setup screen shows** → `NEON_DATABASE_URL` is
  missing or wrong in Vercel env vars. Check `…/api/health`.
- **Google button missing in production** → `VITE_GOOGLE_CLIENT_ID` wasn't set at
  build time; add it and **redeploy**.
- **Google sign-in fails with "popup/origin" error** → add the Vercel URL to
  Authorized JavaScript origins (step 5).
- **First request after idle is slow** → both the Vercel function and the Neon
  free database cold-start; subsequent requests are fast.
