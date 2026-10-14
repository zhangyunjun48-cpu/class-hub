/**
 * 课表核心逻辑：周次解析、第几周计算、按周次展开成具体日期的课程实例、例外合并。
 *
 * 时区：全部按 Asia/Shanghai 处理。中国自 1991 年起不再使用夏令时，
 * 因此固定 +08:00 是安全的（见 timetable.test.ts 中的偏移断言），
 * 这样服务端不需要引入 date-fns-tz 之类的依赖。
 */

export const SHANGHAI_TIME_ZONE = "Asia/Shanghai";
export const SHANGHAI_OFFSET = "+08:00";
export const MIN_WEEK = 1;
export const MAX_WEEK = 30;

export interface Section {
  no: number;
  start: string;
  end: string;
}

/** 默认节次时间（来自山大软件园校区课表）。 */
export const DEFAULT_SECTIONS: Section[] = [
  { no: 1, start: "08:00", end: "09:50" },
  { no: 2, start: "10:10", end: "12:00" },
  { no: 3, start: "14:00", end: "15:50" },
  { no: 4, start: "16:10", end: "18:00" },
  { no: 5, start: "19:00", end: "20:50" },
];

export const WEEKDAY_KEYS = ["", "星期一", "星期二", "星期三", "星期四", "星期五", "星期六", "星期日"] as const;
export const weekdayLabel = (weekday: number) => (weekday >= 1 && weekday <= 7 ? WEEKDAY_KEYS[weekday] : "");

const dateKeyFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: SHANGHAI_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** 取某个时刻在 Asia/Shanghai 的 YYYY-MM-DD。 */
export function shanghaiDateKey(value: Date | string = new Date()): string {
  const date = value instanceof Date ? value : new Date(value);
  const parts = dateKeyFormatter.formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value ?? "";
  const month = parts.find((part) => part.type === "month")?.value ?? "";
  const day = parts.find((part) => part.type === "day")?.value ?? "";
  return `${year}-${month}-${day}`;
}

export const isDateKey = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));

export function addDays(dateKey: string, days: number): string {
  const base = new Date(`${dateKey}T00:00:00.000Z`);
  base.setUTCDate(base.getUTCDate() + days);
  return base.toISOString().slice(0, 10);
}

export const diffDays = (left: string, right: string) =>
  Math.round((Date.parse(`${left}T00:00:00Z`) - Date.parse(`${right}T00:00:00Z`)) / 86_400_000);

/** 1=周一 … 7=周日 */
export function weekdayOf(dateKey: string): number {
  const day = new Date(`${dateKey}T00:00:00.000Z`).getUTCDay();
  return day === 0 ? 7 : day;
}

/** 把任意日期归一到它所在周的周一。 */
export function normalizeToMonday(dateKey: string): string {
  return addDays(dateKey, -(weekdayOf(dateKey) - 1));
}

/** 第几周：第 1 周从学期起始周的周一开始。 */
export function weekNumber(dateKey: string, semesterStart: string): number {
  return Math.floor(diffDays(dateKey, normalizeToMonday(semesterStart)) / 7) + 1;
}

/** 组装某个日期某个时刻的 ISO 字符串（+08:00）。 */
export function toIsoAt(dateKey: string, hhmm: string): string {
  return new Date(`${dateKey}T${hhmm}:00${SHANGHAI_OFFSET}`).toISOString();
}

/** 从 "第4-18周([周])[01-02节]" 里取出周次片段 "4-18"。 */
export function extractWeekText(value: string): string {
  const match = String(value).match(/第\s*(\d+(?:\s*[-–~]\s*\d+)?(?:\s*[,，、]\s*\d+(?:\s*[-–~]\s*\d+)?)*)\s*周/);
  return match?.[1]?.replace(/\s+/g, "") ?? "";
}

