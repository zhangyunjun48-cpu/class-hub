import type { FastifyInstance, FastifyRequest } from "fastify";
import type { Pool } from "pg";
import { z } from "zod";
import type { ServerEnvironment } from "../config/env.js";
import { hashPin, hashToken, normalizeName, parseCookies, sessionCookieName, signChallenge, studentIdHmac, verifyChallenge, verifyPin } from "../lib/crypto.js";
import { HttpError } from "../lib/http-error.js";
import { createSession, requireAdmin, requireMember, revokeCurrentSession } from "../services/auth.js";

interface AuthRouteOptions {
  pool: Pool;
  environment: ServerEnvironment;
}

const loginSchema = z.object({
  studentId: z.string().min(4).max(32),
  name: z.string().min(2).max(50),
});

const activateSchema = z.object({
  challengeToken: z.string().min(10),
  activationCode: z.string().min(1).max(100),
});

const pinSchema = z.object({
  pin: z.string().min(6).max(32).optional(),
  newPin: z.string().min(6).max(32).optional(),
  recoveryKey: z.string().min(8).max(200).optional(),
});

const ipHash = (request: FastifyRequest, secret: string) => hashToken(`${request.ip}:${secret}`);

async function recentFailuresByIp(pool: Pool, hashedIp: string) {
  const result = await pool.query<{ count: string }>(
    `SELECT count(*)::text AS count FROM auth_attempts
      WHERE ip_hash = $1 AND success = false AND attempted_at > now() - interval '15 minutes'`,
    [hashedIp],
  );
  return Number(result.rows[0]?.count ?? 0);
}

async function recentFailuresByStudent(pool: Pool, studentHash: string) {
  const result = await pool.query<{ count: string }>(
    `SELECT count(*)::text AS count FROM auth_attempts
      WHERE student_id_hmac = $1 AND success = false AND attempted_at > now() - interval '15 minutes'`,
    [studentHash],
  );
  return Number(result.rows[0]?.count ?? 0);
}

const tooManyAttempts = () => new HttpError(429, "RATE_LIMITED", "尝试次数过多，请 15 分钟后再试");

