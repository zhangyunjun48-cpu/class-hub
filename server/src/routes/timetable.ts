import type { FastifyInstance } from "fastify";
import type { Pool, PoolClient } from "pg";
import { z } from "zod";
import type { ServerEnvironment } from "../config/env.js";
import { HttpError } from "../lib/http-error.js";
import {
  addDays,
  expandOccurrences,
  isDateKey,
  normalizeSections,
  normalizeToMonday,
  parseWeeks,
  shanghaiDateKey,
  weekNumber,
} from "../lib/timetable.js";
import { parseTimetableGrid, suggestDefaultWeeks } from "../lib/timetable-csv.js";
import { requireMember, requireRecentAdmin } from "../services/auth.js";
import { loadActiveSemester, loadExceptions, loadTemplates, loadTimetableWindow } from "../services/timetable.js";

interface TimetableRouteOptions { pool: Pool; environment: ServerEnvironment; }

const MAX_RANGE_DAYS = 62;

const sectionSchema = z.object({
  no: z.coerce.number().int().min(1).max(5),
  start: z.string().regex(/^\d{2}:\d{2}$/),
  end: z.string().regex(/^\d{2}:\d{2}$/),
});

const templateInputSchema = z.object({
  name: z.string().trim().min(1).max(80),
  courseCode: z.string().trim().max(40).default(""),
  classNo: z.string().trim().max(20).default(""),
  teachers: z.string().trim().max(160).default(""),
  location: z.string().trim().max(120).default(""),
  weekday: z.coerce.number().int().min(1).max(7),
  periodStart: z.coerce.number().int().min(1).max(5),
  periodEnd: z.coerce.number().int().min(1).max(5),
  weeks: z.array(z.coerce.number().int().min(1).max(30)).min(1).max(30),
  note: z.string().trim().max(120).default(""),
}).refine((value) => value.periodEnd >= value.periodStart, { message: "结束节次不能早于开始节次", path: ["periodEnd"] });

const commitSchema = z.object({
  semesterName: z.string().trim().min(1).max(40),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  sections: z.array(sectionSchema).length(5),
  note: z.string().trim().max(300).default(""),
  templates: z.array(templateInputSchema).min(1).max(300),
});

const exceptionSchema = z.object({
  templateId: z.string().uuid().nullable().optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  kind: z.enum(["cancel", "move", "add"]),
  title: z.string().trim().max(80).default(""),
  newStartAt: z.string().datetime({ offset: true }).nullable().optional(),
  newEndAt: z.string().datetime({ offset: true }).nullable().optional(),
  newLocation: z.string().trim().max(120).default(""),
  note: z.string().trim().max(200).default(""),
});

async function writeRevision(
  client: Pool | PoolClient,
  actor: { id: string; name: string },
  action: string,
  entityId: string,
  summary: string,
  after: unknown,
) {
  await client.query(
    `INSERT INTO revisions (action, entity_type, entity_id, summary, actor_id, actor_nickname, before_json, after_json)
     VALUES ($1, 'timetable', $2, $3, $4, $5, NULL, $6)`,
    [action, entityId, summary, actor.id, actor.name, after ? JSON.stringify(after) : null],
  );
}

const touchSemester = (client: Pool | PoolClient, semesterId: string) =>
  client.query("UPDATE semesters SET updated_at = now() WHERE id = $1", [semesterId]);

