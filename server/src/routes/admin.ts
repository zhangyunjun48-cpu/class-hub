import type { FastifyInstance } from "fastify";
import type { Pool } from "pg";
import { z } from "zod";
import type { ServerEnvironment } from "../config/env.js";
import { normalizeName, studentIdHmac, studentIdLast4 } from "../lib/crypto.js";
import { HttpError } from "../lib/http-error.js";
import { BASIC_ROLES, parseRosterCsv } from "../lib/roster.js";
import { requireRecentAdmin } from "../services/auth.js";

interface AdminRouteOptions { pool: Pool; environment: ServerEnvironment; }

export async function registerAdminRoutes(app: FastifyInstance, options: AdminRouteOptions) {
  const { pool, environment } = options;
  const studentSecret = environment.STUDENT_ID_HMAC_KEY ?? "development-student-id-secret-change-me";

  app.post("/api/admin/roster/preview", async (request) => {
    await requireRecentAdmin(pool, request, environment.ADMIN_REAUTH_MINUTES);
    const parsed = z.object({ csv: z.string().min(1).max(1_000_000) }).safeParse(request.body);
    if (!parsed.success) throw new HttpError(400, "VALIDATION_ERROR", "请上传 UTF-8 CSV");
    const result = parseRosterCsv(parsed.data.csv);
    return {
      // studentId 由管理员自己的浏览器持有并回传，服务端只做 HMAC，不落盘、不写日志。
      rows: result.rows.map((row) => ({
        line: row.line,
        studentId: row.studentId,
        name: row.name,
        group: row.group,
        initialRole: row.initialRole,
        active: row.active,
        studentIdLast4: studentIdLast4(row.studentId),
      })),
      errors: result.errors,
      valid: result.errors.length === 0,
      active: result.rows.filter((row) => row.active).length,
    };
  });

  app.post("/api/admin/roster/commit", async (request) => {
    const admin = await requireRecentAdmin(pool, request, environment.ADMIN_REAUTH_MINUTES);
    const rowSchema = z.object({
      studentId: z.string().min(4).max(32),
      name: z.string().min(2).max(50),
      group: z.string().max(80).default(""),
      initialRole: z.enum(BASIC_ROLES).default("member"),
      active: z.boolean().default(true),
    });
    const parsed = z.object({ rows: z.array(rowSchema).min(1).max(500) }).safeParse(request.body);
    if (!parsed.success) throw new HttpError(400, "VALIDATION_ERROR", "名单数据不正确");
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      for (const row of parsed.data.rows) {
        const hmac = studentIdHmac(row.studentId, studentSecret);
        await client.query(
          `INSERT INTO members (student_id_hmac, student_id_last4, name, name_normalized, group_name, role, active)
           VALUES ($1,$2,$3,$4,$5,$6,$7)
           ON CONFLICT (student_id_hmac) DO UPDATE
             SET student_id_last4=EXCLUDED.student_id_last4, name=EXCLUDED.name, name_normalized=EXCLUDED.name_normalized,
                 group_name=EXCLUDED.group_name, active=EXCLUDED.active, updated_at=now()`,
          [hmac, studentIdLast4(row.studentId), row.name, normalizeName(row.name), row.group, row.initialRole, row.active],
        );
      }
      await client.query("INSERT INTO roster_imports (imported_by, row_count, summary) VALUES ($1,$2,$3)", [
        admin.id,
        parsed.data.rows.length,
        JSON.stringify({ active: parsed.data.rows.filter((row) => row.active).length }),
      ]);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
    await pool.query(
      `INSERT INTO revisions (action, entity_type, entity_id, summary, actor_id, actor_nickname, after_json)
       VALUES ('roster','roster',$1,$2,$3,$4,$5)`,
      [admin.id, `导入名单 ${parsed.data.rows.length} 人`, admin.id, admin.name, JSON.stringify({ rows: parsed.data.rows.length })],
    );
    return { ok: true, imported: parsed.data.rows.length };
  });

  app.get("/api/admin/members", async (request) => {
    await requireRecentAdmin(pool, request, environment.ADMIN_REAUTH_MINUTES);
    const rows = await pool.query(
      "SELECT id, name, student_id_last4, group_name, role, active, is_system_owner, last_seen_at, created_at FROM members ORDER BY role, created_at",
    );
    return {
      members: rows.rows.map((row) => ({
        id: row.id,
        name: row.name,
        studentIdLast4: row.student_id_last4,
        group: row.group_name,
        role: row.role,
        active: row.active,
        isSystemOwner: row.is_system_owner,
        lastSeenAt: row.last_seen_at,
        createdAt: row.created_at,
      })),
    };
  });

  app.patch("/api/admin/members/:id", async (request) => {
    const admin = await requireRecentAdmin(pool, request, environment.ADMIN_REAUTH_MINUTES);
    const id = (request.params as { id: string }).id;
    const parsed = z.object({ role: z.enum(BASIC_ROLES).optional(), active: z.boolean().optional(), group: z.string().trim().max(80).optional() }).safeParse(request.body);
    if (!parsed.success) throw new HttpError(400, "VALIDATION_ERROR", "成员更新参数不正确");
    if (parsed.data.role === "owner" && admin.role !== "owner") {
      throw new HttpError(403, "FORBIDDEN", "只有主 Owner 可以授予 owner 角色");
    }
    const target = (await pool.query("SELECT * FROM members WHERE id=$1", [id])).rows[0];
    if (!target) throw new HttpError(404, "NOT_FOUND", "成员不存在");
    if (target.is_system_owner) throw new HttpError(403, "SYSTEM_OWNER_PROTECTED", "系统兜底管理员不可修改");
    if (target.id === admin.id) throw new HttpError(403, "FORBIDDEN", "不能修改自己的角色或状态");
    if ((target.role === "owner" || target.role === "admin") && parsed.data.role === "member") {
      const others = await pool.query<{ count: string }>(
        "SELECT count(*)::text AS count FROM members WHERE role IN ('owner','admin') AND active=true AND id<>$1",
        [id],
      );
      if (Number(others.rows[0]?.count ?? 0) === 0) throw new HttpError(400, "LAST_ADMIN", "不能降级最后一个管理员");
    }
    await pool.query("UPDATE members SET role=$1, active=$2, group_name=$3, updated_at=now() WHERE id=$4", [
      parsed.data.role ?? target.role,
      parsed.data.active ?? target.active,
      parsed.data.group ?? target.group_name,
      id,
    ]);
    if (parsed.data.active === false) await pool.query("DELETE FROM sessions WHERE member_id=$1", [id]);
    await pool.query(
      `INSERT INTO revisions (action, entity_type, entity_id, summary, actor_id, actor_nickname, before_json, after_json)
       VALUES ('member','member',$1,$2,$3,$4,$5,$6)`,
      [
        id,
        `成员管理：${target.name}`,
        admin.id,
        admin.name,
        JSON.stringify({ role: target.role, active: target.active, group: target.group_name }),
        JSON.stringify({ role: parsed.data.role ?? target.role, active: parsed.data.active ?? target.active, group: parsed.data.group ?? target.group_name }),
      ],
    );
    return { ok: true };
  });

  app.post("/api/announcements", async (request) => {
    const admin = await requireRecentAdmin(pool, request, environment.ADMIN_REAUTH_MINUTES);
    const parsed = z.object({
      title: z.string().trim().min(1).max(120),
      body: z.string().trim().min(1).max(5000),
      pinned: z.boolean().default(false),
    }).safeParse(request.body);
    if (!parsed.success) throw new HttpError(400, "VALIDATION_ERROR", "请填写公告标题和内容");
    const result = await pool.query(
      "INSERT INTO announcements (title, body, pinned, created_by) VALUES ($1,$2,$3,$4) RETURNING *",
      [parsed.data.title, parsed.data.body, parsed.data.pinned, admin.id],
    );
    await pool.query(
      `INSERT INTO revisions (action, entity_type, entity_id, summary, actor_id, actor_nickname, after_json)
       VALUES ('announcement','announcement',$1,$2,$3,$4,$5)`,
      [result.rows[0].id, `发布公告「${parsed.data.title}」`, admin.id, admin.name, JSON.stringify(result.rows[0])],
    );
    return result.rows[0];
  });

  app.delete("/api/announcements/:id", async (request) => {
    const admin = await requireRecentAdmin(pool, request, environment.ADMIN_REAUTH_MINUTES);
    const id = (request.params as { id: string }).id;
    const current = (await pool.query("SELECT * FROM announcements WHERE id=$1", [id])).rows[0];
    if (!current) throw new HttpError(404, "NOT_FOUND", "公告不存在");
    await pool.query("UPDATE announcements SET deleted_at=now(), updated_at=now() WHERE id=$1", [id]);
    await pool.query(
      `INSERT INTO revisions (action, entity_type, entity_id, summary, actor_id, actor_nickname, before_json)
       VALUES ('announcement','announcement',$1,$2,$3,$4,$5)`,
      [id, `删除公告「${current.title}」`, admin.id, admin.name, JSON.stringify(current)],
    );
    return { ok: true };
  });
}