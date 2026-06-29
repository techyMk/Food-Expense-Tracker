import { useState, useEffect } from "react";
import { clampInt } from "../dateUtils";

/** Numeric input that lets you type freely and commits a clamped integer on blur / Enter. */
export default function NumberField({ value, onCommit, className }) {
  const [text, setText] = useState(String(value));

  useEffect(() => { setText(String(value)); }, [value]);

  const commit = () => {
    const v = clampInt(text);
    setText(String(v));
    if (v !== value) onCommit(v);
  };

  return (
    <input
      type="number"
      inputMode="numeric"
      min="0"
      step="1"
      className={className}
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
    />
  );
}
