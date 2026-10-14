import assert from "node:assert/strict";
import test from "node:test";
import Fastify from "fastify";
import type { Pool } from "pg";
import type { ServerEnvironment } from "../config/env.js";
import { registerHealthRoutes } from "./health.js";

const environment: ServerEnvironment = {
  NODE_ENV: "staging",
  PORT: 3000,
  DATABASE_URL: "postgresql://test:test@example.invalid/test",
  APP_ORIGIN: "https://staging.example.cn",
  LOG_LEVEL: "silent",
  DEPLOY_VERSION: "v-test",
  COOKIE_SECURE: false,
  SESSION_DAYS: 30,
  ADMIN_REAUTH_MINUTES: 15,
};

test("GET /api/health returns 200 when PostgreSQL is reachable", async () => {
  const app = Fastify({ logger: false });
  const pool = { query: async () => ({ rows: [], rowCount: 1 }) } as unknown as Pool;
  await registerHealthRoutes(app, { pool, environment, version: "0.1.0", builtAt: null });

  const response = await app.inject({ method: "GET", url: "/api/health" });
  assert.equal(response.statusCode, 200);
  assert.equal(response.json().ok, true);
  assert.equal(response.json().database.status, "up");
  await app.close();
});

test("GET /api/health returns sanitized 503 when PostgreSQL is unavailable", async () => {
  const app = Fastify({ logger: false });
  const pool = { query: async () => { throw new Error("postgres://secret"); } } as unknown as Pool;
  await registerHealthRoutes(app, { pool, environment, version: "0.1.0", builtAt: null });

  const response = await app.inject({ method: "GET", url: "/api/health" });
  assert.equal(response.statusCode, 503);
  assert.equal(response.json().database.status, "down");
  assert.doesNotMatch(response.body, /secret/);
  await app.close();
});

test("GET /api/version returns deployment and migration metadata", async () => {
  const app = Fastify({ logger: false });
  const pool = { query: async () => ({ rows: [{ version: "0001_init.sql" }], rowCount: 1 }) } as unknown as Pool;
  await registerHealthRoutes(app, { pool, environment, version: "0.1.0", builtAt: "2026-09-14T00:00:00.000Z" });

  const response = await app.inject({ method: "GET", url: "/api/version" });
  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), {
    name: "sdu-class-11-api",
    version: "0.1.0",
    deployVersion: "v-test",
    environment: "staging",
    migrationVersion: 1,
    builtAt: "2026-09-14T00:00:00.000Z",
  });
  await app.close();
});

