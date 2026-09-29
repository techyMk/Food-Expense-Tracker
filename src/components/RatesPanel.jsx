import { MEALS, MEAL_META, FACTORY_RATES, LEGACY_RATES } from "../constants";
import NumberField from "./NumberField";

function RateColumn({ title, kind, rates, onUpdate }) {
  const total = MEALS.reduce((s, m) => s + (Number(rates[m]) || 0), 0);
  return (
    <div className="rates-col">
      <h3>{title}</h3>
      {MEALS.map((m) => (
        <label key={m}>
          {MEAL_META[m].label}
          <NumberField value={rates[m]} onCommit={(v) => onUpdate(kind, m, v)} />
        </label>
      ))}
      <div className="rates-total">Total: ₹{total}</div>
    </div>
  );
}

export default function RatesPanel({ rates, onUpdate, onReset }) {
  return (
    <section className="card settings" aria-label="Default rates">
      <h2>Default rates</h2>
      <p className="muted">These pre-fill new days. You can still change any single day below.</p>
      <div className="rates-grid">
        <RateColumn title="Mon – Sat" kind="weekday" rates={rates.weekday} onUpdate={onUpdate} />
        <RateColumn title="Sunday" kind="sunday" rates={rates.sunday} onUpdate={onUpdate} />
      </div>
      <p className="muted">
        Applies from 1 September 2026. Earlier days pre-fill at the old
        ₹{LEGACY_RATES.weekday.morning} / ₹{LEGACY_RATES.weekday.afternoon} / ₹{LEGACY_RATES.weekday.night} rates,
        and days already logged keep the amount they were saved with.
      </p>
      <button className="btn btn-ghost small" type="button" onClick={onReset}>
        Reset to ₹{FACTORY_RATES.weekday.morning} / ₹{FACTORY_RATES.weekday.afternoon} / ₹{FACTORY_RATES.weekday.night}
      </button>
    </section>
  );
}
