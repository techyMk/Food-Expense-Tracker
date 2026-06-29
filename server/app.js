import "dotenv/config";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { OAuth2Client } from "google-auth-library";
import webpush from "web-push";
import { sql, isConfigured, initSchema } from "./db.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const JWT_SECRET = process.env.JWT_SECRET || "dev-insecure-secret-change-me";
const MEALS = ["morning", "afternoon", "night"];

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || "";
const googleEnabled = !!GOOGLE_CLIENT_ID && !GOOGLE_CLIENT_ID.includes("YOUR-CLIENT-ID");
const googleClient = googleEnabled ? new OAuth2Client(GOOGLE_CLIENT_ID) : null;

// ---- Web Push (VAPID) ----
const VAPID_PUBLIC = process.env.VAPID_PUBLIC_KEY || "";
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY || "";
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || "mailto:reminders@meal-tracker.app";
const pushEnabled = !!VAPID_PUBLIC && !!VAPID_PRIVATE;
if (pushEnabled) webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);
// Reminder fires for meals in this timezone offset (IST = +5:30 = 330 min).
const TZ_OFFSET_MIN = Number(process.env.REMINDER_TZ_OFFSET_MIN || 330);

// Ensure tables exist once per process/instance (safe on serverless cold starts).
let schemaPromise = null;
export function ensureSchema() {
  if (!schemaPromise) {
    schemaPromise = initSchema().catch((e) => { schemaPromise = null; throw e; });
  }
  return schemaPromise;
}

const app = express();
app.use(express.json());

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const clampInt = (v) => Math.max(0, Math.round(Number(v) || 0));

function issue(user) {
  const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: "30d" });
  return { token, user: { id: user.id, email: user.email } };
}

function auth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: "Not signed in." });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: "Session expired — sign in again." });
  }
}

// ---- Health (frontend uses this to decide setup vs app) ----
app.get("/api/health", (req, res) => {
  res.json({ configured: isConfigured, google: googleEnabled, push: pushEnabled });
});

// Gate everything else on a working database (and lazily create tables).
app.use("/api", async (req, res, next) => {
  if (req.path === "/health") return next();
  if (!isConfigured) return res.status(503).json({ error: "Server is not connected to a database yet." });
  try {
    await ensureSchema();
  } catch (e) {
    console.error("Schema init failed:", e.message);
    return res.status(503).json({ error: "Database not ready — try again in a moment." });
  }
  next();
});

// ---- Auth ----
app.post("/api/auth/signup", wrap(async (req, res) => {
  const email = String(req.body?.email || "").trim().toLowerCase();
  const password = String(req.body?.password || "");
  if (!email || password.length < 6) {
    return res.status(400).json({ error: "Enter an email and a password of at least 6 characters." });
  }
  const hash = await bcrypt.hash(password, 10);
  try {
    const { rows } = await sql`
      insert into users (email, password_hash) values (${email}, ${hash})
      returning id, email`;
    res.json(issue(rows[0]));
  } catch (e) {
    if (e.code === "23505" || /duplicate key/i.test(e.message || "")) {
      return res.status(409).json({ error: "That email is already registered — sign in instead." });
    }
    throw e;
  }
}));

app.post("/api/auth/login", wrap(async (req, res) => {
  const email = String(req.body?.email || "").trim().toLowerCase();
  const password = String(req.body?.password || "");
  const { rows } = await sql`select id, email, password_hash from users where email = ${email}`;
  const u = rows[0];
  if (!u || !u.password_hash || !(await bcrypt.compare(password, u.password_hash))) {
    return res.status(401).json({ error: "Wrong email or password." });
  }
  res.json(issue(u));
}));

app.post("/api/auth/google", wrap(async (req, res) => {
  if (!googleEnabled) return res.status(400).json({ error: "Google sign-in is not configured on the server." });
  const credential = req.body?.credential;
  if (!credential) return res.status(400).json({ error: "Missing Google credential." });

  let payload;
  try {
    const ticket = await googleClient.verifyIdToken({ idToken: credential, audience: GOOGLE_CLIENT_ID });
    payload = ticket.getPayload();
  } catch {
    return res.status(401).json({ error: "Could not verify Google sign-in." });
  }

  const email = String(payload.email || "").trim().toLowerCase();
  if (!email || !payload.email_verified) {
    return res.status(401).json({ error: "Your Google account has no verified email." });
  }

  const { rows } = await sql`
    insert into users (email, google_sub) values (${email}, ${payload.sub})
    on conflict (email) do update set google_sub = coalesce(users.google_sub, excluded.google_sub)
    returning id, email`;
  res.json(issue(rows[0]));
}));

app.get("/api/me", auth, (req, res) => {
  res.json({ user: { id: req.user.id, email: req.user.email } });
});

// ---- Settings (default rates) ----
app.get("/api/settings", auth, wrap(async (req, res) => {
  const { rows } = await sql`select rates from user_settings where user_id = ${req.user.id}`;
  res.json({ rates: rows[0] ? rows[0].rates : null });
}));

app.put("/api/settings", auth, wrap(async (req, res) => {
  const rates = req.body?.rates;
  if (!rates || typeof rates !== "object") return res.status(400).json({ error: "Invalid rates." });
  await sql`
    insert into user_settings (user_id, rates, updated_at)
    values (${req.user.id}, ${JSON.stringify(rates)}::jsonb, now())
    on conflict (user_id) do update set rates = excluded.rates, updated_at = now()`;
  res.json({ ok: true });
}));

