import "dotenv/config";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { OAuth2Client } from "google-auth-library";
import webpush from "web-push";
import { sql, isConfigured, initSchema, SUPER_EMAIL } from "./db.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const JWT_SECRET = process.env.JWT_SECRET || "dev-insecure-secret-change-me";
const MEALS = ["morning", "afternoon", "night"];
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isManager = (role) => role === "admin" || role === "superuser";

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

/** Thrown from helpers to answer with a specific status instead of a 500. */
class Bad extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

function issue(user) {
  const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: "30d" });
  return { token, user: { id: user.id, email: user.email, role: user.role || "user" } };
}

/** The configured superuser email always owns the superuser role, however it signed up. */
async function ensureSuper(user) {
  if (SUPER_EMAIL && user.email === SUPER_EMAIL && user.role !== "superuser") {
    await sql`update users set role = 'superuser' where id = ${user.id}`;
    user.role = "superuser";
  }
  return user;
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

/** Roles live in the DB, never in the token — a demotion takes effect immediately. */
const managerOnly = wrap(async (req, res, next) => {
  const { rows } = await sql`select id, email, role from users where id = ${req.user.id}`;
  if (!rows[0]) return res.status(401).json({ error: "Your account no longer exists." });
  req.actor = await ensureSuper(rows[0]);
  if (!isManager(req.actor.role)) return res.status(403).json({ error: "You don't have member access." });
  next();
});

const superOnly = (req, res, next) => {
  if (req.actor.role !== "superuser") {
    return res.status(403).json({ error: "Only the superuser can do that." });
  }
  next();
};

/** Loads :id into req.target and checks the actor is allowed to touch that member. */
const loadTarget = wrap(async (req, res, next) => {
  const id = String(req.params.id || "");
  if (!UUID_RE.test(id)) return res.status(400).json({ error: "Invalid member id." });
  const { rows } = await sql`select id, email, role from users where id = ${id}`;
  const target = rows[0];
  if (!target) return res.status(404).json({ error: "No such member." });
  // A provider reaches everyone who eats — including the superuser, who is a
  // member too — but not another provider, who has no meals to manage.
  if (req.actor.role !== "superuser" && target.role === "admin") {
    return res.status(403).json({ error: "Providers don't have meal entries to manage." });
  }
  req.target = target;
  next();
});

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
  const role = email === SUPER_EMAIL ? "superuser" : "user";
  try {
    const { rows } = await sql`
      insert into users (email, password_hash, role) values (${email}, ${hash}, ${role})
      returning id, email, role`;
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
  const { rows } = await sql`select id, email, role, password_hash from users where email = ${email}`;
  const u = rows[0];
  if (!u || !u.password_hash || !(await bcrypt.compare(password, u.password_hash))) {
    return res.status(401).json({ error: "Wrong email or password." });
  }
  res.json(issue(await ensureSuper(u)));
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

  const role = email === SUPER_EMAIL ? "superuser" : "user";
  const { rows } = await sql`
    insert into users (email, google_sub, role) values (${email}, ${payload.sub}, ${role})
    on conflict (email) do update set google_sub = coalesce(users.google_sub, excluded.google_sub)
    returning id, email, role`;
  res.json(issue(await ensureSuper(rows[0])));
}));

app.get("/api/me", auth, wrap(async (req, res) => {
  const { rows } = await sql`select id, email, role from users where id = ${req.user.id}`;
  if (!rows[0]) return res.status(401).json({ error: "Your account no longer exists." });
  const u = await ensureSuper(rows[0]);
  res.json({ user: { id: u.id, email: u.email, role: u.role } });
}));

// ---- Shared data helpers (used both for "me" and, by managers, for another member) ----
async function readSettings(userId) {
  const { rows } = await sql`select rates from user_settings where user_id = ${userId}`;
  return rows[0] ? rows[0].rates : null;
}

async function writeSettings(userId, rates) {
  if (!rates || typeof rates !== "object") throw new Bad(400, "Invalid rates.");
  await sql`
    insert into user_settings (user_id, rates, updated_at)
    values (${userId}, ${JSON.stringify(rates)}::jsonb, now())
    on conflict (user_id) do update set rates = excluded.rates, updated_at = now()`;
}

