import { useState, useRef, useEffect } from "react";
import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { dateFromKey, keyFromDate, todayKey } from "../dateUtils";
import { DAY_NAMES, MONTH_NAMES } from "../constants";

const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];

export default function DatePicker({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState(() => {
    const d = dateFromKey(value);
    return { y: d.getFullYear(), m: d.getMonth() };
  });
  const ref = useRef(null);

  // Keep the calendar's month aligned with the selected date when it changes.
  useEffect(() => {
    const d = dateFromKey(value);
    setView({ y: d.getFullYear(), m: d.getMonth() });
  }, [value]);

  // Close on outside click / Escape.
  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const sel = dateFromKey(value);
  const today = todayKey();
  const { y, m } = view;
  const startPad = new Date(y, m, 1).getDay();
  const daysInMonth = new Date(y, m + 1, 0).getDate();

  const cells = [];
  for (let i = 0; i < startPad; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  const triggerLabel =
    `${DAY_NAMES[sel.getDay()].slice(0, 3)}, ${sel.getDate()} ${MONTH_NAMES[sel.getMonth()].slice(0, 3)} ${sel.getFullYear()}`;

  function toggle() {
    setOpen((o) => {
      const next = !o;
      if (next) {
        const d = dateFromKey(value);
        setView({ y: d.getFullYear(), m: d.getMonth() });
      }
      return next;
    });
  }
  function pick(d) {
    onChange(keyFromDate(new Date(y, m, d)));
    setOpen(false);
  }
  function shiftMonth(delta) {
    const nd = new Date(y, m + delta, 1);
    setView({ y: nd.getFullYear(), m: nd.getMonth() });
  }

  return (
    <div className="datepicker" ref={ref}>
      <button type="button" className="dp-trigger" onClick={toggle}>
        <CalendarDays className="dp-cal" size={18} />
        <span className="dp-trigger-label">{triggerLabel}</span>
        <ChevronDown className={"dp-chevron" + (open ? " up" : "")} size={16} />
      </button>

      {open && (
        <div className="dp-pop" role="dialog" aria-label="Choose date">
          <div className="dp-head">
            <button type="button" className="dp-nav" onClick={() => shiftMonth(-1)} aria-label="Previous month"><ChevronLeft size={18} /></button>
            <span className="dp-title">{MONTH_NAMES[m]} {y}</span>
            <button type="button" className="dp-nav" onClick={() => shiftMonth(1)} aria-label="Next month"><ChevronRight size={18} /></button>
          </div>

          <div className="dp-grid dp-weekdays">
            {WEEKDAYS.map((w, i) => (
              <span key={i} className={"dp-wd" + (i === 0 ? " sun" : "")}>{w}</span>
            ))}
          </div>

          <div className="dp-grid">
            {cells.map((d, i) => {
              if (d === null) return <span key={i} className="dp-cell dp-empty" />;
              const key = keyFromDate(new Date(y, m, d));
              const isSel = key === value;
              const isToday = key === today;
              const isSun = new Date(y, m, d).getDay() === 0;
              return (
                <button
                  key={i}
                  type="button"
                  className={
                    "dp-cell" +
                    (isSel ? " dp-selected" : "") +
                    (isToday && !isSel ? " dp-today" : "") +
                    (isSun && !isSel ? " dp-sun" : "")
                  }
                  onClick={() => pick(d)}
                >
                  {d}
                </button>
              );
            })}
          </div>

          <div className="dp-foot">
            <button type="button" className="dp-today-btn" onClick={() => { onChange(today); setOpen(false); }}>
              Today
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
