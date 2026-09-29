/**
 * One-off: the meal rates rose by ₹10 on 1 September 2026.
 *
 *   weekday  35 / 50 / 35  →  45 / 60 / 45
 *   Sunday   35 / 80 / 35  →  45 / 90 / 45
 *
 * Re-prices entries already logged in September 2026 and moves every saved
 * default rate to the new numbers. Only amounts sitting at an old standard
 * rate are touched — hand-typed one-offs are left exactly as they are, and
 * nothing before September is read or written.
 *
 * Each re-priced entry gets an entry_audit row so the change shows up in the
 * Change history rather than appearing out of nowhere.
 *
 *   node scripts/raise-rates-sep-2026.mjs          # dry run, prints the plan
 *   node scripts/raise-rates-sep-2026.mjs --apply  # writes it
 */
import "dotenv/config";
import { sql, initSchema } from "../server/db.js";

const APPLY = process.argv.includes("--apply");
const FROM = "2026-09-01";
const TO = "2026-10-01";
const ACTOR = "system · rate revision 1 Sep 2026";

// Matched on the amount alone, not on the day type: a Sunday lunch logged at
// the weekday ₹50 is still a standard rate and still goes up by ₹10.
const MAP = {
  morning: [{ from: 35, to: 45 }],
  night: [{ from: 35, to: 45 }],
  afternoon: [{ from: 50, to: 60 }, { from: 80, to: 90 }],
};

await initSchema();

const { rows: before } = await sql`
  select u.email, me.meal, me.amount, me.taken,
         to_char(me.date, 'YYYY-MM-DD') as date,
         extract(dow from me.date)::int as dow
    from meal_entries me join users u on u.id = me.user_id
   where me.date >= ${FROM}::date and me.date < ${TO}::date
   order by u.email, me.date, me.meal`;

const plan = [];
const skipped = [];
for (const row of before) {
  const isSunday = row.dow === 0;
  const rule = (MAP[row.meal] || []).find((r) => r.from === row.amount);
  if (rule) plan.push({ ...row, isSunday, next: rule.to });
  else skipped.push(row);
}

console.log(`September 2026 entries: ${before.length}`);
console.log(`  re-pricing: ${plan.length}`);
console.log(`  left alone: ${skipped.length}`);
if (skipped.length) {
  console.log("\nLeft alone (not at an old standard rate):");
  for (const s of skipped) console.log(`  ${s.date} ${s.meal.padEnd(9)} ₹${s.amount} ${s.taken ? "taken" : "not taken"} — ${s.email}`);
}

const byChange = {};
for (const p of plan) {
  const k = `${p.meal} ₹${p.amount} → ₹${p.next}${p.isSunday ? " (Sunday)" : ""}`;
  byChange[k] = (byChange[k] || 0) + 1;
}
console.log("\nRe-pricing:");
for (const [k, n] of Object.entries(byChange)) console.log(`  ${n.toString().padStart(3)} × ${k}`);

const spend = (rows) => rows.filter((r) => r.taken).reduce((s, r) => s + r.amount, 0);
const after = plan.map((p) => ({ ...p, amount: p.next }));
const untouchedTaken = skipped.filter((r) => r.taken).reduce((s, r) => s + r.amount, 0);
console.log(`\nSeptember spend (taken only): ₹${spend(before)} → ₹${spend(after) + untouchedTaken}`);

if (!APPLY) {
  console.log("\nDry run — nothing written. Re-run with --apply.");
  process.exit(0);
}

let repriced = 0;
for (const p of plan) {
  const { rowCount } = await sql`
    update meal_entries set amount = ${p.next}
     where user_id = (select id from users where email = ${p.email})
       and date = ${p.date}::date and meal = ${p.meal} and amount = ${p.amount}`;
  if (!rowCount) continue;
  repriced++;
  await sql`
    insert into entry_audit (user_id, actor_id, actor_email, date, kind, meal, before, after)
    values ((select id from users where email = ${p.email}), null, ${ACTOR}, ${p.date}::date, 'meal', ${p.meal},
            jsonb_build_object('taken', ${p.taken}::boolean, 'amount', ${p.amount}::int),
            jsonb_build_object('taken', ${p.taken}::boolean, 'amount', ${p.next}::int))`;
}

const NEW_RATES = {
  weekday: { morning: 45, afternoon: 60, night: 45 },
  sunday: { morning: 45, afternoon: 90, night: 45 },
};
const { rowCount: ratesUpdated } = await sql`
  update user_settings set rates = ${JSON.stringify(NEW_RATES)}::jsonb, updated_at = now()`;

console.log(`\nApplied: ${repriced} entries re-priced, ${ratesUpdated} saved rate sets updated.`);

const { rows: check } = await sql`
  select meal, amount, taken, count(*)::int as n
    from meal_entries
   where date >= ${FROM}::date and date < ${TO}::date
   group by 1,2,3 order by 1,2`;
console.table(check);
