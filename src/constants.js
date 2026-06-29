export const MEALS = ["morning", "afternoon", "night"];

export const MEAL_META = {
  morning: { label: "Morning", icon: "🌅", sub: "Breakfast" },
  afternoon: { label: "Afternoon", icon: "☀️", sub: "Lunch" },
  night: { label: "Night", icon: "🌙", sub: "Dinner" },
};

// Weekday 35/50/35 = 120, Sunday 35/80/35 = 150 (all editable per user).
export const FACTORY_RATES = {
  weekday: { morning: 35, afternoon: 50, night: 35 },
  sunday: { morning: 35, afternoon: 80, night: 35 },
};

export const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
export const MONTH_NAMES = ["January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"];

export const cloneRates = (r) => ({ weekday: { ...r.weekday }, sunday: { ...r.sunday } });
export const mergeRates = (r) => ({
  weekday: { ...FACTORY_RATES.weekday, ...(r && r.weekday) },
  sunday: { ...FACTORY_RATES.sunday, ...(r && r.sunday) },
});
