import { useState } from "react";
import { Utensils } from "lucide-react";
import { api } from "../api";
import GoogleButton, { googleEnabled } from "./GoogleButton";

export default function AuthView({ onAuthed }) {
  const [mode, setMode] = useState("signin"); // "signin" | "signup"
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const signin = mode === "signin";

  async function handleGoogle(credential) {
    setBusy(true);
    setError(null);
    try {
      const user = await api.google(credential);
      onAuthed(user);
    } catch (err) {
      setError(err.message || "Google sign-in failed.");
      setBusy(false);
    }
  }

  async function submit(e) {
    e.preventDefault();
    if (!email.trim() || password.length < 6) {
      setError("Enter an email and a password of at least 6 characters.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const user = signin
        ? await api.login(email.trim(), password)
        : await api.signup(email.trim(), password);
      onAuthed(user);
    } catch (err) {
      setError(err.message || "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-wrap">
      <div className="card auth-card">
        <div className="brand-center">
          <span className="brand-badge lg"><Utensils size={28} strokeWidth={2.2} /></span>
          <h1>Meal Tracker</h1>
        </div>
        <p className="muted">
          {signin ? "Sign in to sync your meals across devices." : "Create an account to start tracking."}
        </p>
        <form onSubmit={submit} noValidate>
          <label className="field">
            <span>Email</span>
            <input
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          <label className="field">
            <span>Password</span>
            <input
              type="password"
              autoComplete={signin ? "current-password" : "new-password"}
              placeholder="At least 6 characters"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          {error && <div className="auth-msg error">{error}</div>}
          <button type="submit" className="btn btn-primary full" disabled={busy}>
            {busy ? "Please wait…" : signin ? "Sign in" : "Create account"}
          </button>
        </form>

        {googleEnabled && (
          <>
            <div className="or-divider"><span>or</span></div>
            <GoogleButton onCredential={handleGoogle} onError={setError} />
          </>
        )}

        <p className="muted center switch-line">
          {signin ? "New here? " : "Already have an account? "}
          <button
            type="button"
            className="linkish"
            onClick={() => { setMode(signin ? "signup" : "signin"); setError(null); }}
          >
            {signin ? "Create an account" : "Sign in instead"}
          </button>
        </p>
      </div>
    </div>
  );
}
