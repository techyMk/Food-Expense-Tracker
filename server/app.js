import "dotenv/config";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { OAuth2Client } from "google-auth-library";
import { sql, isConfigured, initSchema } from "./db.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const JWT_SECRET = process.env.JWT_SECRET || "dev-insecure-secret-change-me";
const MEALS = ["morning", "afternoon", "night"];

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || "";
const googleEnabled = !!GOOGLE_CLIENT_ID && !GOOGLE_CLIENT_ID.includes("YOUR-CLIENT-ID");
const googleClient = googleEnabled ? new OAuth2Client(GOOGLE_CLIENT_ID) : null;

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
  res.json({ configured: isConfigured, google: googleEnabled });
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
  res.json({ entries: rows });
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