/** "4-18" / "1-3,5" / "6" → [4..18] / [1,2,3,5] / [6] */
export function parseWeeks(text: string): number[] {
  const weeks = new Set<number>();
  for (const match of String(text).matchAll(/(\d{1,2})(?:\s*[-–~]\s*(\d{1,2}))?/g)) {
    const from = Number(match[1]);
    const to = match[2] ? Number(match[2]) : from;
    if (!Number.isFinite(from) || !Number.isFinite(to)) continue;
    const start = Math.max(MIN_WEEK, Math.min(from, to));
    const end = Math.min(MAX_WEEK, Math.max(from, to));
    for (let week = start; week <= end; week += 1) weeks.add(week);
  }
  return [...weeks].sort((left, right) => left - right);
}

/** 小节号（01-11）→ 节次号（1-5）。第 N 节 = 第 2N-1、2N 小节。 */
export const smallSectionToPeriod = (smallSection: number) =>
  Math.min(5, Math.max(1, Math.ceil(smallSection / 2)));

/** 从 "[01-08节]" 解析出节次区间。 */
export function parsePeriodRange(value: string): { start: number; end: number } | null {
  const match = String(value).match(/\[([\d\s\-–~]+)\s*节\s*\]/);
  if (!match) return null;
  const numbers = (match[1] ?? "")
    .split(/[-–~]/)
    .map((part) => Number(part.trim()))
    .filter((part) => Number.isFinite(part));
  if (!numbers.length) return null;
  return { start: smallSectionToPeriod(Math.min(...numbers)), end: smallSectionToPeriod(Math.max(...numbers)) };
}

/** 把外部传入的节次表规范化；缺项或格式错误时回退到默认表。 */
export function normalizeSections(input: unknown): Section[] {
  if (!Array.isArray(input)) return DEFAULT_SECTIONS.map((section) => ({ ...section }));
  const parsed: Section[] = [];
  for (const item of input) {
    const record = (item ?? {}) as Record<string, unknown>;
    const no = Number(record.no);
    const start = String(record.start ?? "");
    const end = String(record.end ?? "");
    if (!Number.isInteger(no) || no < 1 || no > 5) continue;
    if (!/^\d{2}:\d{2}$/.test(start) || !/^\d{2}:\d{2}$/.test(end)) continue;
    parsed.push({ no, start, end });
  }
  if (parsed.length !== 5) return DEFAULT_SECTIONS.map((section) => ({ ...section }));
  return parsed.sort((left, right) => left.no - right.no);
}

/** 课表模板（一门课在一周中的固定位置）。 */
export interface CourseTemplateInput {
  id: string;
  name: string;
  courseCode: string;
  classNo: string;
  teachers: string;
  location: string;
  weekday: number;
  periodStart: number;
  periodEnd: number;
  weeks: number[];
  note: string;
}

/** 例外：停课 / 调课 / 补课。 */
export interface CourseExceptionInput {
  id: string;
  templateId: string | null;
  date: string;
  kind: "cancel" | "move" | "add";
  title: string;
  newStartAt: string | null;
  newEndAt: string | null;
  newLocation: string;
  note: string;
}

export interface CourseOccurrence {
  id: string;
  templateId: string | null;
  date: string;
  weekday: number;
  weekNo: number;
  title: string;
  teachers: string;
  location: string;
  courseCode: string;
  classNo: string;
  periodStart: number;
  periodEnd: number;
  startAt: string;
  endAt: string;
  changed: boolean;
  exceptionKind: CourseExceptionInput["kind"] | null;
  exceptionNote: string;
}

const orDefault = <T,>(value: T | undefined, fallback: T): T => (value === undefined ? fallback : value);

