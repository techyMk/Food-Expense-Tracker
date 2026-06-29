import { Sunrise, Sun, Moon, Check, Minus } from "lucide-react";
import { MONTH_NAMES, DAY_NAMES } from "../constants";
import { dateFromKey, todayKey } from "../dateUtils";

function Cell({ taken }) {
  return (
    <td className="c">
      {taken
        ? <Check className="tick" size={17} strokeWidth={2.6} />
        : <Minus className="cross" size={15} />}
    </td>
  );
}

export default function MonthSummary({ title, totalSpent, totalMeals, daysWithMeals, rows, onSelect }) {
  const today = todayKey();
  return (
    <section className="card summary" aria-label="Monthly summary">
      <div className="summary-head">
        <h2>{title}</h2>
      </div>
      <div className="stats">
        <div className="stat">
          <span className="stat-num">₹{totalSpent}</span>
          <span className="stat-label">Total spent</span>
        </div>
        <div className="stat">
          <span className="stat-num">{totalMeals}</span>
          <span className="stat-label">Meals taken</span>
        </div>
        <div className="stat">
          <span className="stat-num">{daysWithMeals}</span>
          <span className="stat-label">Days with meals</span>
        </div>
      </div>

      <div className="table-wrap">
        {rows.length === 0 ? (
          <p className="muted center">No meals recorded this month yet.</p>
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
              {rows.map(({ key, rec, total }) => {
                const dd = dateFromKey(key);
                return (
                  <tr
                    key={key}
                    className={key === today ? "is-today" : ""}
                    style={{ cursor: "pointer" }}
                    onClick={() => onSelect(key)}
                  >
                    <td>{dd.getDate()} {MONTH_NAMES[dd.getMonth()].slice(0, 3)}</td>
                    <td>{DAY_NAMES[dd.getDay()].slice(0, 3)}</td>
                    <Cell taken={rec.morning.taken} />
                    <Cell taken={rec.afternoon.taken} />
                    <Cell taken={rec.night.taken} />
                    <td className="r spent">₹{total}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}
