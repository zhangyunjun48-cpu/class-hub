import { formatInTimeZone, fromZonedTime } from "date-fns-tz";

export const SHANGHAI_TIME_ZONE = "Asia/Shanghai";

export function fromShanghaiInput(value) {
  if (!value) return null;
  return fromZonedTime(value, SHANGHAI_TIME_ZONE).toISOString();
}

export function toShanghaiInput(value) {
  if (!value) return "";
  return formatInTimeZone(value, SHANGHAI_TIME_ZONE, "yyyy-MM-dd'T'HH:mm");
}

export function formatShanghai(value, pattern = "M月d日 EEEE") {
  if (!value) return "";
  return formatInTimeZone(value, SHANGHAI_TIME_ZONE, pattern);
}

export function dateKeyShanghai(value) {
  if (!value) return "";
  return formatInTimeZone(value, SHANGHAI_TIME_ZONE, "yyyy-MM-dd");
}

export function relativeDayShanghai(value, now = new Date()) {
  if (!value) return "";
  const target = dateKeyShanghai(value);
  const today = dateKeyShanghai(now.toISOString());
  const targetDate = new Date(`${target}T00:00:00.000Z`);
  const todayDate = new Date(`${today}T00:00:00.000Z`);
  const diff = Math.round((targetDate - todayDate) / 86400000);
  if (diff === 0) return "今天";
  if (diff === 1) return "明天";
  if (diff === 2) return "后天";
  if (diff < 0) return `已过 ${Math.abs(diff)} 天`;
  return `${diff} 天后`;
}

export function addShanghaiDaysToIso(days, hour = 9, minute = 0, now = new Date()) {
  const currentDay = dateKeyShanghai(now.toISOString());
  const base = new Date(`${currentDay}T12:00:00.000Z`);
  base.setUTCDate(base.getUTCDate() + days);
  const targetDay = base.toISOString().slice(0, 10);
  const time = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00`;
  return fromShanghaiInput(`${targetDay}T${time}`);
}
