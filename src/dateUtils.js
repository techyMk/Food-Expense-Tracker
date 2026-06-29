export const pad = (n) => (n < 10 ? "0" + n : "" + n);

export const keyFromDate = (d) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export const dateFromKey = (key) => {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
};

export const todayKey = () => keyFromDate(new Date());
export const isSunday = (key) => dateFromKey(key).getDay() === 0;
export const monthTag = (key) => {
  const d = dateFromKey(key);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
};

export const clampInt = (v) => Math.max(0, Math.round(Number(v) || 0));
export const nowIso = () => new Date().toISOString();
