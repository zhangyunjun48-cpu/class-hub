import type { FastifyInstance } from "fastify";
import type { Pool, PoolClient } from "pg";
import { z } from "zod";
import type { ServerEnvironment } from "../config/env.js";
import { HttpError } from "../lib/http-error.js";
import { hasVersionConflict, scheduleCreateViolation, scheduleWriteViolation } from "../lib/schedule-policy.js";
import { requireMember, requireRecentAdmin } from "../services/auth.js";
import { buildSyncTimetable } from "../services/timetable.js";

interface ScheduleRouteOptions { pool: Pool; environment: ServerEnvironment; }

const scheduleDraftSchema = z.object({
  title: z.string().trim().min(1).max(80),
  category: z.enum(["course", "task", "exam", "activity", "meeting", "class"]),
  importance: z.enum(["normal", "important"]).default("normal"),
  startAt: z.string().datetime({ offset: true }).nullable().optional(),
  dueAt: z.string().datetime({ offset: true }).nullable().optional(),
  endAt: z.string().datetime({ offset: true }).nullable().optional(),
  location: z.string().trim().max(120).default(""),
  note: z.string().trim().max(1000).default(""),
  relatedLink: z.string().trim().url().or(z.literal("")).default(""),
}).superRefine((value, context) => {
  if (!value.startAt && !value.dueAt) context.addIssue({ code: "custom", message: "开始时间和截止时间至少填写一个", path: ["startAt"] });
  if (value.endAt && !value.startAt) context.addIssue({ code: "custom", message: "结束时间需要开始时间", path: ["endAt"] });
  if (value.startAt && value.endAt && new Date(value.endAt) < new Date(value.startAt)) context.addIssue({ code: "custom", message: "结束时间不能早于开始时间", path: ["endAt"] });
  if (value.startAt && value.dueAt && new Date(value.dueAt) < new Date(value.startAt)) context.addIssue({ code: "custom", message: "截止时间不能早于开始时间", path: ["dueAt"] });
});

