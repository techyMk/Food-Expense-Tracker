import { useCallback, useEffect, useState } from "react";
import { History, RefreshCw, Check, Minus, Ban, Plus, StickyNote } from "lucide-react";
import { MEAL_META, MONTH_NAMES, DAY_NAMES } from "../constants";
import { dateFromKey, formatStamp, actorLabel } from "../dateUtils";

const dayLabel = (key) => {
  const d = dateFromKey(key);
  return `${DAY_NAMES[d.getDay()].slice(0, 3)} ${d.getDate()} ${MONTH_NAMES[d.getMonth()].slice(0, 3)}`;
};

/** Turns one audit row into an icon plus a sentence. */
function describe(ev) {
  const after = ev.after || {};
  const isNew = !ev.before; // first time this meal/day was ever written
  const before = ev.before || {};

  if (ev.kind === "meal") {
    const name = MEAL_META[ev.meal]?.label || ev.meal;
    if (isNew) {
      return after.taken
        ? { Icon: Check, tone: "on", text: `${name} marked taken · ₹${after.amount}` }
        : { Icon: Plus, tone: "", text: `${name} set to ₹${after.amount}` };
    }
    if (before.taken !== after.taken) {
      return after.taken
        ? { Icon: Check, tone: "on", text: `${name} marked taken · ₹${after.amount}` }
        : { Icon: Minus, tone: "off", text: `${name} unmarked` };
    }
    if (before.amount !== after.amount) {
      return { Icon: Plus, tone: "", text: `${name} amount changed ₹${before.amount} → ₹${after.amount}` };
    }
    return { Icon: Check, tone: "", text: `${name} updated` };
  }

  // Day-level: no-meal flag, special charge, or its note.
  if (isNew) {
    if (after.noMeal) return { Icon: Ban, tone: "off", text: "Marked as a no-meal day" };
    if (after.adjustment) return { Icon: Plus, tone: "", text: `Special charge of ₹${after.adjustment} added` };
    if (after.note) return { Icon: StickyNote, tone: "", text: `Note set — "${after.note}"` };
    return { Icon: Check, tone: "", text: "Day updated" };
  }
  if (before.noMeal !== after.noMeal) {
    return after.noMeal
      ? { Icon: Ban, tone: "off", text: "Marked as a no-meal day" }
      : { Icon: Check, tone: "on", text: "No-meal day undone" };
  }
  if ((before.adjustment || 0) !== (after.adjustment || 0)) {
    const from = before.adjustment || 0;
    return {
      Icon: Plus,
      tone: "",
      text: from
        ? `Special charge changed ₹${from} → ₹${after.adjustment}`
        : `Special charge of ₹${after.adjustment} added`,
    };
  }
  if ((before.note || "") !== (after.note || "")) {
    return {
      Icon: StickyNote,
      tone: "",
      text: after.note ? `Note set — "${after.note}"` : "Note cleared",
    };
  }
  return { Icon: Check, tone: "", text: "Day updated" };
}

/**
 * The change history for one person's month: what changed, who changed it, when.
 * `refreshKey` bumps whenever the board saves, so the log stays current.
 */
export default function ActivityLog({ dataApi, month, viewerEmail, refreshKey = 0 }) {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [expanded, setExpanded] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { events } = await dataApi.getActivity(month);
      setEvents(events || []);
      setError(null);
    } catch (err) {
      setError(err.message || "Couldn't load the history.");
    } finally {
      setLoading(false);
    }
  }, [dataApi, month]);

  // Debounced: marking all three meals fires three saves in a row.
  useEffect(() => {
    const t = setTimeout(load, refreshKey ? 700 : 0);
    return () => clearTimeout(t);
  }, [load, refreshKey]);

  const shown = expanded ? events : events.slice(0, 8);

  return (
    <section className="card activity" aria-label="Change history">
      <div className="report-table-head">
        <h2><History size={16} /> Change history</h2>
        <button className="btn btn-ghost small" type="button" onClick={load} aria-label="Refresh history">
          <RefreshCw size={15} />
        </button>
      </div>

      {loading && events.length === 0 ? (
        <p className="muted center">Loading history…</p>
      ) : error ? (
        <p className="muted center">{error}</p>
      ) : events.length === 0 ? (
        <p className="muted center">No changes recorded this month.</p>
      ) : (
        <>
          <ul className="activity-list">
            {shown.map((ev) => {
              const { Icon, tone, text } = describe(ev);
              return (
                <li className="activity-item" key={ev.id}>
                  <span className={"activity-icon " + tone}><Icon size={14} strokeWidth={2.6} /></span>
                  <span className="activity-text">
                    <span className="activity-what">{text}</span>
                    <span className="activity-meta">
                      {dayLabel(ev.date)} · by {actorLabel(ev.actor, viewerEmail)} · {formatStamp(ev.at)}
                    </span>
                  </span>
                </li>
              );
            })}
          </ul>
          {events.length > 8 && (
            <button className="linkish" type="button" onClick={() => setExpanded((e) => !e)}>
              {expanded ? "Show less" : `Show all ${events.length} changes`}
            </button>
          )}
        </>
      )}
    </section>
  );
}
