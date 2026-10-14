import "dotenv/config";
import { z } from "zod";

const booleanFromString = (defaultValue: boolean) =>
  z.string().optional().transform((value) => value == null ? defaultValue : value === "true");

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "staging", "production"]).default("development"),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  APP_ORIGIN: z.string().url().default("http://127.0.0.1:5173"),
  ALLOWED_ORIGINS: z.string().optional(),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
  DEPLOY_VERSION: z.string().min(1).optional(),
  BUILD_TIME: z.string().optional(),
  AUTH_SECRET: z.string().min(32).optional(),
  STUDENT_ID_HMAC_KEY: z.string().min(32).optional(),
  CLASS_ACTIVATION_CODE: z.string().min(8).optional(),
  FALLBACK_OWNER_ID: z.string().min(4).optional(),
  FALLBACK_OWNER_NAME: z.string().min(2).optional(),
  FALLBACK_OWNER_KEY: z.string().min(12).optional(),
  COOKIE_SECURE: booleanFromString(false),
  SESSION_DAYS: z.coerce.number().int().min(1).max(90).default(30),
  ADMIN_REAUTH_MINUTES: z.coerce.number().int().min(1).max(60).default(15),
});

export type ServerEnvironment = z.infer<typeof schema>;

export function loadEnvironment(source: NodeJS.ProcessEnv = process.env): ServerEnvironment {
  const parsed = schema.safeParse(source);
  if (!parsed.success) {
    const details = parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ");
    throw new Error(`Invalid server environment: ${details}`);
  }
  const value = parsed.data;
  if (value.NODE_ENV === "production") {
    const required = ["AUTH_SECRET", "STUDENT_ID_HMAC_KEY", "CLASS_ACTIVATION_CODE"] as const;
    const missing = required.filter((key) => !value[key]);
    if (missing.length) throw new Error(`Missing production environment: ${missing.join(", ")}`);
  }
  return value;
}

export const apiEnvironment = (nodeEnv: ServerEnvironment["NODE_ENV"]) => {
  if (nodeEnv === "production") return "production" as const;
  if (nodeEnv === "staging") return "staging" as const;
  return "development" as const;
};

/** APP_ORIGIN 加上可选的逗号分隔白名单，用于写请求的 Origin 校验。 */
export function allowedOriginSet(environment: Pick<ServerEnvironment, "APP_ORIGIN" | "ALLOWED_ORIGINS">) {
  const extra = (environment.ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((value) => value.trim().replace(/\/$/, ""))
    .filter(Boolean);
  return new Set([environment.APP_ORIGIN.replace(/\/$/, ""), ...extra]);
}