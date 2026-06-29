import { useEffect, useState, useRef, useCallback } from "react";
import { Utensils, SlidersHorizontal, LogOut, Check, X, Ban } from "lucide-react";
import { api } from "../api";
import { useToast } from "../context/ToastContext";
import {
  MEALS, MEAL_META, FACTORY_RATES, DAY_NAMES, MONTH_NAMES, cloneRates, mergeRates,
} from "../constants";
import {
  todayKey, dateFromKey, keyFromDate, monthTag, isSunday,
} from "../dateUtils";
import DayNav from "./DayNav";
import MealRow from "./MealRow";
import RatesPanel from "./RatesPanel";
import MonthSummary from "./MonthSummary";
import MonthlyReport from "./MonthlyReport";
import ReminderToggle from "./ReminderToggle";
import DayExtra from "./DayExtra";

export default function Tracker({ user, onSignOut }) {
  const toast = useToast();
  const [rates, setRates] = useState(() => cloneRates(FACTORY_RATES));
  const [days, setDays] = useState({}); // { "YYYY-MM-DD": { morning: {taken, amount}, ... } }
  const [dayStatus, setDayStatus] = useState({}); // date -> { noMeal, adjustment, note }
  const [selectedDate, setSelectedDate] = useState(todayKey());
  const [showSettings, setShowSettings] = useState(false);
  const [view, setView] = useState("daily"); // "daily" | "report"
  const [reportMonth, setReportMonth] = useState(() => monthTag(todayKey())); // "YYYY-MM"
  const loadedMonths = useRef(new Set());

  const defaultRateFor = useCallback(
    (key, meal) => Number((isSunday(key) ? rates.sunday : rates.weekday)[meal]) || 0,
    [rates]
  );

  const recordFor = useCallback((key) => {
    const stored = days[key];
    const rec = {};
    for (const m of MEALS) {
      const s = stored && stored[m];
      rec[m] = {
        taken: s ? !!s.taken : false,
        amount: s && s.amount != null ? Number(s.amount) : defaultRateFor(key, m),
      };
    }
    return rec;
  }, [days, defaultRateFor]);

  // ---- Data loading ----
  const loadSettings = useCallback(async () => {
    try {
      const { rates: saved } = await api.getSettings();
      if (saved) {
        setRates(mergeRates(saved));
      } else {
        const fresh = cloneRates(FACTORY_RATES);
        setRates(fresh);
        await api.saveSettings(fresh);
      }
    } catch {
      toast("Could not load settings.");
    }
  }, [toast]);

  const ensureMonthLoaded = useCallback(async (key) => {
    const tag = monthTag(key);
    if (loadedMonths.current.has(tag)) return;
    loadedMonths.current.add(tag);
    try {
      const { entries, status } = await api.getMeals(tag);
      setDays((prev) => {
        const next = { ...prev };
        for (const row of entries || []) {
          next[row.date] = { ...(next[row.date] || {}), [row.meal]: { taken: !!row.taken, amount: Number(row.amount) } };
        }
        return next;
      });
      if (status) setDayStatus((prev) => ({ ...prev, ...status }));
    } catch {
      loadedMonths.current.delete(tag);
      toast("Couldn't load that month.");
    }
  }, [toast]);

  useEffect(() => {
    loadSettings();
    ensureMonthLoaded(todayKey());
  }, [loadSettings, ensureMonthLoaded]);

  // ---- Mutations (write-through to the API) ----
  async function saveMeal(key, meal, val) {
    try {
      await api.saveMeal({ date: key, meal, taken: val.taken, amount: val.amount });
    } catch {
      toast("Save failed — try again.");
    }
  }

  function setMeal(key, meal, patch) {
    const dayRec = days[key] || {};
    const cur = dayRec[meal] || { taken: false, amount: defaultRateFor(key, meal) };
    const nextVal = { ...cur, ...patch };
    setDays((prev) => ({ ...prev, [key]: { ...(prev[key] || {}), [meal]: nextVal } }));
    saveMeal(key, meal, nextVal);
  }

  async function saveSettings(r) {
    try {
      await api.saveSettings(r);
    } catch {
      toast("Could not save rates.");
    }
  }

  function updateRate(kind, meal, value) {
    const next = { ...rates, [kind]: { ...rates[kind], [meal]: value } };
    setRates(next);
    saveSettings(next);
  }

  function resetRates() {
    const fresh = cloneRates(FACTORY_RATES);
    setRates(fresh);
    saveSettings(fresh);
  }

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

  function setAllTaken(taken) {
    const rec = recordFor(selectedDate);
    for (const m of MEALS) {
      setMeal(selectedDate, m, { taken, amount: rec[m].amount });
    }
  }

  const statusFor = (key) => dayStatus[key] || { noMeal: false, adjustment: 0, note: "" };

  function updateDayStatus(patch) {
    const next = { ...statusFor(selectedDate), ...patch };
    setDayStatus((prev) => ({ ...prev, [selectedDate]: next }));
    api.setDayStatus(selectedDate, next).catch(() => toast("Couldn't save — try again."));
  }
  const toggleNoMeal = (value) => updateDayStatus({ noMeal: value });

  // ---- Monthly report ----
  async function goToReportMonth(tag) {
    setReportMonth(tag);
    await ensureMonthLoaded(tag + "-01");
  }
  function shiftReportMonth(delta) {
    const [y, m] = reportMonth.split("-").map(Number);
    const d = new Date(y, m - 1 + delta, 1);
    goToReportMonth(monthTag(keyFromDate(d)));
  }
  async function openReport() {
    setView("report");
    await ensureMonthLoaded(reportMonth + "-01");
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

  function exportData() {
    const blob = new Blob([JSON.stringify({ rates, days }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `meal-tracker-${todayKey()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="app">
      <header className="app-header">
        <div className="header-titles">
          <div className="brand">
            <span className="brand-badge"><Utensils size={20} strokeWidth={2.2} /></span>
            <h1>Meal Tracker</h1>
          </div>
          <p className="subtitle">Signed in as {user.email}</p>
        </div>
        <div className="header-actions">
          <ReminderToggle />
          <button className="btn btn-ghost small" type="button" onClick={() => setShowSettings((s) => !s)}>
            <SlidersHorizontal size={16} /> Rates
          </button>
          <button className="btn btn-ghost small" type="button" onClick={onSignOut}>
            <LogOut size={16} /> Sign out
          </button>
        </div>
      </header>

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

      {showSettings && <RatesPanel rates={rates} onUpdate={updateRate} onReset={resetRates} />}

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
                onClick={() => toggleNoMeal(!isNoMeal)}
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
                <DayExtra amount={adjustment} note={selStatus.note} onChange={updateDayStatus} />
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

      <footer className="app-footer muted">
        Synced to Neon ·{" "}
        <button className="linkish" type="button" onClick={exportData}>Export visible data</button>
      </footer>
    </div>
  );
}
