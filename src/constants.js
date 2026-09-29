import { Sunrise, Sun, Moon } from "lucide-react";

export const MEALS = ["morning", "afternoon", "night"];

export const MEAL_META = {
  morning: { label: "Morning", Icon: Sunrise, sub: "Breakfast" },
  afternoon: { label: "Afternoon", Icon: Sun, sub: "Lunch" },
  night: { label: "Night", Icon: Moon, sub: "Dinner" },
};

// Weekday 45/60/45 = 150, Sunday 45/90/45 = 180 (all editable per user).
export const FACTORY_RATES = {
  weekday: { morning: 45, afternoon: 60, night: 45 },
  sunday: { morning: 45, afternoon: 90, night: 45 },
};

// Rates rose by ₹10 a meal on 1 September 2026. Days before that keep the old
// numbers, so browsing — or back-filling — an earlier month never inherits
// today's prices. Already-logged days are unaffected either way: each entry
// stores the amount it was saved with.
export const RATES_EFFECTIVE_FROM = "2026-09-01";
export const LEGACY_RATES = {
  weekday: { morning: 35, afternoon: 50, night: 35 },
  sunday: { morning: 35, afternoon: 80, night: 35 },
};

/** Which rate table pre-fills a given day. Date keys sort as strings. */
export const ratesForDate = (dateKey, current) =>
  dateKey < RATES_EFFECTIVE_FROM ? LEGACY_RATES : current;

export const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
export const MONTH_NAMES = ["January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"];

export const cloneRates = (r) => ({ weekday: { ...r.weekday }, sunday: { ...r.sunday } });
export const mergeRates = (r) => ({
  weekday: { ...FACTORY_RATES.weekday, ...(r && r.weekday) },
  sunday: { ...FACTORY_RATES.sunday, ...(r && r.sunday) },
});
