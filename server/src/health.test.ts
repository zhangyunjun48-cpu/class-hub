import assert from "node:assert/strict";
import test from "node:test";
import { apiEnvironment } from "./config/env.js";
import { buildHealthResponse } from "./health.js";

test("reports a healthy database", async () => {
  const result = await buildHealthResponse({
    version: "0.1.0",
    environment: "staging",
    checkDatabase: async () => undefined,
    now: () => new Date("2026-09-14T00:00:00.000Z"),
  });

  assert.equal(result.ok, true);
  assert.equal(result.database.status, "up");
  assert.equal(result.time, "2026-09-14T00:00:00.000Z");
});

test("reports a database failure without leaking the error", async () => {
  const result = await buildHealthResponse({
    version: "0.1.0",
    environment: "production",
    checkDatabase: async () => {
      throw new Error("postgres://secret-host");
    },
  });

  assert.equal(result.ok, false);
  assert.equal(result.database.status, "down");
  assert.equal(result.database.latencyMs, null);
});

test("maps Node environments to API environments", () => {
  assert.equal(apiEnvironment("production"), "production");
  assert.equal(apiEnvironment("staging"), "staging");
  assert.equal(apiEnvironment("development"), "development");
  assert.equal(apiEnvironment("test"), "development");
});