export async function registerAuthRoutes(app: FastifyInstance, options: AuthRouteOptions) {
  const { pool, environment } = options;
  const authSecret = environment.AUTH_SECRET ?? "development-auth-secret-change-me";
  const studentSecret = environment.STUDENT_ID_HMAC_KEY ?? "development-student-id-secret-change-me";

  app.post("/api/auth/login", async (request, reply) => {
    const parsed = loginSchema.safeParse(request.body);
    if (!parsed.success) throw new HttpError(400, "VALIDATION_ERROR", "请填写正确的学号和姓名");
    const { studentId, name } = parsed.data;
    const studentHash = studentIdHmac(studentId, studentSecret);
    const hashedIp = ipHash(request, authSecret);

    if ((await recentFailuresByIp(pool, hashedIp)) >= 20) throw tooManyAttempts();
    if ((await recentFailuresByStudent(pool, studentHash)) >= 10) throw tooManyAttempts();

    const result = await pool.query<{
      id: string; name: string; name_normalized: string; role: "owner" | "admin" | "member"; is_system_owner: boolean;
    }>(
      `SELECT id, name, name_normalized, role, is_system_owner
         FROM members
        WHERE student_id_hmac = $1 AND active = true`,
      [studentHash],
    );
    const member = result.rows[0];
    if (!member || member.name_normalized !== normalizeName(name)) {
      await pool.query("INSERT INTO auth_attempts (ip_hash, student_id_hmac, success) VALUES ($1, $2, false)", [hashedIp, studentHash]);
      throw new HttpError(401, "INVALID_IDENTITY", "学号或姓名不匹配，请联系班委核对名单");
    }

    await pool.query("INSERT INTO auth_attempts (ip_hash, student_id_hmac, success) VALUES ($1, $2, true)", [hashedIp, studentHash]);
    return reply.send({
      activationRequired: true,
      challengeToken: signChallenge(member.id, authSecret),
      displayName: member.name,
      systemOwner: member.is_system_owner,
    });
  });

  app.post("/api/auth/activate", async (request, reply) => {
    const parsed = activateSchema.safeParse(request.body);
    if (!parsed.success) throw new HttpError(400, "VALIDATION_ERROR", "请填写激活码");
    const memberId = verifyChallenge(parsed.data.challengeToken, authSecret);
    if (!memberId) throw new HttpError(401, "CHALLENGE_EXPIRED", "激活请求已过期，请重新输入学号和姓名");

    const result = await pool.query<{ is_system_owner: boolean; active: boolean; student_id_hmac: string }>(
      "SELECT is_system_owner, active, student_id_hmac FROM members WHERE id = $1",
      [memberId],
    );
    const member = result.rows[0];
    if (!member || !member.active) throw new HttpError(403, "FORBIDDEN", "账号不存在或已被禁用");

    const hashedIp = ipHash(request, authSecret);
    if ((await recentFailuresByIp(pool, hashedIp)) >= 20) throw tooManyAttempts();
    if ((await recentFailuresByStudent(pool, member.student_id_hmac)) >= 10) throw tooManyAttempts();

    const code = parsed.data.activationCode.trim();
    const validClassCode = Boolean(environment.CLASS_ACTIVATION_CODE && code === environment.CLASS_ACTIVATION_CODE);
    const validRecoveryCode = member.is_system_owner && Boolean(environment.FALLBACK_OWNER_KEY && code === environment.FALLBACK_OWNER_KEY);
    if (!validClassCode && !validRecoveryCode) {
      await pool.query("INSERT INTO auth_attempts (ip_hash, student_id_hmac, success) VALUES ($1, $2, false)", [hashedIp, member.student_id_hmac]);
      throw new HttpError(403, "INVALID_ACTIVATION_CODE", "班级激活码不正确");
    }

    await pool.query("UPDATE members SET activation_at = COALESCE(activation_at, now()), last_seen_at = now() WHERE id = $1", [memberId]);
    await createSession(pool, reply, memberId, environment);
    return reply.send({ ok: true });
  });

  app.post("/api/auth/logout", async (request, reply) => {
    await revokeCurrentSession(pool, request, reply, environment);
    return reply.send({ ok: true });
  });

  app.get("/api/me", async (request) => {
    const member = await requireMember(pool, request);
    return {
      id: member.id,
      name: member.name,
      role: member.role,
      studentIdLast4: member.studentIdLast4,
      isSystemOwner: member.isSystemOwner,
      adminVerified: member.isSystemOwner || Boolean(member.adminReauthUntil && new Date(member.adminReauthUntil).getTime() > Date.now()),
      adminReauthUntil: member.adminReauthUntil,
    };
  });

  app.post("/api/me/onboarding-seen", async (request) => {
    const member = await requireMember(pool, request);
    await pool.query("UPDATE members SET onboarding_seen_at = now(), updated_at = now() WHERE id = $1", [member.id]);
    return { ok: true };
  });

  app.post("/api/auth/admin-reauth", async (request) => {
    const member = await requireAdmin(pool, request);
    const parsed = pinSchema.safeParse(request.body);
    if (!parsed.success) throw new HttpError(400, "VALIDATION_ERROR", "请填写管理员 PIN");

    if (member.isSystemOwner && parsed.data.recoveryKey) {
      if (!environment.FALLBACK_OWNER_KEY || parsed.data.recoveryKey !== environment.FALLBACK_OWNER_KEY) {
        throw new HttpError(403, "INVALID_ADMIN_PIN", "恢复密钥不正确");
      }
    } else {
      const credential = await pool.query<{ pin_hash: string; failed_attempts: number; locked_until: string | null }>(
        "SELECT pin_hash, failed_attempts, locked_until FROM admin_credentials WHERE member_id = $1",
        [member.id],
      );
      const row = credential.rows[0];
      if (!row) {
        if (!parsed.data.newPin) throw new HttpError(400, "ADMIN_PIN_SETUP_REQUIRED", "首次使用请设置管理员 PIN");
        await pool.query(
          `INSERT INTO admin_credentials (member_id, pin_hash) VALUES ($1, $2)
           ON CONFLICT (member_id) DO UPDATE SET pin_hash = EXCLUDED.pin_hash, failed_attempts = 0, locked_until = null, updated_at = now()`,
          [member.id, await hashPin(parsed.data.newPin)],
        );
      } else {
        if (row.locked_until && new Date(row.locked_until).getTime() > Date.now()) {
          throw new HttpError(423, "ADMIN_PIN_LOCKED", "管理员 PIN 已锁定，请稍后重试");
        }
        if (!parsed.data.pin || !(await verifyPin(parsed.data.pin, row.pin_hash))) {
          await pool.query(
            `UPDATE admin_credentials
                SET failed_attempts = failed_attempts + 1,
                    locked_until = CASE WHEN failed_attempts + 1 >= 5 THEN now() + interval '15 minutes' ELSE locked_until END,
                    updated_at = now()
              WHERE member_id = $1`,
            [member.id],
          );
          throw new HttpError(403, "INVALID_ADMIN_PIN", "管理员 PIN 不正确");
        }
        await pool.query("UPDATE admin_credentials SET failed_attempts = 0, locked_until = null, updated_at = now() WHERE member_id = $1", [member.id]);
      }
    }

    const token = parseCookies(request.headers.cookie)[sessionCookieName()];
    if (!token) throw new HttpError(401, "AUTH_REQUIRED", "请先登录");
    await pool.query(
      `UPDATE sessions SET admin_reauth_until = now() + ($2 || ' minutes')::interval WHERE token_hash = $1`,
      [hashToken(token), environment.ADMIN_REAUTH_MINUTES],
    );
    return { ok: true, reauthMinutes: environment.ADMIN_REAUTH_MINUTES };
  });
}