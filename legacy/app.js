/* Meal & Expense Tracker — Supabase-backed, with email auth. */
(function () {
  "use strict";

  // ---- Constants ---------------------------------------------------------
  const MEALS = ["morning", "afternoon", "night"];
  const MEAL_META = {
    morning: { label: "Morning", icon: "🌅", sub: "Breakfast" },
    afternoon: { label: "Afternoon", icon: "☀️", sub: "Lunch" },
    night: { label: "Night", icon: "🌙", sub: "Dinner" },
  };
  // Weekday 35/50/35 = 120, Sunday 35/80/35 = 150 (editable per user).
  const FACTORY_RATES = {
    weekday: { morning: 35, afternoon: 50, night: 35 },
    sunday: { morning: 35, afternoon: 80, night: 35 },
  };
  const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const MONTH_NAMES = ["January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"];

  const el = function (id) { return document.getElementById(id); };

  // ---- Runtime state -----------------------------------------------------
  let sb = null;                 // supabase client
  let user = null;               // current auth user
  let authMode = "signin";       // "signin" | "signup"
  let selectedDate = todayKey();
  const loadedMonths = new Set();
  let state = { rates: cloneRates(FACTORY_RATES), days: {} };

  // ---- Boot --------------------------------------------------------------
  const cfg = window.SUPABASE_CONFIG || {};
  const configured = cfg.url && cfg.anonKey &&
    cfg.url.indexOf("YOUR-PROJECT") === -1 && cfg.anonKey.indexOf("YOUR-ANON") === -1;

  if (!configured) {
    show("setupBanner");
  } else if (!window.supabase || !window.supabase.createClient) {
    show("setupBanner");
    el("setupBanner").querySelector(".setup-card").innerHTML =
      "<h1>⚠️ Offline</h1><p>Couldn't load the Supabase library. Check your internet connection and reload.</p>";
  } else {
    sb = window.supabase.createClient(cfg.url, cfg.anonKey);
    bindAuthUI();
    bindAppUI();
    startAuth();
  }

  // ---- Auth --------------------------------------------------------------
  function startAuth() {
    sb.auth.onAuthStateChange(function (_event, session) { handleSession(session); });
    sb.auth.getSession().then(function (res) { handleSession(res.data.session); });
  }

  function handleSession(session) {
    const u = session ? session.user : null;
    if (u && !user) { user = u; onLogin(); }
    else if (!u && user) { user = null; onLogout(); }
    else if (!u && !user) { show("authView"); }
  }

  function bindAuthUI() {
    el("authForm").addEventListener("submit", onAuthSubmit);
    el("authSwitch").addEventListener("click", toggleAuthMode);
  }

  function toggleAuthMode() {
    authMode = authMode === "signin" ? "signup" : "signin";
    const signin = authMode === "signin";
    el("authSubmit").textContent = signin ? "Sign in" : "Create account";
    el("authIntro").textContent = signin
      ? "Sign in to sync your meals across devices."
      : "Create an account to start tracking.";
    el("authSwitchText").textContent = signin ? "New here?" : "Already have an account?";
    el("authSwitch").textContent = signin ? "Create an account" : "Sign in instead";
    el("authPassword").setAttribute("autocomplete", signin ? "current-password" : "new-password");
    hideAuthMsg();
  }

  async function onAuthSubmit(e) {
    e.preventDefault();
    const email = el("authEmail").value.trim();
    const password = el("authPassword").value;
    if (!email || password.length < 6) {
      return authMsg("Enter an email and a password of at least 6 characters.", true);
    }
    setAuthBusy(true);
    try {
      if (authMode === "signup") {
        const { data, error } = await sb.auth.signUp({ email: email, password: password });
        if (error) throw error;
        if (!data.session) {
          // Email confirmation is enabled on the project — flip to sign-in, then notify.
          if (authMode === "signup") toggleAuthMode();
          authMsg("Account created. Check your email to confirm, then sign in.", false);
        }
      } else {
        const { error } = await sb.auth.signInWithPassword({ email: email, password: password });
        if (error) throw error;
      }
    } catch (err) {
      authMsg(friendlyAuthError(err), true);
    } finally {
      setAuthBusy(false);
    }
  }

  function friendlyAuthError(err) {
    const m = (err && err.message) || "Something went wrong.";
    if (/invalid login credentials/i.test(m)) return "Wrong email or password.";
    if (/already registered/i.test(m)) return "That email is already registered — try signing in.";
    if (/rate limit/i.test(m)) return "Too many attempts. Wait a moment and try again.";
    return m;
  }

  function setAuthBusy(busy) {
    el("authSubmit").disabled = busy;
    el("authSubmit").textContent = busy ? "Please wait…" : (authMode === "signin" ? "Sign in" : "Create account");
  }
  function authMsg(text, isError) {
    const box = el("authMsg");
    box.textContent = text;
    box.classList.toggle("error", !!isError);
    box.classList.remove("hidden");
  }
  function hideAuthMsg() { el("authMsg").classList.add("hidden"); }

  async function onLogin() {
    show("appView");
    el("userLine").textContent = "Signed in as " + user.email;
    selectedDate = todayKey();
    loadedMonths.clear();
    state.days = {};
    try {
      await loadSettings();
      await ensureMonthLoaded(selectedDate);
    } catch (err) {
      toast("Could not load your data — check connection.");
      console.warn(err);
    }
    render();
  }

  function onLogout() {
    state = { rates: cloneRates(FACTORY_RATES), days: {} };
    loadedMonths.clear();
    el("authForm").reset();
    hideAuthMsg();
    show("authView");
  }

  // ---- Data layer (Supabase) --------------------------------------------
  async function loadSettings() {
    const { data, error } = await sb.from("user_settings")
      .select("rates").eq("user_id", user.id).maybeSingle();
    if (error) throw error;
    if (data && data.rates) {
      state.rates = mergeRates(data.rates);
    } else {
      state.rates = cloneRates(FACTORY_RATES);
      await sb.from("user_settings").upsert({
        user_id: user.id, rates: state.rates, updated_at: nowIso(),
      });
    }
  }

  async function saveSettings() {
    const { error } = await sb.from("user_settings").upsert({
      user_id: user.id, rates: state.rates, updated_at: nowIso(),
    });
    if (error) { toast("Could not save rates."); console.warn(error); }
  }

  async function ensureMonthLoaded(key) {
    const d = dateFromKey(key);
    const tag = d.getFullYear() + "-" + pad(d.getMonth() + 1);
    if (loadedMonths.has(tag)) return;
    const start = tag + "-01";
    const end = keyFromDate(new Date(d.getFullYear(), d.getMonth() + 1, 0));
    const { data, error } = await sb.from("meal_entries")
      .select("date, meal, taken, amount")
      .eq("user_id", user.id).gte("date", start).lte("date", end);
    if (error) throw error;
    (data || []).forEach(function (row) {
      if (!state.days[row.date]) state.days[row.date] = {};
      state.days[row.date][row.meal] = { taken: !!row.taken, amount: Number(row.amount) };
    });
    loadedMonths.add(tag);
  }

  function setMeal(key, meal, patch) {
    if (!state.days[key]) state.days[key] = {};
    const cur = state.days[key][meal] || { taken: false, amount: defaultRateFor(key, meal) };
    const next = Object.assign({}, cur, patch);
    state.days[key][meal] = next;
    saveMeal(key, meal, next); // fire-and-forget write-through
  }

  async function saveMeal(key, meal, val) {
    const { error } = await sb.from("meal_entries").upsert({
      user_id: user.id, date: key, meal: meal,
      taken: val.taken, amount: val.amount, updated_at: nowIso(),
    }, { onConflict: "user_id,date,meal" });
    if (error) { toast("Save failed — will retry on next change."); console.warn(error); }
  }

  // ---- Domain helpers ----------------------------------------------------
  function cloneRates(r) {
    return { weekday: Object.assign({}, r.weekday), sunday: Object.assign({}, r.sunday) };
  }
  function mergeRates(r) {
    return {
      weekday: Object.assign({}, FACTORY_RATES.weekday, r && r.weekday),
      sunday: Object.assign({}, FACTORY_RATES.sunday, r && r.sunday),
    };
  }
  function defaultRateFor(key, meal) {
    const table = isSunday(key) ? state.rates.sunday : state.rates.weekday;
    return Number(table[meal]) || 0;
  }
  function getDay(key) {
    const stored = state.days[key];
    const rec = {};
    MEALS.forEach(function (m) {
      const s = stored && stored[m];
      rec[m] = {
        taken: s ? !!s.taken : false,
        amount: s && s.amount != null ? Number(s.amount) : defaultRateFor(key, m),
      };
    });
    return rec;
  }
  function dayTotal(rec) {
    return MEALS.reduce(function (sum, m) {
      return sum + (rec[m].taken ? Number(rec[m].amount) || 0 : 0);
    }, 0);
  }

  // ---- Date helpers ------------------------------------------------------
  function pad(n) { return n < 10 ? "0" + n : "" + n; }
  function keyFromDate(d) { return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); }
  function dateFromKey(key) { const p = key.split("-"); return new Date(+p[0], +p[1] - 1, +p[2]); }
  function todayKey() { return keyFromDate(new Date()); }
  function isSunday(key) { return dateFromKey(key).getDay() === 0; }
  function nowIso() { return new Date().toISOString(); }

  // ---- Rendering ---------------------------------------------------------
  function render() {
    renderDayNav();
    renderMeals();
    renderSummary();
    renderRatesInputs();
  }

  function renderDayNav() {
    el("datePicker").value = selectedDate;
    const d = dateFromKey(selectedDate);
    let label = DAY_NAMES[d.getDay()] + ", " + d.getDate() + " " + MONTH_NAMES[d.getMonth()] + " " + d.getFullYear();
    if (selectedDate === todayKey()) label = "Today · " + label;
    if (isSunday(selectedDate)) label += "  (Sunday rate)";
    el("dayLabel").textContent = label;
  }

  function renderMeals() {
    const rec = getDay(selectedDate);
    const list = el("mealList");
    list.innerHTML = "";

    MEALS.forEach(function (m) {
      const meta = MEAL_META[m];
      const row = document.createElement("div");
      row.className = "meal " + (rec[m].taken ? "is-taken" : "not-taken");
      row.innerHTML =
        '<div class="meal-icon">' + meta.icon + "</div>" +
        '<div class="meal-info">' +
          '<div class="meal-name">' + meta.label + "</div>" +
          '<div class="meal-sub">' + meta.sub + "</div>" +
        "</div>" +
        '<div class="meal-amount">' +
          '<span class="rupee">₹</span>' +
          '<input type="number" inputmode="numeric" min="0" step="1" class="amt" value="' + (Number(rec[m].amount) || 0) + '" />' +
        "</div>" +
        '<label class="toggle">' +
          '<input type="checkbox" class="taken" ' + (rec[m].taken ? "checked" : "") + " />" +
          '<span class="slider"></span>' +
        "</label>";

      const amt = row.querySelector(".amt");
      amt.addEventListener("change", function () {
        const v = Math.max(0, Math.round(Number(amt.value) || 0));
        amt.value = v;
        setMeal(selectedDate, m, { amount: v });
        el("dayTotal").textContent = dayTotal(getDay(selectedDate));
        renderSummary();
      });

      const taken = row.querySelector(".taken");
      taken.addEventListener("change", function () {
        setMeal(selectedDate, m, { taken: taken.checked, amount: Math.max(0, Math.round(Number(amt.value) || 0)) });
        renderMeals();
        renderSummary();
      });

      list.appendChild(row);
    });

    el("dayTotal").textContent = dayTotal(rec);
  }

  function renderSummary() {
    const d = dateFromKey(selectedDate);
    const year = d.getFullYear(), month = d.getMonth();
    el("monthTitle").textContent = MONTH_NAMES[month] + " " + year;

    const keys = Object.keys(state.days).filter(function (k) {
      const dd = dateFromKey(k);
      return dd.getFullYear() === year && dd.getMonth() === month;
    }).sort();

    let totalSpent = 0, totalMeals = 0, daysWithMeals = 0;
    const body = el("monthTableBody");
    body.innerHTML = "";

    keys.forEach(function (k) {
      const rec = getDay(k);
      const takenCount = MEALS.filter(function (m) { return rec[m].taken; }).length;
      if (takenCount === 0) return;
      const t = dayTotal(rec);
      daysWithMeals++; totalMeals += takenCount; totalSpent += t;

      const dd = dateFromKey(k);
      const tr = document.createElement("tr");
      if (k === todayKey()) tr.className = "is-today";
      tr.innerHTML =
        "<td>" + dd.getDate() + " " + MONTH_NAMES[month].slice(0, 3) + "</td>" +
        "<td>" + DAY_NAMES[dd.getDay()].slice(0, 3) + "</td>" +
        cell(rec.morning.taken) + cell(rec.afternoon.taken) + cell(rec.night.taken) +
        '<td class="r spent">₹' + t + "</td>";
      tr.style.cursor = "pointer";
      tr.addEventListener("click", function () { goToDate(k); window.scrollTo({ top: 0, behavior: "smooth" }); });
      body.appendChild(tr);
    });

    el("monthSpent").textContent = "₹" + totalSpent;
    el("monthMeals").textContent = totalMeals;
    el("monthDays").textContent = daysWithMeals;
    el("emptyMonth").classList.toggle("hidden", daysWithMeals > 0);
  }

  function cell(taken) {
    return '<td class="c">' + (taken ? '<span class="tick">✓</span>' : '<span class="cross">·</span>') + "</td>";
  }

  function renderRatesInputs() {
    MEALS.forEach(function (m) {
      el("rate-weekday-" + m).value = state.rates.weekday[m];
      el("rate-sunday-" + m).value = state.rates.sunday[m];
    });
    updateRateTotals();
  }
  function updateRateTotals() {
    const wk = MEALS.reduce(function (s, m) { return s + (Number(state.rates.weekday[m]) || 0); }, 0);
    const su = MEALS.reduce(function (s, m) { return s + (Number(state.rates.sunday[m]) || 0); }, 0);
    el("weekdayTotal").textContent = wk;
    el("sundayTotal").textContent = su;
  }

  // ---- App UI events -----------------------------------------------------
  async function goToDate(key) {
    selectedDate = key;
    try { await ensureMonthLoaded(key); } catch (e) { toast("Couldn't load that month."); }
    render();
  }
  function shiftDay(delta) {
    const d = dateFromKey(selectedDate);
    d.setDate(d.getDate() + delta);
    goToDate(keyFromDate(d));
  }

  function bindAppUI() {
    el("prevDay").addEventListener("click", function () { shiftDay(-1); });
    el("nextDay").addEventListener("click", function () { shiftDay(1); });
    el("todayBtn").addEventListener("click", function () { goToDate(todayKey()); });
    el("datePicker").addEventListener("change", function () { if (this.value) goToDate(this.value); });

    el("settingsToggle").addEventListener("click", function () {
      el("settingsPanel").classList.toggle("hidden");
    });
    el("resetRates").addEventListener("click", function () {
      state.rates = cloneRates(FACTORY_RATES);
      saveSettings(); render();
    });
    el("signOutBtn").addEventListener("click", function () { sb.auth.signOut(); });
    el("exportBtn").addEventListener("click", exportData);

    MEALS.forEach(function (m) {
      ["weekday", "sunday"].forEach(function (kind) {
        const input = el("rate-" + kind + "-" + m);
        input.addEventListener("change", function () {
          const v = Math.max(0, Math.round(Number(input.value) || 0));
          input.value = v;
          state.rates[kind][m] = v;
          saveSettings();
          updateRateTotals();
          renderMeals();
          renderSummary();
        });
      });
    });
  }

  function exportData() {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "meal-tracker-" + todayKey() + ".json";
    a.click();
    URL.revokeObjectURL(url);
  }

  // ---- UI utilities ------------------------------------------------------
  function show(viewId) {
    ["setupBanner", "authView", "appView"].forEach(function (id) {
      el(id).classList.toggle("hidden", id !== viewId);
    });
  }

  let toastTimer = null;
  function toast(msg) {
    const t = el("toast");
    t.textContent = msg;
    t.classList.remove("hidden");
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.add("hidden"); }, 3200);
  }
})();
