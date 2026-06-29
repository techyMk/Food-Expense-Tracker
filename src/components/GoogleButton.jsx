import { useEffect, useRef } from "react";

const SRC = "https://accounts.google.com/gsi/client";
export const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;
export const googleEnabled = !!GOOGLE_CLIENT_ID && !GOOGLE_CLIENT_ID.includes("YOUR-CLIENT-ID");

function loadGsi() {
  return new Promise((resolve, reject) => {
    if (window.google?.accounts?.id) return resolve();
    const existing = document.querySelector(`script[src="${SRC}"]`);
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error("script error")));
      return;
    }
    const s = document.createElement("script");
    s.src = SRC;
    s.async = true;
    s.defer = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("script error"));
    document.head.appendChild(s);
  });
}

export default function GoogleButton({ onCredential, onError }) {
  const ref = useRef(null);

  useEffect(() => {
    if (!googleEnabled) return;
    let cancelled = false;
    loadGsi()
      .then(() => {
        if (cancelled || !window.google || !ref.current) return;
        window.google.accounts.id.initialize({
          client_id: GOOGLE_CLIENT_ID,
          callback: (resp) => onCredential(resp.credential),
        });
        window.google.accounts.id.renderButton(ref.current, {
          type: "standard",
          theme: "outline",
          size: "large",
          shape: "pill",
          text: "continue_with",
          logo_alignment: "center",
          width: 300,
        });
      })
      .catch(() => onError && onError("Couldn't load Google sign-in."));
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!googleEnabled) return null;
  return <div ref={ref} className="google-btn" />;
}
