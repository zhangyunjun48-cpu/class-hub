import { formatShanghai } from "../demo/time.js";

export const WEEKDAY_SHORT = ["", "周一", "周二", "周三", "周四", "周五", "周六", "周日"];

export const formatTimeRange = (startAt, endAt) =>
  `${formatShanghai(startAt, "HH:mm")}–${formatShanghai(endAt, "HH:mm")}`;

export const formatDayLabel = (dateKey) => formatShanghai(`${dateKey}T00:00:00+08:00`, "M月d日 EEEE");

export const dateKeyOf = (value) => formatShanghai(value, "yyyy-MM-dd");

export const addDays = (dateKey, days) => {
  const base = new Date(`${dateKey}T00:00:00.000Z`);
  base.setUTCDate(base.getUTCDate() + days);
  return base.toISOString().slice(0, 10);
};

/** 归一到所在周的周一。 */
export const startOfWeek = (dateKey) => {
  const day = new Date(`${dateKey}T00:00:00.000Z`).getUTCDay();
  return addDays(dateKey, -((day === 0 ? 7 : day) - 1));
};

export function groupByDate(occurrences) {
  const groups = new Map();
  for (const item of occurrences ?? []) {
    if (!groups.has(item.date)) groups.set(item.date, []);
    groups.get(item.date).push(item);
  }
  return [...groups.entries()].sort(([left], [right]) => left.localeCompare(right));
}

export const sameRange = (occurrences) => (occurrences ?? []).length > 0;

/** 未来 30 天内、且日期不早于今天的变更。 */
export function activeChanges(changes, todayKey) {
  return (changes ?? []).filter((item) => item.date >= todayKey).slice(0, 6);
}

export const exceptionKindLabel = (kind) =>
  kind === "cancel" ? "停课" : kind === "move" ? "已调课" : kind === "add" ? "补课" : "";
/** "4-18" / "1-3,5" → [4..18] / [1,2,3,5] */
export function parseWeeksText(text) {
  const weeks = new Set();
  for (const match of String(text ?? "").matchAll(/(\d{1,2})(?:\s*[-–~]\s*(\d{1,2}))?/g)) {
    const from = Number(match[1]);
    const to = match[2] ? Number(match[2]) : from;
    if (!Number.isFinite(from) || !Number.isFinite(to)) continue;
    const start = Math.max(1, Math.min(from, to));
    const end = Math.min(30, Math.max(from, to));
    for (let week = start; week <= end; week += 1) weeks.add(week);
  }
  return [...weeks].sort((left, right) => left - right);
}

export function formatWeeksText(weeks) {
  const sorted = [...new Set(weeks ?? [])].sort((left, right) => left - right);
  if (!sorted.length) return "";
  const parts = [];
  let start = sorted[0];
  let previous = sorted[0];
  for (let index = 1; index <= sorted.length; index += 1) {
    const current = sorted[index];
    if (current !== undefined && current === previous + 1) { previous = current; continue; }
    parts.push(start === previous ? String(start) : `${start}-${previous}`);
    if (current === undefined) break;
    start = current;
    previous = current;
  }
  return parts.join(",");
}