async function readMonth(userId, month) {
  if (!/^\d{4}-\d{2}$/.test(String(month || ""))) throw new Bad(400, "Invalid month.");
  const start = month + "-01";
  const { rows } = await sql`
    select to_char(me.date, 'YYYY-MM-DD') as date, me.meal, me.taken, me.amount,
           me.updated_at, u.email as updated_by
      from meal_entries me
      left join users u on u.id = me.updated_by
     where me.user_id = ${userId}
       and me.date >= ${start}::date and me.date < (${start}::date + interval '1 month')`;
  const { rows: statusRows } = await sql`
    select to_char(ds.date, 'YYYY-MM-DD') as date, ds.no_meal, ds.adjustment, ds.note,
           ds.updated_at, u.email as updated_by
      from day_status ds
      left join users u on u.id = ds.updated_by
     where ds.user_id = ${userId}
       and (ds.no_meal = true or ds.adjustment <> 0 or ds.note is not null)
       and ds.date >= ${start}::date and ds.date < (${start}::date + interval '1 month')`;
  const status = {};
  for (const s of statusRows) {
    status[s.date] = {
      noMeal: !!s.no_meal,
      adjustment: Number(s.adjustment) || 0,
      note: s.note || "",
      updatedAt: s.updated_at,
      updatedBy: s.updated_by,
    };
  }
  const entries = rows.map((r) => ({
    date: r.date, meal: r.meal, taken: r.taken, amount: r.amount,
    updatedAt: r.updated_at, updatedBy: r.updated_by,
  }));
  return { entries, status };
}

/**
 * Upsert the row and append an audit entry in one statement. The `prev` CTE
 * reads the pre-insert snapshot, and a data-modifying CTE always runs to
 * completion, so `up` happens whether or not the audit row is written — it is
 * skipped when nothing actually changed, which keeps idle re-saves out of the
 * history.
 */
async function writeMeal(userId, body, actor) {
  const { date, meal } = body || {};
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date || ""))) throw new Bad(400, "Invalid date.");
  if (!MEALS.includes(meal)) throw new Bad(400, "Invalid meal.");
  const taken = !!body.taken;
  const amount = clampInt(body.amount);
  await sql`
    with prev as (
      select taken, amount from meal_entries
       where user_id = ${userId} and date = ${date}::date and meal = ${meal}
    ), up as (
      insert into meal_entries (user_id, date, meal, taken, amount, updated_by, updated_at)
      values (${userId}, ${date}, ${meal}, ${taken}, ${amount}, ${actor.id}, now())
      on conflict (user_id, date, meal) do update set
        taken = excluded.taken, amount = excluded.amount,
        updated_by = excluded.updated_by, updated_at = now()
      returning 1
    )
    insert into entry_audit (user_id, actor_id, actor_email, date, kind, meal, before, after)
    select ${userId}, ${actor.id}, ${actor.email}, ${date}::date, 'meal', ${meal},
           (select jsonb_build_object('taken', taken, 'amount', amount) from prev),
           jsonb_build_object('taken', ${taken}::boolean, 'amount', ${amount}::int)
     where (select taken from prev) is distinct from ${taken}::boolean
        or (select amount from prev) is distinct from ${amount}::int`;
}

async function writeDayStatus(userId, body, actor) {
  const { date } = body || {};
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date || ""))) throw new Bad(400, "Invalid date.");
  const noMeal = !!body.noMeal;
  const adjustment = Math.round(Number(body.adjustment) || 0);
  const note = body.note ? String(body.note).slice(0, 200) : null;
  await sql`
    with prev as (
      select no_meal, adjustment, note from day_status
       where user_id = ${userId} and date = ${date}::date
    ), up as (
      insert into day_status (user_id, date, no_meal, adjustment, note, updated_by, updated_at)
      values (${userId}, ${date}, ${noMeal}, ${adjustment}, ${note}, ${actor.id}, now())
      on conflict (user_id, date) do update set
        no_meal = excluded.no_meal, adjustment = excluded.adjustment, note = excluded.note,
        updated_by = excluded.updated_by, updated_at = now()
      returning 1
    )
    insert into entry_audit (user_id, actor_id, actor_email, date, kind, before, after)
    select ${userId}, ${actor.id}, ${actor.email}, ${date}::date, 'day',
           (select jsonb_build_object('noMeal', no_meal, 'adjustment', adjustment, 'note', note) from prev),
           jsonb_build_object('noMeal', ${noMeal}::boolean, 'adjustment', ${adjustment}::int, 'note', ${note}::text)
     where (select no_meal from prev) is distinct from ${noMeal}::boolean
        or (select adjustment from prev) is distinct from ${adjustment}::int
        or (select note from prev) is distinct from ${note}::text`;
}

