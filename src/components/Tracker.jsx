import { useMemo, useState } from "react";
import { Utensils, SlidersHorizontal, LogOut, ShieldCheck, CalendarDays, Users } from "lucide-react";
import { mealApi, isManager, isSuper, isProvider } from "../api";
import { useToast } from "../context/ToastContext";
import { todayKey } from "../dateUtils";
import useMealData from "../useMealData";
import MealBoard from "./MealBoard";
import AdminPanel from "./AdminPanel";
import ReminderToggle from "./ReminderToggle";

export default function Tracker({ user, onSignOut }) {
  const toast = useToast();
  const manager = isManager(user);
  // Providers serve the food — they have no meals of their own to track.
  const provider = isProvider(user);

  const [showSettings, setShowSettings] = useState(false);
  const [section, setSection] = useState(provider ? "members" : "mine"); // "mine" | "members"
  const [membersNonce, setMembersNonce] = useState(0);

  const ownApi = useMemo(() => mealApi(null), []);
  const data = useMealData(ownApi, { onError: toast, seedRates: !provider, enabled: !provider });

  function exportData() {
    const blob = new Blob([JSON.stringify({ rates: data.rates, days: data.days }, null, 2)], {
      type: "application/json",
    });
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
          <p className="subtitle">
            Signed in as {user.email}
            {manager && (
              <span className="role-tag">
                <ShieldCheck size={12} /> {isSuper(user) ? "Superuser" : "Provider"}
              </span>
            )}
          </p>
        </div>
        <div className="header-actions">
          {/* Reminders nudge you to log your own meals — nothing to nudge a provider about. */}
          {!provider && <ReminderToggle />}
          {section === "mine" && !provider && (
            <button
              className={"btn btn-ghost small" + (showSettings ? " is-active" : "")}
              type="button"
              onClick={() => setShowSettings((s) => !s)}
            >
              <SlidersHorizontal size={16} /> Rates
            </button>
          )}
          <button className="btn btn-ghost small" type="button" onClick={onSignOut}>
            <LogOut size={16} /> Sign out
          </button>
        </div>
      </header>

      {manager && !provider && (
        <div className="tabs tabs-top">
          <button
            className={"tab" + (section === "mine" ? " active" : "")}
            type="button"
            onClick={() => setSection("mine")}
          >
            <CalendarDays size={15} /> My meals
          </button>
          <button
            className={"tab" + (section === "members" ? " active" : "")}
            type="button"
            onClick={() => { setSection("members"); setMembersNonce((n) => n + 1); }}
          >
            <Users size={15} /> Members
          </button>
        </div>
      )}

      {section === "members" && manager ? (
        <AdminPanel me={user} resetSignal={membersNonce} />
      ) : (
        <MealBoard data={data} showRates={showSettings} />
      )}

      <footer className="app-footer muted">
        Synced to Neon
        {!provider && (
          <>
            {" · "}
            <button className="linkish" type="button" onClick={exportData}>Export visible data</button>
          </>
        )}
      </footer>
    </div>
  );
}
