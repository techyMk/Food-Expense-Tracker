import { useCallback, useEffect, useRef, useState } from "react";
import { MEALS, FACTORY_RATES, cloneRates, mergeRates } from "./constants";
import { todayKey, monthTag, isSunday } from "./dateUtils";

/**
 * Rates + meal entries + per-day status for one person, written straight through
 * to the API. `dataApi` comes from `mealApi(userId)` — pass a memoised object.
 *
 * `seedRates` is for your own account only: the first time you sign in we persist
 * the factory rates. Viewing someone else must never write on their behalf.
 *
 * `enabled: false` skips every call — providers have no meals of their own, so
 * there is nothing to fetch and no settings row to create for them.
 */
export default function useMealData(dataApi, { onError, seedRates = false, enabled = true } = {}) {
  const [rates, setRates] = useState(() => cloneRates(FACTORY_RATES));
  const [days, setDays] = useState({}); // { "YYYY-MM-DD": { morning: {taken, amount}, ... } }
  const [dayStatus, setDayStatus] = useState({}); // date -> { noMeal, adjustment, note }
  const [loading, setLoading] = useState(true);
  const loadedMonths = useRef(new Set());

  // Keep the error reporter out of the callback deps — toasts are recreated freely.
  const errRef = useRef(onError);
  errRef.current = onError;
  const fail = useCallback((msg) => errRef.current && errRef.current(msg), []);

  // A fresh subject means a fresh cache.
  useEffect(() => {
    loadedMonths.current = new Set();
    setDays({});
    setDayStatus({});
    setRates(cloneRates(FACTORY_RATES));
    setLoading(true);
  }, [dataApi]);

  const defaultRateFor = useCallback(
    (key, meal) => Number((isSunday(key) ? rates.sunday : rates.weekday)[meal]) || 0,
    [rates]
  );

  const recordFor = useCallback((key) => {
    const stored = days[key];
    const rec = {};
    for (const m of MEALS) {
      const s = stored && stored[m];
      rec[m] = {
        taken: s ? !!s.taken : false,
        amount: s && s.amount != null ? Number(s.amount) : defaultRateFor(key, m),
      };
    }
    return rec;
  }, [days, defaultRateFor]);

  const statusFor = useCallback(
    (key) => dayStatus[key] || { noMeal: false, adjustment: 0, note: "" },
    [dayStatus]
  );

  // ---- Loading ----
  const loadSettings = useCallback(async () => {
    if (!enabled) return;
    try {
      const { rates: saved } = await dataApi.getSettings();
      if (saved) {
        setRates(mergeRates(saved));
      } else {
        const fresh = cloneRates(FACTORY_RATES);
        setRates(fresh);
        if (seedRates) await dataApi.saveSettings(fresh);
      }
    } catch {
      fail("Could not load rates.");
    }
  }, [dataApi, seedRates, enabled, fail]);

  const ensureMonthLoaded = useCallback(async (key) => {
    if (!enabled) return;
    const tag = monthTag(key);
    if (loadedMonths.current.has(tag)) return;
    loadedMonths.current.add(tag);
    try {
      const { entries, status } = await dataApi.getMeals(tag);
      setDays((prev) => {
        const next = { ...prev };
        for (const row of entries || []) {
          next[row.date] = {
            ...(next[row.date] || {}),
            [row.meal]: { taken: !!row.taken, amount: Number(row.amount) },
          };
        }
        return next;
      });
      if (status) setDayStatus((prev) => ({ ...prev, ...status }));
    } catch {
      loadedMonths.current.delete(tag);
      fail("Couldn't load that month.");
    }
  }, [dataApi, enabled, fail]);

  useEffect(() => {
    let alive = true;
    (async () => {
      await Promise.all([loadSettings(), ensureMonthLoaded(todayKey())]);
      if (alive) setLoading(false);
    })();
    return () => { alive = false; };
  }, [loadSettings, ensureMonthLoaded]);

  // ---- Mutations (optimistic, written through to the API) ----
  const setMeal = useCallback((key, meal, patch) => {
    const cur = (days[key] || {})[meal] || { taken: false, amount: defaultRateFor(key, meal) };
    const nextVal = { ...cur, ...patch };
    setDays((prev) => ({ ...prev, [key]: { ...(prev[key] || {}), [meal]: nextVal } }));
    dataApi.saveMeal({ date: key, meal, taken: nextVal.taken, amount: nextVal.amount })
      .catch(() => fail("Save failed — try again."));
  }, [days, dataApi, defaultRateFor, fail]);

  const updateDayStatus = useCallback((key, patch) => {
    const next = { ...statusFor(key), ...patch };
    setDayStatus((prev) => ({ ...prev, [key]: next }));
    dataApi.setDayStatus(key, next).catch(() => fail("Couldn't save — try again."));
  }, [statusFor, dataApi, fail]);

  const saveRates = useCallback((next) => {
    setRates(next);
    dataApi.saveSettings(next).catch(() => fail("Could not save rates."));
  }, [dataApi, fail]);

  const updateRate = useCallback((kind, meal, value) => {
    saveRates({ ...rates, [kind]: { ...rates[kind], [meal]: value } });
  }, [rates, saveRates]);

  const resetRates = useCallback(() => saveRates(cloneRates(FACTORY_RATES)), [saveRates]);

  return {
    rates, days, dayStatus, loading,
    recordFor, statusFor, defaultRateFor,
    ensureMonthLoaded, setMeal, updateDayStatus, updateRate, resetRates,
  };
}
