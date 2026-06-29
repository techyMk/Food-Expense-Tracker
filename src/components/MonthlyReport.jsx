import { MEALS, MEAL_META, MONTH_NAMES, DAY_NAMES } from "../constants";
import { dateFromKey, todayKey } from "../dateUtils";

export default function MonthlyReport({ monthKey, days, recordFor, onPrev, onNext, onPickMonth }) {
  const [year, month] = monthKey.split("-").map(Number); // month is 1-12
  const monthIdx = month - 1;
  const today = todayKey();

  // Collect days in this month that have at least one meal taken.
  const keys = Object.keys(days)
    .filter((k) => {
      const d = dateFromKey(k);
      return d.getFullYear() === year && d.getMonth() === monthIdx;
    })
    .sort();

  const perMeal = {
    morning: { count: 0, amount: 0 },
    afternoon: { count: 0, amount: 0 },
    night: { count: 0, amount: 0 },
  };
  let totalSpent = 0, totalMeals = 0, daysWithMeals = 0;
  const rows = [];

  for (const k of keys) {
    const rec = recordFor(k);
    const takenCount = MEALS.filter((m) => rec[m].taken).length;
    if (!takenCount) continue;
    daysWithMeals++;
    totalMeals += takenCount;
    let dayTotal = 0;
    for (const m of MEALS) {
      if (rec[m].taken) {
        perMeal[m].count++;
        perMeal[m].amount += Number(rec[m].amount) || 0;
        dayTotal += Number(rec[m].amount) || 0;
      }
    }
    totalSpent += dayTotal;
    rows.push({ key: k, rec, total: dayTotal });
  }

  const avgPerActiveDay = daysWithMeals ? Math.round(totalSpent / daysWithMeals) : 0;

  function exportCsv() {
    const esc = (v) => `"${String(v).replace(/"/g, '""')}"`;
    const lines = [["Date", "Day", "Morning", "Afternoon", "Night", "Spent"].map(esc).join(",")];
    for (const { key, rec, total } of rows) {
      const d = dateFromKey(key);
      lines.push([
        key,
        DAY_NAMES[d.getDay()],
        rec.morning.taken ? rec.morning.amount : "",
        rec.afternoon.taken ? rec.afternoon.amount : "",
        rec.night.taken ? rec.night.amount : "",
        total,
      ].map(esc).join(","));
    }
    lines.push("");
    lines.push(["Total", "", perMeal.morning.amount, perMeal.afternoon.amount, perMeal.night.amount, totalSpent].map(esc).join(","));
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
        <button className="btn btn-round" type="button" aria-label="Previous month" onClick={onPrev}>‹</button>
        <div className="day-nav-center">
          <input type="month" value={monthKey} onChange={(e) => e.target.value && onPickMonth(e.target.value)} />
          <div className="day-label">{MONTH_NAMES[monthIdx]} {year}</div>
        </div>
        <button className="btn btn-round" type="button" aria-label="Next month" onClick={onNext}>›</button>
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
          {MEALS.map((m) => (
            <div className="breakdown-item" key={m}>
              <span className="breakdown-icon">{MEAL_META[m].icon}</span>
              <span className="breakdown-name">{MEAL_META[m].label}</span>
              <span className="breakdown-count">{perMeal[m].count}× taken</span>
              <span className="breakdown-amount">₹{perMeal[m].amount}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="card">
        <div className="report-table-head">
          <h2>Daily breakdown</h2>
          {rows.length > 0 && (
            <button className="btn btn-ghost small" type="button" onClick={exportCsv}>⤓ CSV</button>
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
                  <th className="c">🌅</th>
                  <th className="c">☀️</th>
                  <th className="c">🌙</th>
                  <th className="r">Spent</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ key, rec, total }) => {
                  const d = dateFromKey(key);
                  return (
                    <tr key={key} className={key === today ? "is-today" : ""}>
                      <td>{d.getDate()} {MONTH_NAMES[monthIdx].slice(0, 3)}</td>
                      <td>{DAY_NAMES[d.getDay()].slice(0, 3)}</td>
                      <td className="c">{rec.morning.taken ? <span className="tick">✓</span> : <span className="cross">·</span>}</td>
                      <td className="c">{rec.afternoon.taken ? <span className="tick">✓</span> : <span className="cross">·</span>}</td>
                      <td className="c">{rec.night.taken ? <span className="tick">✓</span> : <span className="cross">·</span>}</td>
                      <td className="r spent">₹{total}</td>
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
