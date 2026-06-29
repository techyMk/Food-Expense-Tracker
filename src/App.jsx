import { useEffect, useState } from "react";
import { Utensils } from "lucide-react";
import { api } from "./api";
import { ToastProvider } from "./context/ToastContext";
import SetupBanner from "./components/SetupBanner";
import AuthView from "./components/AuthView";
import Tracker from "./components/Tracker";

function Loader() {
  return (
    <div className="app-loader">
      <div className="loader-stack">
        <div className="loader-ring">
          <span className="loader-badge"><Utensils size={26} strokeWidth={2.2} /></span>
        </div>
        <div className="loader-text">Loading your meals…</div>
      </div>
    </div>
  );
}

export default function App() {
  const [phase, setPhase] = useState("loading"); // loading | setup | auth | app
  const [user, setUser] = useState(null);

  useEffect(() => {
    (async () => {
      let health;
      try {
        health = await api.health();
      } catch {
        setPhase("setup"); // API server not reachable
        return;
      }
      if (!health.configured) { setPhase("setup"); return; }

      if (api.getToken()) {
        try {
          const { user } = await api.me();
          setUser(user);
          setPhase("app");
          return;
        } catch {
          api.setToken(null); // token invalid/expired
        }
      }
      setPhase("auth");
    })();
  }, []);

  if (phase === "loading") return <Loader />;
  if (phase === "setup") return <SetupBanner />;

  return (
    <ToastProvider>
      {phase === "app" && user ? (
        <Tracker
          user={user}
          onSignOut={() => { api.setToken(null); setUser(null); setPhase("auth"); }}
        />
      ) : (
        <AuthView onAuthed={(u) => { setUser(u); setPhase("app"); }} />
      )}
    </ToastProvider>
  );
}
