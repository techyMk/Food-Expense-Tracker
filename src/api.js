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

  ...mealApi(null),

  pushSubscribe: (subscription) => request("/push/subscribe", { method: "POST", body: { subscription } }),
  pushUnsubscribe: (endpoint) => request("/push/unsubscribe", { method: "POST", body: { endpoint } }),
  pushTest: () => request("/push/test", { method: "POST" }),

  admin: {
    listUsers: (month) => request("/admin/users?month=" + month),
    createUser: (body) => request("/admin/users", { method: "POST", body }),
    updateUser: (id, body) => request(`/admin/users/${id}`, { method: "PATCH", body }),
    deleteUser: (id) => request(`/admin/users/${id}`, { method: "DELETE" }),
  },
};

/**
 * The meal/settings calls, aimed either at the signed-in user (`userId = null`)
 * or — for admins and the superuser — at another member. Same shapes either way.
 */
export function mealApi(userId) {
  const base = userId ? `/admin/users/${userId}` : "";
  return {
    getSettings: () => request(base + "/settings"),
    saveSettings: (rates) => request(base + "/settings", { method: "PUT", body: { rates } }),

    getMeals: (month) => request(base + "/meals?month=" + month),
    saveMeal: (entry) => request(base + "/meals", { method: "PUT", body: entry }),
    setDayStatus: (date, status) => request(base + "/day-status", { method: "PUT", body: { date, ...status } }),
  };
}

export const isManager = (user) => user?.role === "admin" || user?.role === "superuser";
export const isSuper = (user) => user?.role === "superuser";
/** Providers serve the food — they manage everyone's entries but log none of their own. */
export const isProvider = (user) => user?.role === "admin";