export function expandOccurrences(input: {
  startDate: string;
  sections: Section[];
  templates: CourseTemplateInput[];
  exceptions: CourseExceptionInput[];
  from: string;
  to: string;
}): CourseOccurrence[] {
  const semesterStart = normalizeToMonday(input.startDate);
  const sectionOf = (no: number): Section =>
    orDefault(input.sections.find((section) => section.no === no), orDefault(DEFAULT_SECTIONS[no - 1], DEFAULT_SECTIONS[0]!));

  const keyed = new Map<string, CourseExceptionInput>();
  const adds: CourseExceptionInput[] = [];
  for (const exception of input.exceptions) {
    if (exception.kind === "add") adds.push(exception);
    else if (exception.templateId) keyed.set(`${exception.templateId}|${exception.date}`, exception);
  }

  const occurrences: CourseOccurrence[] = [];
  const totalDays = diffDays(input.to, input.from);
  for (let offset = 0; offset <= totalDays; offset += 1) {
    const date = addDays(input.from, offset);
    const weekNo = weekNumber(date, semesterStart);
    if (weekNo < MIN_WEEK) continue;
    const weekday = weekdayOf(date);
    for (const template of input.templates) {
      if (template.weekday !== weekday || !template.weeks.includes(weekNo)) continue;
      const exception = keyed.get(`${template.id}|${date}`);
      if (exception?.kind === "cancel") continue;
      let startAt = toIsoAt(date, sectionOf(template.periodStart).start);
      let endAt = toIsoAt(date, sectionOf(template.periodEnd).end);
      let location = template.location;
      if (exception?.kind === "move") {
        if (exception.newStartAt) startAt = new Date(exception.newStartAt).toISOString();
        if (exception.newEndAt) endAt = new Date(exception.newEndAt).toISOString();
        if (exception.newLocation) location = exception.newLocation;
      }
      occurrences.push({
        id: `${template.id}:${date}`,
        templateId: template.id,
        date,
        weekday,
        weekNo,
        title: template.name,
        teachers: template.teachers,
        location,
        courseCode: template.courseCode,
        classNo: template.classNo,
        periodStart: template.periodStart,
        periodEnd: template.periodEnd,
        startAt,
        endAt,
        changed: Boolean(exception),
        exceptionKind: exception?.kind ?? null,
        exceptionNote: exception?.note ?? "",
      });
    }
  }

  for (const exception of adds) {
    if (diffDays(exception.date, input.from) < 0 || diffDays(exception.date, input.to) > 0) continue;
    const template = exception.templateId ? input.templates.find((item) => item.id === exception.templateId) : undefined;
    const periodStart = template?.periodStart ?? 1;
    const periodEnd = template?.periodEnd ?? periodStart;
    occurrences.push({
      id: exception.id,
      templateId: template?.id ?? null,
      date: exception.date,
      weekday: weekdayOf(exception.date),
      weekNo: weekNumber(exception.date, semesterStart),
      title: exception.title || template?.name || "补课",
      teachers: template?.teachers ?? "",
      location: exception.newLocation || template?.location || "",
      courseCode: template?.courseCode ?? "",
      classNo: template?.classNo ?? "",
      periodStart,
      periodEnd,
      startAt: exception.newStartAt ? new Date(exception.newStartAt).toISOString() : toIsoAt(exception.date, sectionOf(periodStart).start),
      endAt: exception.newEndAt ? new Date(exception.newEndAt).toISOString() : toIsoAt(exception.date, sectionOf(periodEnd).end),
      changed: true,
      exceptionKind: "add",
      exceptionNote: exception.note,
    });
  }

  return occurrences.sort(
    (left, right) => left.startAt.localeCompare(right.startAt) || left.title.localeCompare(right.title, "zh-CN"),
  );
}

/** 把周次数组压缩成 "4-18周" / "1-3,5周" 这样的展示文本。 */
export function formatWeeks(weeks: number[]): string {
  const sorted = [...new Set(weeks)].filter((week) => Number.isInteger(week)).sort((left, right) => left - right);
  if (!sorted.length) return "";
  const parts: string[] = [];
  let start = sorted[0]!;
  let previous = sorted[0]!;
  for (let index = 1; index <= sorted.length; index += 1) {
    const current = sorted[index];
    if (current !== undefined && current === previous + 1) {
      previous = current;
      continue;
    }
    parts.push(start === previous ? String(start) : `${start}-${previous}`);
    if (current === undefined) break;
    start = current;
    previous = current;
  }
  return `${parts.join(",")}周`;
}

/** 从实例列表里找「下一节课」（尚未结束的第一节）。 */
export function pickNext(occurrences: CourseOccurrence[], nowIso: string): CourseOccurrence | null {
  return occurrences.find((occurrence) => occurrence.endAt > nowIso) ?? null;
}