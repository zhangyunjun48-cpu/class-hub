import { randomUUID } from "node:crypto";
import Fastify from "fastify";
import type { ApiError } from "../../shared/types.js";
import { allowedOriginSet, loadEnvironment } from "./config/env.js";
import { createDatabase } from "./db/pool.js";
import { errorResponse, HttpError } from "./lib/http-error.js";
import { registerAdminRoutes } from "./routes/admin.js";
import { registerAuthRoutes } from "./routes/auth.js";
import { registerContentRoutes } from "./routes/content.js";
import { registerHealthRoutes } from "./routes/health.js";
import { registerScheduleRoutes } from "./routes/schedules.js";
import { registerTimetableRoutes } from "./routes/timetable.js";
import { ensureSystemOwner } from "./services/seed-owner.js";

const environment = loadEnvironment();
const database = createDatabase(environment.DATABASE_URL);
const app = Fastify({ logger: { level: environment.LOG_LEVEL }, requestIdHeader: "x-request-id", genReqId: () => randomUUID() });
const allowedOrigins = allowedOriginSet(environment);
const safeMethods = new Set(["GET", "HEAD", "OPTIONS"]);

database.pool.on("error", (error) => { app.log.error({ errorName: error.name, code: "DB_POOL_ERROR" }, "Unexpected PostgreSQL pool error"); });

await ensureSystemOwner(database.pool, environment);

// 写请求的 Origin 校验：浏览器跨站请求一定带 Origin，缺失视为服务端/CLI 调用。
app.addHook("onRequest", async (request, reply) => {
  if (safeMethods.has(request.method.toUpperCase())) return;
  const origin = request.headers.origin;
  if (!origin) return;
  if (!allowedOrigins.has(origin.replace(/\/$/, ""))) {
    return reply.code(403).send({ error: { code: "ORIGIN_FORBIDDEN", message: "请求来源不被允许", requestId: request.id } } satisfies ApiError);
  }
  return undefined;
});

await registerHealthRoutes(app, { pool: database.pool, environment, version: process.env.npm_package_version ?? "0.1.0", builtAt: environment.BUILD_TIME ?? null });
await registerAuthRoutes(app, { pool: database.pool, environment });
await registerScheduleRoutes(app, { pool: database.pool, environment });
await registerTimetableRoutes(app, { pool: database.pool, environment });
await registerContentRoutes(app, { pool: database.pool, environment });
await registerAdminRoutes(app, { pool: database.pool, environment });

app.addHook("onSend", async (_request, reply, payload) => { reply.header("X-Robots-Tag", "noindex, nofollow"); return payload; });
app.setNotFoundHandler((request, reply) => reply.code(404).send({ error: { code: "NOT_FOUND", message: "请求的接口不存在", requestId: request.id } } satisfies ApiError));
app.setErrorHandler((error, request, reply) => {
  if (error instanceof HttpError) return reply.code(error.statusCode).send(errorResponse(error, request.id));
  // 500 只记服务端日志，方便远程排查：不再像以前那样把原因完全吞掉。
  // 仍然不记请求体、Cookie、学号、激活码；也不记 pg 的 detail（那里可能带具体值）。
  const pg = error as { code?: unknown; table?: unknown; column?: unknown; constraint?: unknown };
  request.log.error(
    {
      code: "INTERNAL_ERROR",
      method: request.method,
      url: request.url,
      errorName: error instanceof Error ? error.name : "UnknownError",
      errorMessage: (error instanceof Error ? error.message : String(error)).slice(0, 300),
      pgCode: typeof pg.code === "string" ? pg.code : undefined,
      pgTable: typeof pg.table === "string" ? pg.table : undefined,
      pgColumn: typeof pg.column === "string" ? pg.column : undefined,
      pgConstraint: typeof pg.constraint === "string" ? pg.constraint : undefined,
    },
    "Request failed",
  );
  return reply.code(500).send({ error: { code: "INTERNAL_ERROR", message: "服务器暂时无法处理请求", requestId: request.id } } satisfies ApiError);
});

let shuttingDown = false;
async function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  app.log.info({ signal }, "Shutting down");
  await app.close(); await database.close(); process.exit(0);
}
process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));

await app.listen({ host: "0.0.0.0", port: environment.PORT });
app.log.info({ origin: environment.APP_ORIGIN }, "API listening");