export const toScheduleDto = (row: Record<string, unknown>) => ({
  id: row.id,
  title: row.title,
  category: row.category,
  importance: row.importance,
  startAt: row.start_at,
  dueAt: row.due_at,
  endAt: row.end_at,
  location: row.location,
  note: row.note,
  relatedLink: row.related_link,
  createdBy: row.created_by,
  updatedBy: row.updated_by,
  version: row.version,
  deletedAt: row.deleted_at,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

async function addRevision(
  client: Pool | PoolClient,
  actor: { id: string; name: string },
  action: string,
  entityType: string,
  entityId: string,
  summary: string,
  before: unknown,
  after: unknown,
) {
  await client.query(
    `INSERT INTO revisions (action, entity_type, entity_id, summary, actor_id, actor_nickname, before_json, after_json)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [action, entityType, entityId, summary, actor.id, actor.name, before ? JSON.stringify(before) : null, after ? JSON.stringify(after) : null],
  );
}

export async function registerScheduleRoutes(app: FastifyInstance, options: ScheduleRouteOptions) {
  const { pool, environment } = options;

  app.get("/api/schedules", async (request) => {
    await requireMember(pool, request);
    const result = await pool.query("SELECT * FROM schedules WHERE deleted_at IS NULL ORDER BY COALESCE(due_at, start_at), created_at");
    return { schedules: result.rows.map(toScheduleDto) };
  });

  app.get("/api/schedules/trash", async (request) => {
    await requireRecentAdmin(pool, request, environment.ADMIN_REAUTH_MINUTES);
    const result = await pool.query("SELECT * FROM schedules WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC LIMIT 100");
    return { schedules: result.rows.map(toScheduleDto) };
  });

  app.post("/api/schedules", async (request) => {
    const member = await requireMember(pool, request);
    const parsed = scheduleDraftSchema.safeParse(request.body);
    if (!parsed.success) throw new HttpError(400, "VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "日程格式不正确");
    const draft = parsed.data;
    const violation = scheduleCreateViolation(member.role, draft);
    if (violation) throw new HttpError(violation.statusCode, violation.code, violation.message);
    const result = await pool.query(
      `INSERT INTO schedules (title, category, importance, start_at, due_at, end_at, location, note, related_link, created_by, updated_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$10) RETURNING *`,
      [draft.title, draft.category, draft.importance, draft.startAt ?? null, draft.dueAt ?? null, draft.endAt ?? null, draft.location, draft.note, draft.relatedLink, member.id],
    );
    const created = result.rows[0];
    await addRevision(pool, member, "create", "schedule", created.id, `新增「${created.title}」`, null, toScheduleDto(created));
    return toScheduleDto(created);
  });

  app.patch("/api/schedules/:id", async (request) => {
    const member = await requireMember(pool, request);
    const id = (request.params as { id: string }).id;
    const body = request.body as { version?: unknown };
    const version = z.coerce.number().int().positive().safeParse(body?.version);
    const parsed = scheduleDraftSchema.safeParse(request.body);
    if (!parsed.success) throw new HttpError(400, "VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "日程格式不正确");
    if (!version.success) throw new HttpError(400, "VALIDATION_ERROR", "缺少日程版本号");
    const current = (await pool.query("SELECT * FROM schedules WHERE id = $1", [id])).rows[0];
    if (!current) throw new HttpError(404, "NOT_FOUND", "日程不存在");
    if (current.deleted_at) throw new HttpError(400, "VALIDATION_ERROR", "日程已删除，请先在管理页恢复");
    if (hasVersionConflict(current.version, version.data)) {
      throw new HttpError(409, "VERSION_CONFLICT", "已有同学修改了这条日程", toScheduleDto(current));
    }
    const violation = scheduleWriteViolation(member.role, current, parsed.data);
    if (violation) throw new HttpError(violation.statusCode, violation.code, violation.message);
    const draft = parsed.data;
    const result = await pool.query(
      `UPDATE schedules SET title=$1, category=$2, importance=$3, start_at=$4, due_at=$5, end_at=$6, location=$7, note=$8, related_link=$9, updated_by=$10, version=version+1, updated_at=now()
       WHERE id=$11 RETURNING *`,
      [draft.title, draft.category, draft.importance, draft.startAt ?? null, draft.dueAt ?? null, draft.endAt ?? null, draft.location, draft.note, draft.relatedLink, member.id, id],
    );
    await addRevision(pool, member, "update", "schedule", id, `修改「${draft.title}」`, toScheduleDto(current), toScheduleDto(result.rows[0]));
    return toScheduleDto(result.rows[0]);
  });

  app.delete("/api/schedules/:id", async (request) => {
    const member = await requireRecentAdmin(pool, request, environment.ADMIN_REAUTH_MINUTES);
    const id = (request.params as { id: string }).id;
    const body = z.object({ version: z.number().int().positive() }).safeParse(request.body);
    if (!body.success) throw new HttpError(400, "VALIDATION_ERROR", "缺少日程版本号");
    const current = (await pool.query("SELECT * FROM schedules WHERE id=$1", [id])).rows[0];
    if (!current) throw new HttpError(404, "NOT_FOUND", "日程不存在");
    if (hasVersionConflict(current.version, body.data.version)) {
      throw new HttpError(409, "VERSION_CONFLICT", "已有同学修改了这条日程", toScheduleDto(current));
    }
    const result = await pool.query("UPDATE schedules SET deleted_at=now(), version=version+1, updated_by=$1, updated_at=now() WHERE id=$2 RETURNING *", [member.id, id]);
    await addRevision(pool, member, "delete", "schedule", id, `删除「${current.title}」`, toScheduleDto(current), toScheduleDto(result.rows[0]));
    return { ok: true };
  });

  app.post("/api/schedules/:id/restore", async (request) => {
    const member = await requireRecentAdmin(pool, request, environment.ADMIN_REAUTH_MINUTES);
    const id = (request.params as { id: string }).id;
    const current = (await pool.query("SELECT * FROM schedules WHERE id=$1", [id])).rows[0];
    if (!current) throw new HttpError(404, "NOT_FOUND", "日程不存在");
    if (!current.deleted_at) throw new HttpError(400, "VALIDATION_ERROR", "日程没有被删除");
    const result = await pool.query("UPDATE schedules SET deleted_at=null, version=version+1, updated_by=$1, updated_at=now() WHERE id=$2 RETURNING *", [member.id, id]);
    await addRevision(pool, member, "restore", "schedule", id, `恢复「${current.title}」`, toScheduleDto(current), toScheduleDto(result.rows[0]));
    return toScheduleDto(result.rows[0]);
  });

  app.put("/api/schedules/:id/completion", async (request) => {
    const member = await requireMember(pool, request);
    const id = (request.params as { id: string }).id;
    const parsed = z.object({ completed: z.boolean() }).safeParse(request.body);
    if (!parsed.success) throw new HttpError(400, "VALIDATION_ERROR", "完成状态格式不正确");
    const exists = await pool.query("SELECT id FROM schedules WHERE id=$1 AND deleted_at IS NULL", [id]);
    if (!exists.rowCount) throw new HttpError(404, "NOT_FOUND", "日程不存在");
    if (parsed.data.completed) await pool.query("INSERT INTO schedule_completions (schedule_id, member_id) VALUES ($1,$2) ON CONFLICT DO NOTHING", [id, member.id]);
    else await pool.query("DELETE FROM schedule_completions WHERE schedule_id=$1 AND member_id=$2", [id, member.id]);
    await addRevision(pool, member, "complete", "schedule", id, parsed.data.completed ? "标记已完成" : "取消完成", null, { completed: parsed.data.completed });
    return { ok: true };
  });

  app.get("/api/sync", async (request) => {
    const member = await requireMember(pool, request);
    // 必须在查询之前取时间，否则查询期间写入的行会被 since 轮询永久跳过。
    const serverTime = new Date().toISOString();
    const since = (request.query as { since?: string }).since;
    const validSince = since && !Number.isNaN(Date.parse(since)) ? since : null;
    const scheduleResult = validSince
      ? await pool.query("SELECT * FROM schedules WHERE updated_at > $1 ORDER BY updated_at", [validSince])
      : await pool.query("SELECT * FROM schedules WHERE deleted_at IS NULL ORDER BY COALESCE(due_at, start_at), created_at");
    const announcementResult = await pool.query("SELECT * FROM announcements WHERE deleted_at IS NULL ORDER BY pinned DESC, created_at DESC LIMIT 20");
    // 课表变更只进审计，不进首页「最近变更」
    const revisionResult = await pool.query("SELECT * FROM revisions WHERE entity_type <> 'timetable' ORDER BY created_at DESC LIMIT 10");
    const completionResult = await pool.query("SELECT schedule_id FROM schedule_completions WHERE member_id=$1", [member.id]);
    const timetable = await buildSyncTimetable(pool, serverTime);
    const stats = await pool.query(
      `SELECT count(*) FILTER (WHERE deleted_at IS NULL)::text AS active,
              count(*) FILTER (WHERE deleted_at IS NULL AND due_at BETWEEN now() AND now() + interval '7 days')::text AS due7d,
              count(*) FILTER (WHERE deleted_at IS NULL AND due_at < now())::text AS overdue,
              (SELECT count(*) FROM schedule_completions WHERE member_id=$1)::text AS completed
         FROM schedules`,
      [member.id],
    );
    return {
      serverTime,
      nextPollMs: 15000,
      schedules: scheduleResult.rows.map(toScheduleDto),
      announcements: announcementResult.rows,
      revisions: revisionResult.rows,
      completedScheduleIds: completionResult.rows.map((row) => row.schedule_id),
      stats: Object.fromEntries(Object.entries(stats.rows[0] ?? {}).map(([key, value]) => [key, Number(value)])),
      timetable,
      me: { id: member.id, name: member.name, role: member.role, studentIdLast4: member.studentIdLast4, isSystemOwner: member.isSystemOwner, adminReauthUntil: member.adminReauthUntil, adminVerified: member.isSystemOwner || Boolean(member.adminReauthUntil && new Date(member.adminReauthUntil).getTime() > Date.now()) },
    };
  });

  app.get("/api/audit", async (request) => {
    await requireRecentAdmin(pool, request, environment.ADMIN_REAUTH_MINUTES);
    const result = await pool.query("SELECT * FROM revisions ORDER BY created_at DESC LIMIT 200");
    return {
      revisions: result.rows.map((row) => ({
        id: row.id,
        action: row.action,
        entityType: row.entity_type,
        entityId: row.entity_id,
        summary: row.summary,
        actorId: row.actor_id,
        actor: row.actor_nickname,
        before: row.before_json,
        after: row.after_json,
        createdAt: row.created_at,
      })),
    };
  });

  app.post("/api/audit/:id/revert", async (request) => {
    const member = await requireRecentAdmin(pool, request, environment.ADMIN_REAUTH_MINUTES);
    const id = (request.params as { id: string }).id;
    const revision = (await pool.query("SELECT * FROM revisions WHERE id=$1", [id])).rows[0];
    if (!revision || revision.entity_type !== "schedule" || !revision.before_json) throw new HttpError(400, "VALIDATION_ERROR", "该变更无法回退");
    const before = revision.before_json as Record<string, unknown>;
    const current = (await pool.query("SELECT * FROM schedules WHERE id=$1", [revision.entity_id])).rows[0];
    if (!current) throw new HttpError(404, "NOT_FOUND", "日程不存在");
    if (hasVersionConflict(current.version, Number(before.version))) {
      throw new HttpError(409, "VERSION_CONFLICT", "日程已被后续修改，不能直接回退", toScheduleDto(current));
    }
    const result = await pool.query(
      `UPDATE schedules SET title=$1, category=$2, importance=$3, start_at=$4, due_at=$5, end_at=$6, location=$7, note=$8, related_link=$9, deleted_at=$10, version=version+1, updated_by=$11, updated_at=now()
       WHERE id=$12 RETURNING *`,
      [before.title, before.category, before.importance, before.startAt ?? null, before.dueAt ?? null, before.endAt ?? null, before.location, before.note, before.relatedLink ?? "", null, member.id, revision.entity_id],
    );
    await addRevision(pool, member, "revert", "schedule", revision.entity_id, `回退「${current.title}」`, toScheduleDto(current), toScheduleDto(result.rows[0]));
    return toScheduleDto(result.rows[0]);
  });
}