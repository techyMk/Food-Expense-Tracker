import { MEALS, MEAL_META } from "../constants";
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
      <button className="btn btn-ghost small" type="button" onClick={onReset}>
        Reset to ₹35 / ₹50 / ₹35
      </button>
    </section>
  );
}
