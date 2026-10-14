import "dotenv/config";
import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "pg";

const MIGRATIONS_TABLE = `
  CREATE TABLE IF NOT EXISTS schema_migrations (
    version text PRIMARY KEY,
    checksum text NOT NULL,
    applied_at timestamptz NOT NULL DEFAULT now()
  )
`;

const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");

export function migrationChecksums(sql: string) {
  const normalizedSql = sql.replace(/\r\n?/g, "\n");
  return {
    checksum: sha256(normalizedSql),
    rawChecksum: sha256(sql),
  };
}

export async function runMigrations(databaseUrl: string, migrationDirectory: string) {
  const client = new Client({ connectionString: databaseUrl, application_name: "class-hub-migrator" });
  await client.connect();

  try {
    await client.query(MIGRATIONS_TABLE);
    const files = (await readdir(migrationDirectory))
      .filter((file) => /^\d+.*\.sql$/.test(file))
      .sort((left, right) => left.localeCompare(right));

    for (const file of files) {
      const sql = await readFile(path.join(migrationDirectory, file), "utf8");
      const { checksum, rawChecksum } = migrationChecksums(sql);
      const existing = await client.query<{ checksum: string }>(
        "SELECT checksum FROM schema_migrations WHERE version = $1",
        [file],
      );

      const previousChecksum = existing.rows[0]?.checksum;
      if (existing.rowCount && previousChecksum !== checksum && previousChecksum !== rawChecksum) {
        throw new Error(`Migration ${file} changed after it was applied`);
      }
      if (existing.rowCount) {
        if (previousChecksum !== checksum) {
          await client.query(
            "UPDATE schema_migrations SET checksum = $1 WHERE version = $2",
            [checksum, file],
          );
        }
        continue;
      }

      await client.query("BEGIN");
      try {
        await client.query(sql);
        await client.query(
          "INSERT INTO schema_migrations (version, checksum) VALUES ($1, $2)",
          [file, checksum],
        );
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    }
  } finally {
    await client.end();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required");
  const directory = path.resolve(process.cwd(), "migrations");
  await runMigrations(databaseUrl, directory);
  console.log(`Migrations completed from ${directory}`);
}
