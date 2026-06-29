import { Sunrise, Sun, Moon, Check, Minus, Download, ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { MEALS, MEAL_META, MONTH_NAMES, DAY_NAMES } from "../constants";
import { dateFromKey, todayKey } from "../dateUtils";

export default function MonthlyReport({ monthKey, days, dayStatus, recordFor, onPrev, onNext, onPickMonth }) {
  const [year, month] = monthKey.split("-").map(Number); // month is 1-12
  const monthIdx = month - 1;
  const today = todayKey();
  const status = dayStatus || {};
  const statusFor = (k) => status[k] || { noMeal: false, adjustment: 0, note: "" };

  // All dates in this month that have meal records or a day status.
  const inMonth = (k) => {
    const d = dateFromKey(k);
    return d.getFullYear() === year && d.getMonth() === monthIdx;
  };
  const keys = [...new Set([...Object.keys(days), ...Object.keys(status)].filter(inMonth))].sort();

  const perMeal = {
    morning: { count: 0, amount: 0 },
    afternoon: { count: 0, amount: 0 },
    night: { count: 0, amount: 0 },
  };
  let totalSpent = 0, totalMeals = 0, daysWithMeals = 0, totalExtra = 0;
  const rows = [];

  for (const k of keys) {
    const st = statusFor(k);
    if (st.noMeal) { rows.push({ key: k, noMeal: true, total: 0 }); continue; }
    const rec = recordFor(k);
    const takenCount = MEALS.filter((m) => rec[m].taken).length;
    const adj = st.adjustment || 0;
    if (!takenCount && !adj) continue;
    if (takenCount) daysWithMeals++;
    totalMeals += takenCount;
    let dayTotal = 0;
    for (const m of MEALS) {
      if (rec[m].taken) {
        perMeal[m].count++;
        perMeal[m].amount += Number(rec[m].amount) || 0;
        dayTotal += Number(rec[m].amount) || 0;
      }
    }
    dayTotal += adj;
    totalExtra += adj;
    totalSpent += dayTotal;
    rows.push({ key: k, rec, total: dayTotal, adjustment: adj, note: st.note });
  }

  const avgPerActiveDay = daysWithMeals ? Math.round(totalSpent / daysWithMeals) : 0;

  function exportCsv() {
    const esc = (v) => `"${String(v).replace(/"/g, '""')}"`;
    const lines = [["Date", "Day", "Morning", "Afternoon", "Night", "Extra", "Note", "Spent"].map(esc).join(",")];
    for (const row of rows) {
      const d = dateFromKey(row.key);
      if (row.noMeal) {
        lines.push([row.key, DAY_NAMES[d.getDay()], "No meal", "", "", "", "", 0].map(esc).join(","));
        continue;
      }
      lines.push([
        row.key,
        DAY_NAMES[d.getDay()],
        row.rec.morning.taken ? row.rec.morning.amount : "",
        row.rec.afternoon.taken ? row.rec.afternoon.amount : "",
        row.rec.night.taken ? row.rec.night.amount : "",
        row.adjustment || "",
        row.note || "",
        row.total,
      ].map(esc).join(","));
    }
    lines.push("");
    lines.push(["Total", "", perMeal.morning.amount, perMeal.afternoon.amount, perMeal.night.amount, totalExtra, "", totalSpent].map(esc).join(","));
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `meal-report-${monthKey}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="report">
      <nav className="day-nav card">
        <button className="btn btn-round" type="button" aria-label="Previous month" onClick={onPrev}><ChevronLeft size={22} /></button>
        <div className="day-nav-center">
          <input type="month" value={monthKey} onChange={(e) => e.target.value && onPickMonth(e.target.value)} />
          <div className="day-label">{MONTH_NAMES[monthIdx]} {year}</div>
        </div>
        <button className="btn btn-round" type="button" aria-label="Next month" onClick={onNext}><ChevronRight size={22} /></button>
      </nav>

      <section className="card report-hero">
        <span className="report-hero-label">Total spent in {MONTH_NAMES[monthIdx]}</span>
        <span className="report-hero-amount">₹{totalSpent}</span>
        <div className="stats">
          <div className="stat">
            <span className="stat-num">{totalMeals}</span>
            <span className="stat-label">Meals taken</span>
          </div>
          <div className="stat">
            <span className="stat-num">{daysWithMeals}</span>
            <span className="stat-label">Days with meals</span>
          </div>
          <div className="stat">
            <span className="stat-num">₹{avgPerActiveDay}</span>
            <span className="stat-label">Avg / active day</span>
          </div>
        </div>
      </section>

      <section className="card">
        <h2>By meal</h2>
        <div className="breakdown">
          {MEALS.map((m) => {
            const Icon = MEAL_META[m].Icon;
            return (
              <div className="breakdown-item" key={m}>
                <span className="breakdown-icon"><Icon size={20} /></span>
                <span className="breakdown-name">{MEAL_META[m].label}</span>
                <span className="breakdown-count">{perMeal[m].count}× taken</span>
                <span className="breakdown-amount">₹{perMeal[m].amount}</span>
              </div>
            );
          })}
          {totalExtra !== 0 && (
            <div className="breakdown-item">
              <span className="breakdown-icon"><Plus size={20} /></span>
              <span className="breakdown-name">Special / extra</span>
              <span className="breakdown-count">added to bills</span>
              <span className="breakdown-amount">₹{totalExtra}</span>
            </div>
          )}
        </div>
      </section>

      <section className="card">
        <div className="report-table-head">
          <h2>Daily breakdown</h2>
          {rows.length > 0 && (
            <button className="btn btn-ghost small" type="button" onClick={exportCsv}><Download size={15} /> CSV</button>
          )}
        </div>
        <div className="table-wrap">
          {rows.length === 0 ? (
            <p className="muted center">No meals recorded in {MONTH_NAMES[monthIdx]} {year}.</p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Day</th>
                  <th className="c"><Sunrise size={16} /></th>
                  <th className="c"><Sun size={16} /></th>
                  <th className="c"><Moon size={16} /></th>
                  <th className="r">Spent</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const d = dateFromKey(row.key);
                  return (
                    <tr key={row.key} className={row.key === today ? "is-today" : ""}>
                      <td>
                        {d.getDate()} {MONTH_NAMES[monthIdx].slice(0, 3)}
                        {row.adjustment ? <span className="extra-tag" title={row.note || "Special charge"}>+₹{row.adjustment}</span> : null}
                      </td>
                      <td>{DAY_NAMES[d.getDay()].slice(0, 3)}</td>
                      {row.noMeal ? (
                        <td className="c no-meal-row" colSpan={3}>No meal</td>
                      ) : (
                        <>
                          <td className="c">{row.rec.morning.taken ? <Check className="tick" size={17} strokeWidth={2.6} /> : <Minus className="cross" size={15} />}</td>
                          <td className="c">{row.rec.afternoon.taken ? <Check className="tick" size={17} strokeWidth={2.6} /> : <Minus className="cross" size={15} />}</td>
                          <td className="c">{row.rec.night.taken ? <Check className="tick" size={17} strokeWidth={2.6} /> : <Minus className="cross" size={15} />}</td>
                        </>
                      )}
                      <td className="r spent">₹{row.total}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </section>
    </div>
  );
}
