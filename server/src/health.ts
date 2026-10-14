import type { ApiEnvironment, HealthResponse } from "../../shared/types.js";

export interface HealthCheckDependencies {
  version: string;
  environment: ApiEnvironment;
  checkDatabase: () => Promise<void>;
  now?: () => Date;
}

export async function buildHealthResponse({
  version,
  environment,
  checkDatabase,
  now = () => new Date(),
}: HealthCheckDependencies): Promise<HealthResponse> {
  const startedAt = performance.now();
  try {
    await checkDatabase();
    return {
      ok: true,
      version,
      environment,
      database: {
        status: "up",
        latencyMs: Math.max(0, Math.round(performance.now() - startedAt)),
      },
      time: now().toISOString(),
    };
  } catch {
    return {
      ok: false,
      version,
      environment,
      database: {
        status: "down",
        latencyMs: null,
      },
      time: now().toISOString(),
    };
  }
}
