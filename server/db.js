import "dotenv/config";
import { neon } from "@neondatabase/serverless";

// Pooled Neon URL works great with the HTTP driver (one fetch per query — ideal
// for serverless, and no idle TCP connections to crash on).
const url = process.env.NEON_DATABASE_URL || "";
const isPlaceholder = (u) => !u || u.includes("USER:PASSWORD") || u.includes("ep-xxxx");

export const isConfigured = !isPlaceholder(url);

// The one account that can never be locked out: it owns roles and members.
export const SUPER_EMAIL = (process.env.SUPERUSER_EMAIL || "mani18012003@gmail.com")
  .trim()
  .toLowerCase();

// Tagged-template query fn. With fullResults, `await sql\`...\`` returns { rows, rowCount, ... }.
export const sql = isConfigured ? neon(url, { fullResults: true }) : null;

export async function initSchema() {
  if (!sql) return;
  await sql`create table if not exists users (
    id            uuid primary key default gen_random_uuid(),
    email         text unique not null,
    password_hash text,
    google_sub    text,
    created_at    timestamptz not null default now()
  )`;
  await sql`alter table users alter column password_hash drop not null`;
  await sql`alter table users add column if not exists google_sub text`;
  // 'user' = own meals only · 'admin' = read/write every normal member · 'superuser' = also manages members.
  await sql`alter table users add column if not exists role text not null default 'user'`;
  if (SUPER_EMAIL) {
    await sql`update users set role = 'superuser' where email = ${SUPER_EMAIL} and role <> 'superuser'`;
  }
  await sql`create table if not exists user_settings (
    user_id    uuid primary key references users(id) on delete cascade,
    rates      jsonb not null,
    updated_at timestamptz not null default now()
  )`;
  await sql`create table if not exists meal_entries (
    user_id    uuid not null references users(id) on delete cascade,
    date       date not null,
    meal       text not null check (meal in ('morning','afternoon','night')),
    taken      boolean not null default false,
    amount     integer not null default 0,
    updated_at timestamptz not null default now(),
    primary key (user_id, date, meal)
  )`;
  await sql`create table if not exists push_subscriptions (
    endpoint   text primary key,
    user_id    uuid not null references users(id) on delete cascade,
    p256dh     text not null,
    auth       text not null,
    created_at timestamptz not null default now()
  )`;
  await sql`create table if not exists day_status (
    user_id    uuid not null references users(id) on delete cascade,
    date       date not null,
    no_meal    boolean not null default false,
    adjustment integer not null default 0,
    note       text,
    updated_at timestamptz not null default now(),
    primary key (user_id, date)
  )`;
  await sql`alter table day_status add column if not exists adjustment integer not null default 0`;
  await sql`alter table day_status add column if not exists note text`;

  // ---- Audit trail ----
  // Who last touched each row (rows written before this existed stay null)…
  await sql`alter table meal_entries add column if not exists updated_by uuid references users(id) on delete set null`;
  await sql`alter table day_status add column if not exists updated_by uuid references users(id) on delete set null`;
  // …and the full history behind it. actor_email is denormalised so the trail
  // still reads correctly after an account is removed.
  await sql`create table if not exists entry_audit (
    id          bigserial primary key,
    user_id     uuid not null references users(id) on delete cascade,
    actor_id    uuid references users(id) on delete set null,
    actor_email text not null,
    date        date not null,
    kind        text not null check (kind in ('meal','day')),
    meal        text,
    before      jsonb,
    after       jsonb not null,
    at          timestamptz not null default now()
  )`;
  await sql`create index if not exists entry_audit_user_at_idx on entry_audit (user_id, at desc)`;
  await sql`create index if not exists entry_audit_user_date_idx on entry_audit (user_id, date)`;
}