/** The change history for one person, newest first. */
async function readActivity(userId, month, limit) {
  if (!/^\d{4}-\d{2}$/.test(String(month || ""))) throw new Bad(400, "Invalid month.");
  const start = month + "-01";
  const { rows } = await sql`
    select id, actor_email, to_char(date, 'YYYY-MM-DD') as date, kind, meal, before, after, at
      from entry_audit
     where user_id = ${userId}
       and date >= ${start}::date and date < (${start}::date + interval '1 month')
     order by at desc
     limit ${Math.min(Math.max(Number(limit) || 100, 1), 300)}`;
  return {
    events: rows.map((r) => ({
      id: String(r.id),
      actor: r.actor_email,
      date: r.date,
      kind: r.kind,
      meal: r.meal,
      before: r.before,
      after: r.after,
      at: r.at,
    })),
  };
}

// ---- Settings (default rates) ----
app.get("/api/settings", auth, wrap(async (req, res) => {
  res.json({ rates: await readSettings(req.user.id) });
}));

app.put("/api/settings", auth, wrap(async (req, res) => {
  await writeSettings(req.user.id, req.body?.rates);
  res.json({ ok: true });
}));

// ---- Meal entries ----
app.get("/api/meals", auth, wrap(async (req, res) => {
  res.json(await readMonth(req.user.id, req.query.month));
}));

app.put("/api/day-status", auth, wrap(async (req, res) => {
  await writeDayStatus(req.user.id, req.body, req.user);
  res.json({ ok: true });
}));

app.put("/api/meals", auth, wrap(async (req, res) => {
  await writeMeal(req.user.id, req.body, req.user);
  res.json({ ok: true });
}));

app.get("/api/activity", auth, wrap(async (req, res) => {
  res.json(await readActivity(req.user.id, req.query.month, req.query.limit));
}));

// ---- Admin: members ----
// Same shapes as the routes above, but addressed at another member.
app.get("/api/admin/users/:id/settings", auth, managerOnly, loadTarget, wrap(async (req, res) => {
  res.json({ rates: await readSettings(req.target.id) });
}));

app.put("/api/admin/users/:id/settings", auth, managerOnly, loadTarget, wrap(async (req, res) => {
  await writeSettings(req.target.id, req.body?.rates);
  res.json({ ok: true });
}));

app.get("/api/admin/users/:id/meals", auth, managerOnly, loadTarget, wrap(async (req, res) => {
  res.json(await readMonth(req.target.id, req.query.month));
}));

app.put("/api/admin/users/:id/meals", auth, managerOnly, loadTarget, wrap(async (req, res) => {
  await writeMeal(req.target.id, req.body, req.actor);
  res.json({ ok: true });
}));

app.put("/api/admin/users/:id/day-status", auth, managerOnly, loadTarget, wrap(async (req, res) => {
  await writeDayStatus(req.target.id, req.body, req.actor);
  res.json({ ok: true });
}));

app.get("/api/admin/users/:id/activity", auth, managerOnly, loadTarget, wrap(async (req, res) => {
  res.json(await readActivity(req.target.id, req.query.month, req.query.limit));
}));

/** Member list with this month's spend, so the panel is useful at a glance. */
app.get("/api/admin/users", auth, managerOnly, wrap(async (req, res) => {
  const month = String(req.query.month || "");
  if (!/^\d{4}-\d{2}$/.test(month)) return res.status(400).json({ error: "Invalid month." });
  const start = month + "-01";
  // The superuser sees every account; a provider sees everyone who eats.
  const everyone = req.actor.role === "superuser";
  const { rows } = await sql`
    select u.id, u.email, u.role,
           to_char(u.created_at, 'YYYY-MM-DD') as created_at,
           coalesce((
             select sum(me.amount) from meal_entries me
              where me.user_id = u.id and me.taken
                and me.date >= ${start}::date and me.date < (${start}::date + interval '1 month')
                and not exists (select 1 from day_status ds
                                 where ds.user_id = u.id and ds.date = me.date and ds.no_meal)
           ), 0) as meal_total,
           coalesce((
             select sum(ds.adjustment) from day_status ds
              where ds.user_id = u.id and not ds.no_meal
                and ds.date >= ${start}::date and ds.date < (${start}::date + interval '1 month')
           ), 0) as extra_total,
           coalesce((
             select count(*) from meal_entries me
              where me.user_id = u.id and me.taken
                and me.date >= ${start}::date and me.date < (${start}::date + interval '1 month')
                and not exists (select 1 from day_status ds
                                 where ds.user_id = u.id and ds.date = me.date and ds.no_meal)
           ), 0) as meals_taken,
           (select to_char(max(me.date), 'YYYY-MM-DD') from meal_entries me where me.user_id = u.id) as last_entry
      from users u
     where ${everyone}::boolean or u.role <> 'admin'
     order by u.email`;
  res.json({
    month,
    users: rows.map((r) => ({
      id: r.id,
      email: r.email,
      role: r.role,
      createdAt: r.created_at,
      spent: (Number(r.meal_total) || 0) + (Number(r.extra_total) || 0),
      mealsTaken: Number(r.meals_taken) || 0,
      lastEntry: r.last_entry,
      isSelf: r.id === req.actor.id,
    })),
  });
}));

