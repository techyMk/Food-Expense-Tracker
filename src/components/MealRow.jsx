import NumberField from "./NumberField";

export default function MealRow({ meta, value, onChange }) {
  return (
    <div className={"meal " + (value.taken ? "is-taken" : "not-taken")}>
      <div className="meal-icon">{meta.icon}</div>
      <div className="meal-info">
        <div className="meal-name">{meta.label}</div>
        <div className="meal-sub">{meta.sub}</div>
      </div>
      <div className="meal-amount">
        <span className="rupee">₹</span>
        <NumberField value={value.amount} onCommit={(v) => onChange({ amount: v })} />
      </div>
      <label className="toggle">
        <input
          type="checkbox"
          checked={value.taken}
          onChange={(e) => onChange({ taken: e.target.checked })}
        />
        <span className="slider"></span>
      </label>
    </div>
  );
}
