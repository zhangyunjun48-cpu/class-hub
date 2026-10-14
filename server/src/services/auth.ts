import type { FastifyReply, FastifyRequest } from "fastify";
import type { Pool } from "pg";
import type { ServerEnvironment } from "../config/env.js";
import { clearSessionCookie, hashToken, parseCookies, randomToken, serializeSessionCookie, sessionCookieName } from "../lib/crypto.js";
import { HttpError } from "../lib/http-error.js";

export interface AuthMember {
  id: string;
  name: string;
  role: "owner" | "admin" | "member";
  isSystemOwner: boolean;
  studentIdLast4: string;
  active: boolean;
  adminReauthUntil: string | null;
}

interface SessionRow {
  member_id: string;
  session_id: string;
  name: string;
  role: AuthMember["role"];
  is_system_owner: boolean;
  student_id_last4: string;
  active: boolean;
  admin_reauth_until: string | null;
}

export async function authenticateRequest(pool: Pool, request: FastifyRequest): Promise<AuthMember | null> {
  const token = parseCookies(request.headers.cookie)[sessionCookieName()];
  if (!token) return null;
  const tokenHash = hashToken(token);
  const result = await pool.query<SessionRow>(
    `SELECT s.id AS session_id, s.member_id, s.admin_reauth_until,
            m.name, m.role, m.is_system_owner, m.student_id_last4, m.active
       FROM sessions s
       JOIN members m ON m.id = s.member_id
      WHERE s.token_hash = $1 AND s.expires_at > now()`,
    [tokenHash],
  );
  const row = result.rows[0];
  if (!row || !row.active) return null;
  await pool.query(
    `UPDATE sessions
        SET last_seen_at = now(),
            expires_at = GREATEST(expires_at, now() + interval '30 days')
      WHERE id = $1
        AND last_seen_at < now() - interval '1 day'`,
    [row.session_id],
  );
  return {
    id: row.member_id,
    name: row.name,
    role: row.role,
    isSystemOwner: row.is_system_owner,
    studentIdLast4: row.student_id_last4,
    active: row.active,
    adminReauthUntil: row.admin_reauth_until,
  };
}

export async function requireMember(pool: Pool, request: FastifyRequest) {
  const member = await authenticateRequest(pool, request);
  if (!member) throw new HttpError(401, "AUTH_REQUIRED", "请先登录班级账号");
  return member;
}

export async function requireAdmin(pool: Pool, request: FastifyRequest) {
  const member = await requireMember(pool, request);
  if (member.role !== "owner" && member.role !== "admin") {
    throw new HttpError(403, "FORBIDDEN", "只有管理员可以执行此操作");
  }
  return member;
}

export async function requireRecentAdmin(pool: Pool, request: FastifyRequest, minutes: number) {
  const member = await requireAdmin(pool, request);
  const recent = member.isSystemOwner || (member.adminReauthUntil && new Date(member.adminReauthUntil).getTime() > Date.now());
  if (!recent) throw new HttpError(403, "ADMIN_REAUTH_REQUIRED", "请重新验证管理员 PIN");
  return member;
}

export async function createSession(pool: Pool, reply: FastifyReply, memberId: string, environment: ServerEnvironment) {
  const rawToken = randomToken();
  const maxAgeSeconds = environment.SESSION_DAYS * 86400;
  await pool.query(
    `INSERT INTO sessions (member_id, token_hash, expires_at)
     VALUES ($1, $2, now() + ($3 || ' seconds')::interval)`,
    [memberId, hashToken(rawToken), maxAgeSeconds],
  );
  reply.header("Set-Cookie", serializeSessionCookie(rawToken, environment.COOKIE_SECURE, maxAgeSeconds));
}

export async function revokeCurrentSession(pool: Pool, request: FastifyRequest, reply: FastifyReply, environment: ServerEnvironment) {
  const token = parseCookies(request.headers.cookie)[sessionCookieName()];
  if (token) await pool.query("DELETE FROM sessions WHERE token_hash = $1", [hashToken(token)]);
  reply.header("Set-Cookie", clearSessionCookie(environment.COOKIE_SECURE));
}