app.post("/api/admin/users", auth, managerOnly, wrap(async (req, res) => {
  const email = String(req.body?.email || "").trim().toLowerCase();
  const password = String(req.body?.password || "");
  const role = String(req.body?.role || "user");
  if (!["user", "admin"].includes(role)) return res.status(400).json({ error: "Pick a valid role." });
  if (role === "admin" && req.actor.role !== "superuser") {
    return res.status(403).json({ error: "Only the superuser can add managers." });
  }
  if (!email.includes("@") || password.length < 6) {
    return res.status(400).json({ error: "Enter an email and a password of at least 6 characters." });
  }
  const hash = await bcrypt.hash(password, 10);
  try {
    const { rows } = await sql`
      insert into users (email, password_hash, role) values (${email}, ${hash}, ${role})
      returning id, email, role, to_char(created_at, 'YYYY-MM-DD') as created_at`;
    const u = rows[0];
    res.json({ user: { id: u.id, email: u.email, role: u.role, createdAt: u.created_at, spent: 0, mealsTaken: 0 } });
  } catch (e) {
    if (e.code === "23505" || /duplicate key/i.test(e.message || "")) {
      return res.status(409).json({ error: "That email already has an account." });
    }
    throw e;
  }
}));

app.patch("/api/admin/users/:id", auth, managerOnly, superOnly, loadTarget, wrap(async (req, res) => {
  const { target } = req;
  if (target.email === SUPER_EMAIL) return res.status(403).json({ error: "The superuser account can't be changed here." });

  const role = req.body?.role;
  if (role !== undefined) {
    if (!["user", "admin"].includes(String(role))) return res.status(400).json({ error: "Pick a valid role." });
    await sql`update users set role = ${role} where id = ${target.id}`;
    target.role = role;
  }

  const password = req.body?.password;
  if (password !== undefined) {
    if (String(password).length < 6) return res.status(400).json({ error: "Password must be at least 6 characters." });
    const hash = await bcrypt.hash(String(password), 10);
    await sql`update users set password_hash = ${hash} where id = ${target.id}`;
  }

  res.json({ user: { id: target.id, email: target.email, role: target.role } });
}));

app.delete("/api/admin/users/:id", auth, managerOnly, superOnly, loadTarget, wrap(async (req, res) => {
  if (req.target.email === SUPER_EMAIL || req.target.id === req.actor.id) {
    return res.status(403).json({ error: "You can't delete your own account." });
  }
  // meal_entries / day_status / settings / subscriptions all cascade.
  await sql`delete from users where id = ${req.target.id}`;
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

// ---- TEMP: send a test push to the current user's own devices ----
app.post("/api/push/test", auth, wrap(async (req, res) => {
  if (!pushEnabled) return res.status(503).json({ error: "Push isn't configured on the server (missing VAPID keys)." });
  const { rows } = await sql`
    select endpoint, p256dh, auth from push_subscriptions where user_id = ${req.user.id}`;
  if (!rows.length) return res.status(404).json({ error: "No subscription found — turn reminders on first." });

  const payload = JSON.stringify({
    title: "Test notification ✅",
    body: "If you can see this, reminders are working.",
    url: "/",
  });

  let sent = 0, removed = 0;
  const errors = [];
  for (const r of rows) {
    try {
      await webpush.sendNotification({ endpoint: r.endpoint, keys: { p256dh: r.p256dh, auth: r.auth } }, payload);
      sent++;
    } catch (e) {
      if (e.statusCode === 404 || e.statusCode === 410) {
        await sql`delete from push_subscriptions where endpoint = ${r.endpoint}`;
        removed++;
      } else {
        errors.push(`${e.statusCode || "?"}: ${e.body || e.message}`);
      }
    }
  }
  res.json({ ok: true, subscriptions: rows.length, sent, removed, errors });
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

  // Providers serve the food and log no meals of their own — never nudge them.
  const { rows } = await sql`
    select s.endpoint, s.p256dh, s.auth, s.user_id,
      (select count(*) from meal_entries me where me.user_id = s.user_id and me.date = ${dateKey}::date) as marked,
      coalesce((select no_meal from day_status ds where ds.user_id = s.user_id and ds.date = ${dateKey}::date), false) as no_meal
    from push_subscriptions s
    join users u on u.id = s.user_id and u.role <> 'admin'`;

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
  if (err instanceof Bad) return res.status(err.status).json({ error: err.message });
  console.error(err);
  res.status(500).json({ error: "Server error." });
});

export default app;