export async function registerTimetableRoutes(app: FastifyInstance, options: TimetableRouteOptions) {
  const { pool, environment } = options;

  app.get("/api/timetable", async (request) => {
    await requireMember(pool, request);
    const query = request.query as { from?: string; to?: string };
    const today = shanghaiDateKey();
    const from = query.from && isDateKey(query.from) ? query.from : today;
    let to = query.to && isDateKey(query.to) ? query.to : addDays(from, 13);
    if (to < from) [to] = [from];
    const span = Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
    if (span > MAX_RANGE_DAYS) throw new HttpError(400, "VALIDATION_ERROR", `一次最多查询 ${MAX_RANGE_DAYS} 天`);

    const window = await loadTimetableWindow(pool, from, to);
    if (!window) {
      return { semester: null, occurrences: [], todayKey: today, range: { from, to } };
    }
    return {
      semester: {
        id: window.semester.id,
        name: window.semester.name,
        startDate: window.semester.startDate,
        currentWeek: weekNumber(today, window.semester.startDate),
        sections: window.semester.sections,
        note: window.semester.note,
        updatedAt: window.semester.updatedAt,
      },
      occurrences: window.occurrences,
      range: { from, to },
      todayKey: today,
    };
  });

  app.post("/api/admin/timetable/preview", async (request) => {
    await requireRecentAdmin(pool, request, environment.ADMIN_REAUTH_MINUTES);
    const parsed = z.object({
      content: z.string().min(1).max(2_000_000),
      defaultWeeks: z.string().trim().max(200).default(""),
      startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    }).safeParse(request.body);
    if (!parsed.success) throw new HttpError(400, "VALIDATION_ERROR", "请粘贴或选择课表 CSV 内容");

    const defaultWeeks = parseWeeks(parsed.data.defaultWeeks);
    const result = parseTimetableGrid(parsed.data.content, { defaultWeeks });
    const suggested = suggestDefaultWeeks(result.templates);

    let selfCheck: unknown = null;
    if (parsed.data.startDate && result.templates.length) {
      const startDate = normalizeToMonday(parsed.data.startDate);
      const today = shanghaiDateKey();
      const weekStart = normalizeToMonday(today);
      const occurrences = expandOccurrences({
        startDate,
        sections: result.sections,
        templates: result.templates.map((template, index) => ({ ...template, id: `preview-${index}` })),
        exceptions: [],
        from: weekStart,
        to: addDays(weekStart, 6),
      });
      selfCheck = {
        startDate,
        currentWeek: weekNumber(today, startDate),
        weekStart,
        weekEnd: addDays(weekStart, 6),
        thisWeek: occurrences,
      };
    }

    return {
      semesterName: result.semesterName,
      semesterNote: result.semesterNote,
      sections: result.sections,
      templates: result.templates,
      warnings: result.warnings,
      stats: result.stats,
      defaultWeeks,
      suggestedDefaultWeeks: suggested,
      selfCheck,
    };
  });

  app.post("/api/admin/timetable/commit", async (request) => {
    const admin = await requireRecentAdmin(pool, request, environment.ADMIN_REAUTH_MINUTES);
    const parsed = commitSchema.safeParse(request.body);
    if (!parsed.success) throw new HttpError(400, "VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "课表数据不正确");
    const payload = parsed.data;
    const sections = normalizeSections(payload.sections);

    const client = await pool.connect();
    let semesterId = "";
    try {
      await client.query("BEGIN");
      await client.query("UPDATE semesters SET active = false, updated_at = now() WHERE active");
      const inserted = await client.query(
        `INSERT INTO semesters (name, start_date, sections, note, active, created_by)
         VALUES ($1,$2,$3,$4,true,$5) RETURNING id`,
        [payload.semesterName, payload.startDate, JSON.stringify(sections), payload.note, admin.id],
      );
      semesterId = inserted.rows[0]?.id as string;
      for (const template of payload.templates) {
        await client.query(
          `INSERT INTO course_templates
             (semester_id, name, course_code, class_no, teachers, location, weekday, period_start, period_end, weeks, note, created_by, updated_by)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$12)`,
          [
            semesterId,
            template.name,
            template.courseCode,
            template.classNo,
            template.teachers,
            template.location,
            template.weekday,
            template.periodStart,
            template.periodEnd,
            template.weeks,
            template.note,
            admin.id,
          ],
        );
      }
      await writeRevision(client, admin, "timetable-commit", semesterId, `导入课表：${payload.semesterName}（${payload.templates.length} 门课）`, {
        semesterName: payload.semesterName,
        startDate: payload.startDate,
        templateCount: payload.templates.length,
      });
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
    return { ok: true, semesterId, templateCount: payload.templates.length };
  });

  app.patch("/api/admin/timetable/semester", async (request) => {
    const admin = await requireRecentAdmin(pool, request, environment.ADMIN_REAUTH_MINUTES);
    const parsed = z.object({
      name: z.string().trim().min(1).max(40).optional(),
      startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      sections: z.array(sectionSchema).length(5).optional(),
      note: z.string().trim().max(300).optional(),
    }).safeParse(request.body);
    if (!parsed.success) throw new HttpError(400, "VALIDATION_ERROR", "学期参数不正确");
    const semester = await loadActiveSemester(pool);
    if (!semester) throw new HttpError(404, "NOT_FOUND", "还没有导入课表");

    await pool.query(
      `UPDATE semesters SET name = $1, start_date = $2, sections = $3, note = $4, updated_at = now() WHERE id = $5`,
      [
        parsed.data.name ?? semester.name,
        parsed.data.startDate ?? semester.startDate,
        JSON.stringify(parsed.data.sections ? normalizeSections(parsed.data.sections) : semester.sections),
        parsed.data.note ?? semester.note,
        semester.id,
      ],
    );
    await writeRevision(pool, admin, "timetable-semester", semester.id, `调整学期设置：${parsed.data.name ?? semester.name}`, parsed.data);
    return { ok: true };
  });

  app.post("/api/admin/timetable/exceptions", async (request) => {
    const admin = await requireRecentAdmin(pool, request, environment.ADMIN_REAUTH_MINUTES);
    const parsed = exceptionSchema.safeParse(request.body);
    if (!parsed.success) throw new HttpError(400, "VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "例外参数不正确");
    const payload = parsed.data;
    const semester = await loadActiveSemester(pool);
    if (!semester) throw new HttpError(404, "NOT_FOUND", "还没有导入课表");

    let templateName = "";
    if (payload.templateId) {
      const template = await pool.query("SELECT name, semester_id FROM course_templates WHERE id = $1", [payload.templateId]);
      const row = template.rows[0];
      if (!row) throw new HttpError(404, "NOT_FOUND", "课程不存在");
      if (row.semester_id !== semester.id) throw new HttpError(400, "VALIDATION_ERROR", "课程不属于当前学期");
      templateName = row.name as string;
    }
    if (payload.kind === "add" && !payload.templateId && !payload.title) {
      throw new HttpError(400, "VALIDATION_ERROR", "补课需要填写课程名称");
    }

    const result = await pool.query(
      `INSERT INTO course_exceptions (semester_id, template_id, date, kind, title, new_start_at, new_end_at, new_location, note, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       ON CONFLICT (template_id, date) WHERE template_id IS NOT NULL AND kind IN ('cancel', 'move')
       DO UPDATE SET kind = EXCLUDED.kind, title = EXCLUDED.title, new_start_at = EXCLUDED.new_start_at,
                     new_end_at = EXCLUDED.new_end_at, new_location = EXCLUDED.new_location,
                     note = EXCLUDED.note, version = course_exceptions.version + 1, updated_at = now()
       RETURNING id`,
      [
        semester.id,
        payload.templateId ?? null,
        payload.date,
        payload.kind,
        payload.title,
        payload.newStartAt ?? null,
        payload.newEndAt ?? null,
        payload.newLocation,
        payload.note,
        admin.id,
      ],
    );
    const id = result.rows[0]?.id as string;

    await touchSemester(pool, semester.id);
    const label = payload.kind === "cancel" ? "停课" : payload.kind === "move" ? "调课" : "补课";
    await writeRevision(pool, admin, `timetable-${payload.kind}`, id, `${label}：${templateName || payload.title}（${payload.date}）`, payload);
    return { ok: true, id };
  });

  app.patch("/api/admin/timetable/exceptions/:id", async (request) => {
    const admin = await requireRecentAdmin(pool, request, environment.ADMIN_REAUTH_MINUTES);
    const id = (request.params as { id: string }).id;
    const parsed = exceptionSchema.partial().safeParse(request.body);
    if (!parsed.success) throw new HttpError(400, "VALIDATION_ERROR", "例外参数不正确");
    const current = (await pool.query("SELECT *, date::text AS date_key FROM course_exceptions WHERE id = $1", [id])).rows[0];
    if (!current) throw new HttpError(404, "NOT_FOUND", "例外记录不存在");
    await pool.query(
      `UPDATE course_exceptions SET date = $1, kind = $2, title = $3, new_start_at = $4, new_end_at = $5,
              new_location = $6, note = $7, version = version + 1, updated_at = now()
        WHERE id = $8`,
      [
        parsed.data.date ?? current.date_key,
        parsed.data.kind ?? current.kind,
        parsed.data.title ?? current.title,
        parsed.data.newStartAt ?? current.new_start_at,
        parsed.data.newEndAt ?? current.new_end_at,
        parsed.data.newLocation ?? current.new_location,
        parsed.data.note ?? current.note,
        id,
      ],
    );
    await touchSemester(pool, current.semester_id);
    await writeRevision(pool, admin, "timetable-exception-update", id, `修改例外（${parsed.data.date ?? current.date_key}）`, parsed.data);
    return { ok: true };
  });

  app.delete("/api/admin/timetable/exceptions/:id", async (request) => {
    const admin = await requireRecentAdmin(pool, request, environment.ADMIN_REAUTH_MINUTES);
    const id = (request.params as { id: string }).id;
    const current = (await pool.query("SELECT *, date::text AS date_key FROM course_exceptions WHERE id = $1", [id])).rows[0];
    if (!current) throw new HttpError(404, "NOT_FOUND", "例外记录不存在");
    await pool.query("DELETE FROM course_exceptions WHERE id = $1", [id]);
    await touchSemester(pool, current.semester_id);
    await writeRevision(pool, admin, "timetable-exception-delete", id, `撤销例外（${current.date_key}）`, null);
    return { ok: true };
  });

  // 便于排查：列出当前学期的模板（管理员）
  app.get("/api/admin/timetable/templates", async (request) => {
    await requireRecentAdmin(pool, request, environment.ADMIN_REAUTH_MINUTES);
    const semester = await loadActiveSemester(pool);
    if (!semester) return { semester: null, templates: [], exceptions: [] };
    const [templates, exceptions] = await Promise.all([
      loadTemplates(pool, semester.id),
      loadExceptions(pool, semester.id, addDays(shanghaiDateKey(), -30), addDays(shanghaiDateKey(), 120)),
    ]);
    return { semester, templates, exceptions };
  });
}