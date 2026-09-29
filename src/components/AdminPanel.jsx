import { useCallback, useEffect, useState } from "react";
import {
  UserPlus, ShieldCheck, Trash2, ChevronRight, ChevronLeft, KeyRound, RefreshCw,
} from "lucide-react";
import { api, isSuper } from "../api";
import { useToast } from "../context/ToastContext";
import { MONTH_NAMES, DAY_NAMES } from "../constants";
import { todayKey, monthTag, dateFromKey, keyFromDate } from "../dateUtils";
import MemberView from "./MemberView";

const ROLE_LABEL = { user: "Member", admin: "Provider", superuser: "Superuser" };
// Providers serve the food rather than eat it, so they have no meal board to open.
const eats = (member) => member.role !== "admin";

function AddMemberForm({ canAddManagers, onAdded }) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("user");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  function close() {
    setOpen(false);
    setEmail(""); setPassword(""); setRole("user"); setError(null);
  }

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { user } = await api.admin.createUser({ email: email.trim(), password, role });
      toast(`${user.email} added as ${ROLE_LABEL[user.role].toLowerCase()}.`);
      close();
      onAdded();
    } catch (err) {
      setError(err.message || "Could not add that person.");
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button className="btn btn-primary-soft small" type="button" onClick={() => setOpen(true)}>
        <UserPlus size={16} /> Add member
      </button>
    );
  }

  return (
    <form className="add-member" onSubmit={submit} noValidate>
      <h3>New member</h3>
      <div className="add-member-grid">
        <label className="field">
          <span>Email</span>
          <input
            type="email"
            autoComplete="off"
            placeholder="them@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        <label className="field">
          <span>Temporary password</span>
          <input
            type="text"
            autoComplete="off"
            placeholder="At least 6 characters"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
      </div>

      {canAddManagers && (
        <div className="role-picker">
          <button
            type="button"
            className={"role-option" + (role === "user" ? " on" : "")}
            onClick={() => setRole("user")}
          >
            <strong>Member</strong>
            <span>Eats the food and logs their own meals.</span>
          </button>
          <button
            type="button"
            className={"role-option" + (role === "admin" ? " on" : "")}
            onClick={() => setRole("admin")}
          >
            <strong>Provider</strong>
            <span>Serves the food. Reads and edits everyone's entries, logs none of their own.</span>
          </button>
        </div>
      )}

      {error && <div className="auth-msg error">{error}</div>}

      <div className="add-member-actions">
        <button className="btn btn-ghost small" type="button" onClick={close} disabled={busy}>Cancel</button>
        <button className="btn btn-primary-soft small" type="submit" disabled={busy}>
          {busy ? "Adding…" : "Add member"}
        </button>
      </div>
      <p className="muted">They sign in with this email and password, and can change the password later.</p>
    </form>
  );
}

function MemberRow({ member, canManage, onOpen, onRoleChange, onReset, onDelete }) {
  const locked = member.isSelf || member.role === "superuser";
  const openable = eats(member);

  const inner = (
    <>
      <span className="member-avatar">{member.email.slice(0, 1).toUpperCase()}</span>
      <span className="member-text">
        <span className="member-email">
          {member.email}
          {member.isSelf && <span className="role-tag self">You</span>}
          {member.role !== "user" && (
            <span className="role-tag"><ShieldCheck size={12} /> {ROLE_LABEL[member.role]}</span>
          )}
        </span>
        <span className="member-sub">
          {openable ? (
            <>
              {member.mealsTaken} meal{member.mealsTaken === 1 ? "" : "s"} this month
              {member.lastEntry ? ` · last entry ${shortDate(member.lastEntry)}` : " · nothing logged yet"}
            </>
          ) : (
            "Serves the food · no meals of their own"
          )}
        </span>
      </span>
      {openable && (
        <>
          <span className="member-spent">₹{member.spent}</span>
          <ChevronRight className="member-chevron" size={18} />
        </>
      )}
    </>
  );

  return (
    <li className="member-row">
      {openable ? (
        <button className="member-main" type="button" onClick={onOpen}>{inner}</button>
      ) : (
        <div className="member-main is-static">{inner}</div>
      )}

      {canManage && !locked && (
        <div className="member-tools">
          <button
            className="linkish"
            type="button"
            onClick={() => onRoleChange(member.role === "admin" ? "user" : "admin")}
          >
            {member.role === "admin" ? "Back to member" : "Make provider"}
          </button>
          <button className="linkish" type="button" onClick={onReset}>
            <KeyRound size={13} /> Reset password
          </button>
          <button className="linkish danger" type="button" onClick={onDelete}>
            <Trash2 size={13} /> Remove
          </button>
        </div>
      )}
    </li>
  );
}

