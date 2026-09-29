import { useMemo, useState } from "react";
import { ArrowLeft, SlidersHorizontal, ShieldCheck, User } from "lucide-react";
import { mealApi } from "../api";
import { useToast } from "../context/ToastContext";
import useMealData from "../useMealData";
import MealBoard from "./MealBoard";

/** One member's meals, opened from the admin panel. Fully editable. */
export default function MemberView({ member, viewer, onBack }) {
  const toast = useToast();
  const [showRates, setShowRates] = useState(false);

  // Re-created only when the member changes, so the hook resets its cache then.
  const dataApi = useMemo(() => mealApi(member.id), [member.id]);
  const data = useMealData(dataApi, { onError: toast, actorEmail: viewer?.email });

  return (
    <>
      <section className="card member-bar">
        <button className="btn btn-ghost small" type="button" onClick={onBack}>
          <ArrowLeft size={16} /> All members
        </button>
        <div className="member-bar-who">
          <span className="member-avatar">{member.email.slice(0, 1).toUpperCase()}</span>
          <div className="member-bar-text">
            <div className="member-bar-email">{member.email}</div>
            <div className="muted">
              {member.role === "user" ? "Member" : "Superuser"} · editing on their behalf
            </div>
          </div>
        </div>
        <button
          className={"btn btn-ghost small" + (showRates ? " is-active" : "")}
          type="button"
          onClick={() => setShowRates((s) => !s)}
        >
          <SlidersHorizontal size={16} /> Rates
        </button>
      </section>

      <div className="editing-note">
        <span className="editing-icon">{member.role === "user" ? <User size={15} /> : <ShieldCheck size={15} />}</span>
        Changes here save to {member.email} straight away.
      </div>

      {data.loading ? (
        <p className="muted center">Loading their meals…</p>
      ) : (
        <MealBoard
          data={data}
          showRates={showRates}
          showAudit
          viewerEmail={viewer?.email}
          dataApi={dataApi}
        />
      )}
    </>
  );
}
