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

const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "today 4:12 PM" · "yesterday 9:05 AM" · "19 Sep, 9:05 AM" — for audit stamps. */
export const formatStamp = (iso) => {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const time = d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  const key = keyFromDate(d);
  if (key === todayKey()) return `today ${time}`;
  const y = new Date();
  y.setDate(y.getDate() - 1);
  if (key === keyFromDate(y)) return `yesterday ${time}`;
  return `${d.getDate()} ${MONTH_SHORT[d.getMonth()]}, ${time}`;
};

/** Who an audit stamp belongs to, from the viewer's point of view. */
export const actorLabel = (email, viewerEmail) => {
  if (!email) return "";
  return email === viewerEmail ? "you" : email;
};

/** Same, trimmed to the local part — for the tight inline stamps on a meal row. */
export const shortActor = (email, viewerEmail) => {
  if (!email) return "";
  if (email === viewerEmail) return "you";
  return email.split("@")[0];
};
