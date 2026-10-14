import type { Pool } from "pg";
import {
  addDays,
  expandOccurrences,
  normalizeSections,
  pickNext,
  shanghaiDateKey,
  weekNumber,
  type CourseExceptionInput,
  type CourseOccurrence,
  type CourseTemplateInput,
  type Section,
} from "../lib/timetable.js";

export interface SemesterRecord {
  id: string;
  name: string;
  startDate: string;
  sections: Section[];
  note: string;
  updatedAt: string;
}

export interface TimetableChange {
  id: string;
  date: string;
  kind: CourseExceptionInput["kind"];
  title: string;
  note: string;
}

export interface SyncTimetable {
  version: string | null;
  semester: {
    id: string;
    name: string;
    startDate: string;
    currentWeek: number;
    sections: Section[];
    note: string;
  } | null;
  today: CourseOccurrence[];
  next: CourseOccurrence | null;
  upcoming: CourseOccurrence[];
  changes: TimetableChange[];
}

/**
 * 注意：`date` 列一律用 ::text 取出。node-postgres 会把 date 解析成本地时区的 Date，
 * 直接用会差一天。
 */
export async function loadActiveSemester(pool: Pool): Promise<SemesterRecord | null> {
  const result = await pool.query(
    `SELECT id, name, start_date::text AS start_date, sections, note, updated_at
       FROM semesters WHERE active LIMIT 1`,
  );
  const row = result.rows[0];
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    startDate: String(row.start_date),
    sections: normalizeSections(row.sections),
    note: row.note ?? "",
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

export async function loadTemplates(pool: Pool, semesterId: string): Promise<CourseTemplateInput[]> {
  const result = await pool.query(
    `SELECT id, name, course_code, class_no, teachers, location, weekday, period_start, period_end, weeks, note
       FROM course_templates WHERE semester_id = $1 AND active ORDER BY weekday, period_start, name`,
    [semesterId],
  );
  return result.rows.map((row) => ({
    id: row.id,
    name: row.name,
    courseCode: row.course_code ?? "",
    classNo: row.class_no ?? "",
    teachers: row.teachers ?? "",
    location: row.location ?? "",
    weekday: Number(row.weekday),
    periodStart: Number(row.period_start),
    periodEnd: Number(row.period_end),
    weeks: (row.weeks ?? []).map(Number),
    note: row.note ?? "",
  }));
}

export async function loadExceptions(pool: Pool, semesterId: string, from: string, to: string): Promise<CourseExceptionInput[]> {
  const result = await pool.query(
    `SELECT id, template_id, date::text AS date, kind, title, new_start_at, new_end_at, new_location, note
       FROM course_exceptions
      WHERE semester_id = $1 AND date BETWEEN $2 AND $3
      ORDER BY date`,
    [semesterId, from, to],
  );
  return result.rows.map((row) => ({
    id: row.id,
    templateId: row.template_id ?? null,
    date: String(row.date),
    kind: row.kind,
    title: row.title ?? "",
    newStartAt: row.new_start_at ? new Date(row.new_start_at).toISOString() : null,
    newEndAt: row.new_end_at ? new Date(row.new_end_at).toISOString() : null,
    newLocation: row.new_location ?? "",
    note: row.note ?? "",
  }));
}

export interface TimetableWindow {
  semester: SemesterRecord;
  templates: CourseTemplateInput[];
  exceptions: CourseExceptionInput[];
  occurrences: CourseOccurrence[];
}

/** 读取指定日期区间的课表（含已合并的例外）。 */
export async function loadTimetableWindow(pool: Pool, from: string, to: string): Promise<TimetableWindow | null> {
  const semester = await loadActiveSemester(pool);
  if (!semester) return null;
  const [templates, exceptions] = await Promise.all([
    loadTemplates(pool, semester.id),
    loadExceptions(pool, semester.id, from, to),
  ]);
  const occurrences = expandOccurrences({
    startDate: semester.startDate,
    sections: semester.sections,
    templates,
    exceptions,
    from,
    to,
  });
  return { semester, templates, exceptions, occurrences };
}

/** `/api/sync` 里的课表片段：今天 + 下一节课 + 未来 7 天 + 未过期的变更。 */
export async function buildSyncTimetable(pool: Pool, nowIso: string): Promise<SyncTimetable> {
  const semester = await loadActiveSemester(pool);
  if (!semester) {
    return { version: null, semester: null, today: [], next: null, upcoming: [], changes: [] };
  }
  const today = shanghaiDateKey(nowIso);
  const horizonEnd = addDays(today, 13);
  const [templates, exceptions, changeRows] = await Promise.all([
    loadTemplates(pool, semester.id),
    loadExceptions(pool, semester.id, today, horizonEnd),
    pool.query(
      `SELECT e.id, e.date::text AS date, e.kind, e.note, e.title, t.name AS template_name
         FROM course_exceptions e
         LEFT JOIN course_templates t ON t.id = e.template_id
        WHERE e.semester_id = $1 AND e.date BETWEEN $2 AND $3
        ORDER BY e.date`,
      [semester.id, today, addDays(today, 30)],
    ),
  ]);

  const occurrences = expandOccurrences({
    startDate: semester.startDate,
    sections: semester.sections,
    templates,
    exceptions,
    from: today,
    to: horizonEnd,
  });
  const weekEnd = addDays(today, 6);

  return {
    version: semester.updatedAt,
    semester: {
      id: semester.id,
      name: semester.name,
      startDate: semester.startDate,
      currentWeek: weekNumber(today, semester.startDate),
      sections: semester.sections,
      note: semester.note,
    },
    today: occurrences.filter((occurrence) => occurrence.date === today),
    next: pickNext(occurrences, nowIso),
    upcoming: occurrences.filter((occurrence) => occurrence.date <= weekEnd),
    changes: changeRows.rows.map((row) => ({
      id: row.id,
      date: String(row.date),
      kind: row.kind,
      title: row.title || row.template_name || "课程",
      note: row.note ?? "",
    })),
  };
}