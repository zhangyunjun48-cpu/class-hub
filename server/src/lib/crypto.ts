import { createHash, createHmac, randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCallback);

export const normalizeStudentId = (value: string) => value.replace(/\s+/g, "").toUpperCase();
export const normalizeName = (value: string) => value.trim().replace(/\s+/g, "").toLowerCase();

export function studentIdHmac(studentId: string, secret: string) {
  return createHmac("sha256", secret).update(normalizeStudentId(studentId)).digest("hex");
}

export function studentIdLast4(studentId: string) {
  const normalized = normalizeStudentId(studentId);
  return normalized.slice(-4).padStart(4, "*");
}

export function randomToken(bytes = 32) {
  return randomBytes(bytes).toString("base64url");
}

export function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function safeEqual(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function hashPin(pin: string) {
  const salt = randomBytes(16);
  const derived = await scrypt(pin, salt, 64) as Buffer;
  return `scrypt$${salt.toString("base64url")}$${derived.toString("base64url")}`;
}

export async function verifyPin(pin: string, stored: string) {
  const [algorithm, saltValue, hashValue] = stored.split("$");
  if (algorithm !== "scrypt" || !saltValue || !hashValue) return false;
  const derived = await scrypt(pin, Buffer.from(saltValue, "base64url"), 64) as Buffer;
  const expected = Buffer.from(hashValue, "base64url");
  return derived.length === expected.length && timingSafeEqual(derived, expected);
}

export function signChallenge(memberId: string, secret: string, lifetimeSeconds = 600) {
  const payload = Buffer.from(JSON.stringify({ memberId, exp: Math.floor(Date.now() / 1000) + lifetimeSeconds })).toString("base64url");
  const signature = createHmac("sha256", secret).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

export function verifyChallenge(token: string, secret: string) {
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return null;
  const expected = createHmac("sha256", secret).update(payload).digest("base64url");
  if (!safeEqual(signature, expected)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { memberId?: string; exp?: number };
    if (!parsed.memberId || !parsed.exp || parsed.exp < Math.floor(Date.now() / 1000)) return null;
    return parsed.memberId;
  } catch {
    return null;
  }
}

export function parseCookies(header: string | undefined) {
  if (!header) return {};
  return Object.fromEntries(
    header.split(";").flatMap((part) => {
      const index = part.indexOf("=");
      if (index < 0) return [];
      return [[part.slice(0, index).trim(), decodeURIComponent(part.slice(index + 1).trim())]];
    })
  );
}

/**
 * 会话 Cookie 名。默认中性，可用环境变量 SESSION_COOKIE_NAME 覆盖
 * —— 从旧版本迁移时把它设成旧名字，可以让已登录的同学不掉线。
 */
export function sessionCookieName() {
  const configured = process.env.SESSION_COOKIE_NAME?.trim();
  return configured || "classhub_session";
}

export function serializeSessionCookie(token: string, secure: boolean, maxAgeSeconds: number) {
  return `${sessionCookieName()}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds}${secure ? "; Secure" : ""}`;
}

export function clearSessionCookie(secure: boolean) {
  return `${sessionCookieName()}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure ? "; Secure" : ""}`;
}
