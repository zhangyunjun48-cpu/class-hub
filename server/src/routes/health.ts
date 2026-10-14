import type { FastifyInstance } from "fastify";
import type { Pool } from "pg";
import type { VersionResponse } from "../../../shared/types.js";
import { apiEnvironment, type ServerEnvironment } from "../config/env.js";
import { buildHealthResponse } from "../health.js";

interface HealthRouteOptions {
  pool: Pool;
  environment: ServerEnvironment;
  version: string;
  builtAt: string | null;
}

export async function registerHealthRoutes(app: FastifyInstance, options: HealthRouteOptions) {
  app.get("/api/health", async (_request, reply) => {
    const response = await buildHealthResponse({
      version: options.version,
      environment: apiEnvironment(options.environment.NODE_ENV),
      checkDatabase: async () => {
        await options.pool.query("SELECT 1");
      },
    });
    return reply.code(response.ok ? 200 : 503).send(response);
  });

  app.get("/api/version", async (_request, reply) => {
    let migrationVersion: number | null = null;
    try {
      const result = await options.pool.query<{ version: string | null }>(
        "SELECT max(version::text) AS version FROM schema_migrations",
      );
      const value = result.rows[0]?.version;
      migrationVersion = value ? Number.parseInt(value.slice(0, 4), 10) : null;
    } catch {
      migrationVersion = null;
    }

    const response: VersionResponse = {
      name: "sdu-class-11-api",
      version: options.version,
      deployVersion: options.environment.DEPLOY_VERSION ?? null,
      environment: apiEnvironment(options.environment.NODE_ENV),
      migrationVersion,
      builtAt: options.builtAt,
    };
    return reply.send(response);
  });
}