function shortDate(key) {
  const d = dateFromKey(key);
  return `${DAY_NAMES[d.getDay()].slice(0, 3)} ${d.getDate()} ${MONTH_NAMES[d.getMonth()].slice(0, 3)}`;
}

export default function AdminPanel({ me, resetSignal }) {
  const toast = useToast();
  const [month, setMonth] = useState(() => monthTag(todayKey()));
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [openId, setOpenId] = useState(null);
  const canManage = isSuper(me);

  // Tapping the Members tab again backs out of whoever is open.
  useEffect(() => { setOpenId(null); }, [resetSignal]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { users } = await api.admin.listUsers(month);
      setUsers(users);
      setError(null);
    } catch (err) {
      setError(err.message || "Could not load members.");
    } finally {
      setLoading(false);
    }
  }, [month]);

  useEffect(() => { load(); }, [load]);

  // A promotion to provider while their board is open drops you back to the list.
  const openMember = users.find((u) => u.id === openId && eats(u));
  if (openMember) {
    return <MemberView member={openMember} onBack={() => { setOpenId(null); load(); }} />;
  }

  function shiftMonth(delta) {
    const [y, m] = month.split("-").map(Number);
    setMonth(monthTag(keyFromDate(new Date(y, m - 1 + delta, 1))));
  }

  async function changeRole(member, role) {
    try {
      await api.admin.updateUser(member.id, { role });
      toast(`${member.email} is now a ${ROLE_LABEL[role].toLowerCase()}.`);
      load();
    } catch (err) {
      toast(err.message || "Couldn't change that role.");
    }
  }

  async function resetPassword(member) {
    const password = window.prompt(`New password for ${member.email} (at least 6 characters):`);
    if (!password) return;
    try {
      await api.admin.updateUser(member.id, { password });
      toast("Password updated.");
    } catch (err) {
      toast(err.message || "Couldn't reset that password.");
    }
  }

  async function removeMember(member) {
    if (!window.confirm(`Remove ${member.email}? All of their meal entries are deleted too.`)) return;
    try {
      await api.admin.deleteUser(member.id);
      toast(`${member.email} removed.`);
      load();
    } catch (err) {
      toast(err.message || "Couldn't remove that member.");
    }
  }

  const [y, m] = month.split("-").map(Number);
  const eaters = users.filter(eats);
  const totalSpent = eaters.reduce((s, u) => s + (u.spent || 0), 0);

  return (
    <>
      <section className="card admin-head">
        <div className="admin-head-top">
          <div>
            <h2>Members</h2>
            <p className="muted">Open a member to view or edit their daily entries.</p>
          </div>
          <button className="btn btn-ghost small" type="button" onClick={load} aria-label="Refresh">
            <RefreshCw size={15} />
          </button>
        </div>

        <div className="admin-month">
          <button className="btn btn-round small-round" type="button" aria-label="Previous month" onClick={() => shiftMonth(-1)}>
            <ChevronLeft size={18} />
          </button>
          <div className="admin-month-label">
            <strong>{MONTH_NAMES[m - 1]} {y}</strong>
            <span className="muted">₹{totalSpent} across {eaters.length} {eaters.length === 1 ? "person" : "people"}</span>
          </div>
          <button className="btn btn-round small-round" type="button" aria-label="Next month" onClick={() => shiftMonth(1)}>
            <ChevronRight size={18} />
          </button>
        </div>
      </section>

      <section className="card">
        {loading ? (
          <p className="muted center">Loading members…</p>
        ) : error ? (
          <p className="muted center">{error}</p>
        ) : users.length === 0 ? (
          <p className="muted center">No members yet.</p>
        ) : (
          <ul className="member-list">
            {users.map((u) => (
              <MemberRow
                key={u.id}
                member={u}
                canManage={canManage}
                onOpen={() => setOpenId(u.id)}
                onRoleChange={(role) => changeRole(u, role)}
                onReset={() => resetPassword(u)}
                onDelete={() => removeMember(u)}
              />
            ))}
          </ul>
        )}
      </section>

      <section className="card">
        <AddMemberForm canAddManagers={canManage} onAdded={load} />
      </section>
    </>
  );
}
