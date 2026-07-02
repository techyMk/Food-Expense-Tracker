import { useEffect, useState } from "react";
import { Bell, BellOff } from "lucide-react";
import { useToast } from "../context/ToastContext";
import { api } from "../api";
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

  async function testPush() {
    setBusy(true);
    try {
      const r = await api.pushTest();
      if (r.sent > 0) toast("Test sent — you should see a notification shortly.");
      else if (r.removed > 0) toast("Your subscription had expired — toggle reminders off then on again.");
      else toast(r.errors?.[0] ? `Push failed: ${r.errors[0]}` : "No notification sent.");
    } catch (e) {
      toast(e.message || "Couldn't send test notification.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        className={"btn btn-ghost small" + (on ? " is-active" : "")}
        type="button"
        onClick={toggle}
        disabled={busy}
        aria-label={on ? "Turn reminders off" : "Turn reminders on"}
        title={on ? "Reminders on — tap to turn off" : "Tap to turn on reminders"}
      >
        {on ? <BellOff size={16} /> : <Bell size={16} />}
        <span className="hide-narrow">Reminders</span>
      </button>
      {/* TEMP: remove after verifying push works */}
      {on && (
        <button className="btn btn-ghost small" type="button" onClick={testPush} disabled={busy}>
          Test
        </button>
      )}
    </>
  );
}
