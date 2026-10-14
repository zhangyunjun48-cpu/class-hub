import type { FastifyInstance } from "fastify";
import type { Pool } from "pg";
import { z } from "zod";
import type { ServerEnvironment } from "../config/env.js";
import { HttpError } from "../lib/http-error.js";
import { requireMember, requireRecentAdmin } from "../services/auth.js";

interface ContentRouteOptions { pool: Pool; environment: ServerEnvironment; }

const resourceSchema = z.object({
  title: z.string().trim().min(2).max(80),
  description: z.string().trim().max(300).default(""),
  category: z.string().trim().max(40).default("其他"),
  url: z.string().url().max(1000),
  ownerName: z.string().trim().max(40).default(""),
  official: z.boolean().default(false),
});

const tutorialSteps = [
  { id: 1, title: "首次验证", body: "输入白名单中的学号和姓名，再输入班级激活码。验证成功后，同一浏览器 30 天内无需重复验证。", image: "/tutorial/01-login.svg" },
  { id: 2, title: "普通与重要日程", body: "普通日程全班都可以直接修改；重要日程只有管理员可以修改。保存后会立即同步给其他在线成员。", image: "/tutorial/02-schedules.svg" },
  { id: 3, title: "完成与反馈", body: "成员只能看到自己的完成状态。遇到问题可在“其它 → 反馈”提交，管理员回复后原帖显示处理结果。", image: "/tutorial/03-feedback.svg" },
  { id: 4, title: "资料与管理", body: "资料库只保存外部链接。管理员可以发布公告、维护资料、调整成员角色和查看变更日志。", image: "/tutorial/04-manage.svg" },
];

export async function registerContentRoutes(app: FastifyInstance, options: ContentRouteOptions) {
  const { pool, environment } = options;
  const listResources = async () => {
    const result = await pool.query("SELECT * FROM resources WHERE deleted_at IS NULL ORDER BY official DESC, updated_at DESC");
    return { resources: result.rows };
  };

  app.get("/api/public/resources", async () => listResources());
  app.get("/api/resources", async (request) => { await requireMember(pool, request); return listResources(); });
  app.get("/api/public/tutorial", async () => ({ steps: tutorialSteps }));

  app.post("/api/resources", async (request) => {
    const member = await requireRecentAdmin(pool, request, environment.ADMIN_REAUTH_MINUTES);
    const parsed = resourceSchema.safeParse(request.body);
    if (!parsed.success) throw new HttpError(400, "VALIDATION_ERROR", "资料格式不正确");
    const item = parsed.data;
    const result = await pool.query(
      `INSERT INTO resources (title, description, category, url, owner_name, official, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [item.title, item.description, item.category, item.url, item.ownerName, item.official, member.id],
    );
    return result.rows[0];
  });

  app.patch("/api/resources/:id", async (request) => {
    await requireRecentAdmin(pool, request, environment.ADMIN_REAUTH_MINUTES);
    const parsed = resourceSchema.partial().safeParse(request.body);
    if (!parsed.success) throw new HttpError(400, "VALIDATION_ERROR", "资料格式不正确");
    const id = (request.params as { id: string }).id;
    const current = (await pool.query("SELECT * FROM resources WHERE id=$1 AND deleted_at IS NULL", [id])).rows[0];
    if (!current) throw new HttpError(404, "NOT_FOUND", "资料不存在");
    const item = { ...current, ...parsed.data };
    const result = await pool.query(
      `UPDATE resources SET title=$1, description=$2, category=$3, url=$4, owner_name=$5, official=$6, updated_at=now() WHERE id=$7 RETURNING *`,
      [item.title, item.description, item.category, item.url, parsed.data.ownerName ?? item.owner_name, item.official, id],
    );
    return result.rows[0];
  });

  app.delete("/api/resources/:id", async (request) => {
    await requireRecentAdmin(pool, request, environment.ADMIN_REAUTH_MINUTES);
    await pool.query("UPDATE resources SET deleted_at=now(), updated_at=now() WHERE id=$1", [(request.params as { id: string }).id]);
    return { ok: true };
  });

  app.post("/api/feedback", async (request) => {
    const member = await requireMember(pool, request);
    const parsed = z.object({ category: z.string().trim().max(40).default("其他"), content: z.string().trim().min(2).max(1000) }).safeParse(request.body);
    if (!parsed.success) throw new HttpError(400, "VALIDATION_ERROR", "请填写反馈内容");
    const result = await pool.query(
      "INSERT INTO feedback (member_id, category, content) VALUES ($1,$2,$3) RETURNING id, category, content, status, admin_reply, created_at",
      [member.id, parsed.data.category, parsed.data.content],
    );
    return result.rows[0];
  });

  app.get("/api/feedback/mine", async (request) => {
    const member = await requireMember(pool, request);
    const result = await pool.query("SELECT id, category, content, status, admin_reply, created_at, updated_at FROM feedback WHERE member_id=$1 ORDER BY created_at DESC", [member.id]);
    return { feedback: result.rows };
  });

  app.get("/api/feedback", async (request) => {
    await requireRecentAdmin(pool, request, environment.ADMIN_REAUTH_MINUTES);
    const result = await pool.query(
      `SELECT f.*, m.name AS member_name, m.student_id_last4 FROM feedback f JOIN members m ON m.id=f.member_id ORDER BY f.created_at DESC`,
    );
    return { feedback: result.rows };
  });

  app.patch("/api/feedback/:id", async (request) => {
    await requireRecentAdmin(pool, request, environment.ADMIN_REAUTH_MINUTES);
    const parsed = z.object({ status: z.enum(["pending", "resolved", "ignored"]), adminReply: z.string().trim().max(1000).default("") }).safeParse(request.body);
    if (!parsed.success) throw new HttpError(400, "VALIDATION_ERROR", "反馈处理参数不正确");
    const result = await pool.query(
      "UPDATE feedback SET status=$1, admin_reply=$2, updated_at=now() WHERE id=$3 RETURNING id, status, admin_reply, updated_at",
      [parsed.data.status, parsed.data.adminReply, (request.params as { id: string }).id],
    );
    if (!result.rowCount) throw new HttpError(404, "NOT_FOUND", "反馈不存在");
    return result.rows[0];
  });
}
