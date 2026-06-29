import { useState, useEffect } from "react";
import { Plus } from "lucide-react";
import NumberField from "./NumberField";

/** Optional per-day special / extra charge (e.g. a special meal billed later). */
export default function DayExtra({ amount, note, onChange }) {
  const [open, setOpen] = useState(amount > 0 || !!note);
  const [noteText, setNoteText] = useState(note || "");

  useEffect(() => {
    setNoteText(note || "");
    setOpen(amount > 0 || !!note);
  }, [amount, note]);

  if (!open) {
    return (
      <button type="button" className="add-extra" onClick={() => setOpen(true)}>
        <Plus size={15} /> Add special / extra charge
      </button>
    );
  }

  return (
    <div className="extra">
      <div className="extra-row">
        <span className="extra-label">Special / extra charge</span>
        <div className="meal-amount">
          <span className="rupee">₹</span>
          <NumberField value={amount} onCommit={(v) => onChange({ adjustment: v })} />
        </div>
      </div>
      <input
        className="extra-note"
        placeholder="Note — e.g. special lunch on the bill"
        value={noteText}
        onChange={(e) => setNoteText(e.target.value)}
        onBlur={() => { if (noteText !== (note || "")) onChange({ note: noteText }); }}
      />
    </div>
  );
}
