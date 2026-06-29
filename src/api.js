const TOKEN_KEY = "meal.token";
let token = localStorage.getItem(TOKEN_KEY) || null;

export function getToken() { return token; }
export function setToken(t) {
  token = t;
  if (t) localStorage.setItem(TOKEN_KEY, t);
  else localStorage.removeItem(TOKEN_KEY);
}

async function request(path, { method = "GET", body } = {}) {
  const res = await fetch("/api" + path, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: "Bearer " + token } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || `Request failed (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return data;
}

export const api = {
  getToken,
  setToken,
  health: () => request("/health"),

  async signup(email, password) {
    const { token, user } = await request("/auth/signup", { method: "POST", body: { email, password } });
    setToken(token);
    return user;
  },
  async login(email, password) {
    const { token, user } = await request("/auth/login", { method: "POST", body: { email, password } });
    setToken(token);
    return user;
  },
  async google(credential) {
    const { token, user } = await request("/auth/google", { method: "POST", body: { credential } });
    setToken(token);
    return user;
  },
  me: () => request("/me"),

  getSettings: () => request("/settings"),
  saveSettings: (rates) => request("/settings", { method: "PUT", body: { rates } }),

  getMeals: (month) => request("/meals?month=" + month),
  saveMeal: (entry) => request("/meals", { method: "PUT", body: entry }),
};
