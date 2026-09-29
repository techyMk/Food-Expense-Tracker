import { Check, Minus } from "lucide-react";
import NumberField from "./NumberField";
import { formatStamp, shortActor } from "../dateUtils";

export default function MealRow({ meta, value, onChange, showAudit = false, viewerEmail = null }) {
  const { Icon } = meta;
  const stamped = showAudit && value.updatedAt;
  const who = shortActor(value.updatedBy, viewerEmail);

  return (
    <div className={"meal " + (value.taken ? "is-taken" : "not-taken")}>
      <div className="meal-icon"><Icon size={22} strokeWidth={2.2} /></div>
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
      {/* Its own full-width row — the info column is far too narrow on a phone. */}
      {stamped && (
        <div className={"meal-audit" + (value.taken ? " on" : "")}>
          {value.taken ? <Check size={12} strokeWidth={3} /> : <Minus size={12} strokeWidth={3} />}
          <span>
            {value.taken ? "marked" : "cleared"}
            {who ? ` by ${who}` : ""} · {formatStamp(value.updatedAt)}
          </span>
        </div>
      )}
    </div>
  );
}
