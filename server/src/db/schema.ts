import { integer, pgTable, smallint, text, timestamp } from "drizzle-orm/pg-core";

export const appMeta = pgTable("app_meta", {
  id: smallint("id").primaryKey().default(1),
  appName: text("app_name").notNull(),
  schemaVersion: integer("schema_version").notNull().default(1),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
