import "dotenv/config";
import { neon } from "@neondatabase/serverless";

// Pooled Neon URL works great with the HTTP driver (one fetch per query — ideal
// for serverless, and no idle TCP connections to crash on).
const url = process.env.NEON_DATABASE_URL || "";
const isPlaceholder = (u) => !u || u.includes("USER:PASSWORD") || u.includes("ep-xxxx");

export const isConfigured = !isPlaceholder(url);

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
}
