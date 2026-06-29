import { useEffect, useState } from "react";
import { Bell, BellOff } from "lucide-react";
import { useToast } from "../context/ToastContext";
import { pushSupported, pushConfigured, isSubscribed, enableReminders, disableReminders } from "../push";

export default function ReminderToggle() {
  const toast = useToast();
  const [on, setOn] = useState(false);
  const [busy, setBusy] = useState(false);
  const available = pushSupported && pushConfigured;

  useEffect(() => {
    if (!available) return;
    isSubscribed().then(setOn).catch(() => {});
  }, [available]);

  if (!available) return null;

  async function toggle() {
    setBusy(true);
    try {
      if (on) {
        await disableReminders();
        setOn(false);
        toast("Reminders turned off.");
      } else {
        await enableReminders();
        setOn(true);
        toast("Reminders on — we'll nudge you at 10 PM if meals are unlogged.");
      }
    } catch (e) {
      toast(e.message || "Couldn't update reminders.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      className={"btn btn-ghost small" + (on ? " is-active" : "")}
      type="button"
      onClick={toggle}
      disabled={busy}
      aria-label={on ? "Turn reminders off" : "Turn reminders on"}
    >
      {on ? <Bell size={16} /> : <BellOff size={16} />}
      <span className="hide-narrow">Reminders</span>
    </button>
  );
}
