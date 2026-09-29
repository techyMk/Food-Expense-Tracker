import { useState } from "react";
import { Check, X, Ban } from "lucide-react";
import { MEALS, MEAL_META, DAY_NAMES, MONTH_NAMES } from "../constants";
import { todayKey, dateFromKey, keyFromDate, monthTag, isSunday } from "../dateUtils";
import DayNav from "./DayNav";
import MealRow from "./MealRow";
import RatesPanel from "./RatesPanel";
import MonthSummary from "./MonthSummary";
import MonthlyReport from "./MonthlyReport";
import DayExtra from "./DayExtra";

/**
 * The day editor + monthly report for one person. Driven entirely by a
 * `useMealData` result, so it works the same for your own meals and — in the
 * admin panel — for another member's.
 */
export default function MealBoard({ data, showRates = false }) {
  const {
    rates, days, dayStatus, recordFor, statusFor,
    ensureMonthLoaded, setMeal, updateDayStatus, updateRate, resetRates,
  } = data;

  const [selectedDate, setSelectedDate] = useState(todayKey());
  const [view, setView] = useState("daily"); // "daily" | "report"
  const [reportMonth, setReportMonth] = useState(() => monthTag(todayKey()));

  // ---- Navigation ----
  async function goToDate(key) {
    setSelectedDate(key);
    await ensureMonthLoaded(key);
  }
  function shiftDay(delta) {
    const d = dateFromKey(selectedDate);
    d.setDate(d.getDate() + delta);
    goToDate(keyFromDate(d));
  }
  async function goToReportMonth(tag) {
    setReportMonth(tag);
    await ensureMonthLoaded(tag + "-01");
  }
  function shiftReportMonth(delta) {
    const [y, m] = reportMonth.split("-").map(Number);
    goToReportMonth(monthTag(keyFromDate(new Date(y, m - 1 + delta, 1))));
  }
  async function openReport() {
    setView("report");
    await ensureMonthLoaded(reportMonth + "-01");
  }

  function setAllTaken(taken) {
    const rec = recordFor(selectedDate);
    for (const m of MEALS) setMeal(selectedDate, m, { taken, amount: rec[m].amount });
  }

  // ---- Derived values ----
  const dayTotal = (rec) => MEALS.reduce((s, m) => s + (rec[m].taken ? Number(rec[m].amount) || 0 : 0), 0);

  const selectedRec = recordFor(selectedDate);
  const selD = dateFromKey(selectedDate);
  let dayLabel = `${DAY_NAMES[selD.getDay()]}, ${selD.getDate()} ${MONTH_NAMES[selD.getMonth()]} ${selD.getFullYear()}`;
  if (selectedDate === todayKey()) dayLabel = "Today · " + dayLabel;
  if (isSunday(selectedDate)) dayLabel += "  (Sunday rate)";
  const selStatus = statusFor(selectedDate);
  const isNoMeal = selStatus.noMeal;
  const adjustment = selStatus.adjustment || 0;
  const selDayTotal = isNoMeal ? 0 : dayTotal(selectedRec) + adjustment;
  const allTaken = MEALS.every((m) => selectedRec[m].taken);

  // Month summary rows
  const year = selD.getFullYear(), month = selD.getMonth();
  const inMonth = (k) => { const dd = dateFromKey(k); return dd.getFullYear() === year && dd.getMonth() === month; };
  let totalSpent = 0, totalMeals = 0, daysWithMeals = 0;
  const rows = [];
  [...new Set([...Object.keys(days), ...Object.keys(dayStatus)].filter(inMonth))].sort().forEach((k) => {
    const st = statusFor(k);
    if (st.noMeal) { rows.push({ key: k, noMeal: true, total: 0 }); return; }
    const rec = recordFor(k);
    const takenCount = MEALS.filter((m) => rec[m].taken).length;
    const adj = st.adjustment || 0;
    if (!takenCount && !adj) return;
    const total = dayTotal(rec) + adj;
    if (takenCount) daysWithMeals++;
    totalMeals += takenCount; totalSpent += total;
    rows.push({ key: k, rec, total, adjustment: adj });
  });

  return (
    <>
      <div className="tabs">
        <button
          className={"tab" + (view === "daily" ? " active" : "")}
          type="button"
          onClick={() => setView("daily")}
        >
          Daily
        </button>
        <button
          className={"tab" + (view === "report" ? " active" : "")}
          type="button"
          onClick={openReport}
        >
          Monthly report
        </button>
      </div>

      {showRates && <RatesPanel rates={rates} onUpdate={updateRate} onReset={resetRates} />}

      {view === "daily" ? (
        <>
          <DayNav
            selectedDate={selectedDate}
            label={dayLabel}
            onShift={shiftDay}
            onPick={goToDate}
            onToday={() => goToDate(todayKey())}
          />

          <section className="card meals" aria-label="Meals for the day">
            <div className="meals-toolbar">
              <button
                className={"chip" + (isNoMeal ? " chip-on" : "")}
                type="button"
                onClick={() => updateDayStatus(selectedDate, { noMeal: !isNoMeal })}
              >
                <Ban size={15} /> No meals today
              </button>
              {!isNoMeal && (
                <button
                  className={"btn small" + (allTaken ? " btn-ghost" : " btn-primary-soft")}
                  type="button"
                  onClick={() => setAllTaken(!allTaken)}
                >
                  {allTaken ? <><X size={15} /> Clear all</> : <><Check size={15} /> Mark all 3 taken</>}
                </button>
              )}
            </div>

            {isNoMeal ? (
              <div className="no-meal-state">
                <span className="no-meal-icon"><Ban size={26} /></span>
                <div>
                  <div className="no-meal-title">No meals provided today</div>
                  <div className="no-meal-sub">Nothing to log · ₹0 · no reminder tonight</div>
                </div>
              </div>
            ) : (
              <>
                {MEALS.map((m) => (
                  <MealRow
                    key={m}
                    meta={MEAL_META[m]}
                    value={selectedRec[m]}
                    onChange={(patch) => setMeal(selectedDate, m, patch)}
                  />
                ))}
                <DayExtra
                  amount={adjustment}
                  note={selStatus.note}
                  onChange={(patch) => updateDayStatus(selectedDate, patch)}
                />
              </>
            )}

            <div className="day-total">
              <div>
                <span>Spent this day</span>
                {!isNoMeal && adjustment !== 0 && (
                  <div className="day-total-sub">includes ₹{adjustment} special charge</div>
                )}
              </div>
              <strong>₹{selDayTotal}</strong>
            </div>
          </section>

          <MonthSummary
            title={`${MONTH_NAMES[month]} ${year}`}
            totalSpent={totalSpent}
            totalMeals={totalMeals}
            daysWithMeals={daysWithMeals}
            rows={rows}
            onSelect={(k) => { goToDate(k); window.scrollTo({ top: 0, behavior: "smooth" }); }}
          />
        </>
      ) : (
        <MonthlyReport
          monthKey={reportMonth}
          days={days}
          dayStatus={dayStatus}
          recordFor={recordFor}
          onPrev={() => shiftReportMonth(-1)}
          onNext={() => shiftReportMonth(1)}
          onPickMonth={goToReportMonth}
        />
      )}
    </>
  );
}