// ---- Meal entries ----
app.get("/api/meals", auth, wrap(async (req, res) => {
  const month = String(req.query.month || ""); // "YYYY-MM"
  if (!/^\d{4}-\d{2}$/.test(month)) return res.status(400).json({ error: "Invalid month." });
  const start = month + "-01";
  const { rows } = await sql`
    select to_char(date, 'YYYY-MM-DD') as date, meal, taken, amount
      from meal_entries
     where user_id = ${req.user.id}
       and date >= ${start}::date and date < (${start}::date + interval '1 month')`;
  const { rows: statusRows } = await sql`
    select to_char(date, 'YYYY-MM-DD') as date, no_meal, adjustment, note
      from day_status
     where user_id = ${req.user.id}
       and (no_meal = true or adjustment <> 0 or note is not null)
       and date >= ${start}::date and date < (${start}::date + interval '1 month')`;
  const status = {};
  for (const s of statusRows) {
    status[s.date] = { noMeal: !!s.no_meal, adjustment: Number(s.adjustment) || 0, note: s.note || "" };
  }
  res.json({ entries: rows, status });
}));

app.put("/api/day-status", auth, wrap(async (req, res) => {
  const { date } = req.body || {};
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date || ""))) return res.status(400).json({ error: "Invalid date." });
  const noMeal = !!req.body.noMeal;
  const adjustment = Math.round(Number(req.body.adjustment) || 0);
  const note = req.body.note ? String(req.body.note).slice(0, 200) : null;
  await sql`
    insert into day_status (user_id, date, no_meal, adjustment, note, updated_at)
    values (${req.user.id}, ${date}, ${noMeal}, ${adjustment}, ${note}, now())
    on conflict (user_id, date) do update set
      no_meal = excluded.no_meal, adjustment = excluded.adjustment, note = excluded.note, updated_at = now()`;
  res.json({ ok: true });
}));

app.put("/api/meals", auth, wrap(async (req, res) => {
  const { date, meal } = req.body || {};
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date || ""))) return res.status(400).json({ error: "Invalid date." });
  if (!MEALS.includes(meal)) return res.status(400).json({ error: "Invalid meal." });
  const taken = !!req.body.taken;
  const amount = clampInt(req.body.amount);
  await sql`
    insert into meal_entries (user_id, date, meal, taken, amount, updated_at)
    values (${req.user.id}, ${date}, ${meal}, ${taken}, ${amount}, now())
    on conflict (user_id, date, meal)
    do update set taken = excluded.taken, amount = excluded.amount, updated_at = now()`;
  res.json({ ok: true });
}));

// ---- Push subscriptions ----
app.post("/api/push/subscribe", auth, wrap(async (req, res) => {
  const sub = req.body?.subscription || req.body;
  const endpoint = sub?.endpoint;
  const p256dh = sub?.keys?.p256dh;
  const authKey = sub?.keys?.auth;
  if (!endpoint || !p256dh || !authKey) return res.status(400).json({ error: "Invalid subscription." });
  await sql`
    insert into push_subscriptions (endpoint, user_id, p256dh, auth)
    values (${endpoint}, ${req.user.id}, ${p256dh}, ${authKey})
    on conflict (endpoint) do update set user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth`;
  res.json({ ok: true });
}));

app.post("/api/push/unsubscribe", auth, wrap(async (req, res) => {
  const endpoint = req.body?.endpoint;
  if (endpoint) await sql`delete from push_subscriptions where endpoint = ${endpoint} and user_id = ${req.user.id}`;
  res.json({ ok: true });
}));

// ---- Daily reminder (called by Vercel Cron at ~10pm IST) ----
app.get("/api/cron/remind", wrap(async (req, res) => {
  const secret = process.env.CRON_SECRET;
  if (secret && (req.headers.authorization || "") !== `Bearer ${secret}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  if (!pushEnabled) return res.json({ ok: true, skipped: "push not configured" });

  // Today's date in the reminder timezone.
  const dateKey = new Date(Date.now() + TZ_OFFSET_MIN * 60000).toISOString().slice(0, 10);

  const { rows } = await sql`
    select s.endpoint, s.p256dh, s.auth, s.user_id,
      (select count(*) from meal_entries me where me.user_id = s.user_id and me.date = ${dateKey}::date) as marked,
      coalesce((select no_meal from day_status ds where ds.user_id = s.user_id and ds.date = ${dateKey}::date), false) as no_meal
    from push_subscriptions s`;

  let sent = 0, removed = 0;
  for (const r of rows) {
    if (r.no_meal) continue; // day marked "no meals" → no nudge
    const marked = Number(r.marked) || 0;
    if (marked >= MEALS.length) continue; // all logged → no nudge
    const remaining = MEALS.length - marked;
    const payload = JSON.stringify({
      title: "Did you eat today?",
      body: remaining === MEALS.length
        ? "You haven't logged any meals today. Tap to fill them in."
        : `You still have ${remaining} meal${remaining > 1 ? "s" : ""} to log for today.`,
      url: "/",
    });
    try {
      await webpush.sendNotification({ endpoint: r.endpoint, keys: { p256dh: r.p256dh, auth: r.auth } }, payload);
      sent++;
    } catch (e) {
      if (e.statusCode === 404 || e.statusCode === 410) {
        await sql`delete from push_subscriptions where endpoint = ${r.endpoint}`;
        removed++;
      } else {
        console.warn("push send failed:", e.statusCode, e.body || e.message);
      }
    }
  }
  res.json({ ok: true, date: dateKey, candidates: rows.length, sent, removed });
}));

// ---- Serve the built frontend (local `npm start` only; on Vercel the CDN does this) ----
if (process.env.NODE_ENV === "production" && !process.env.VERCEL) {
  const dist = path.join(__dirname, "..", "dist");
  app.use(express.static(dist));
  app.get("*", (req, res) => res.sendFile(path.join(dist, "index.html")));
}

// ---- Error handler ----
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: "Server error." });
});

export default app;
