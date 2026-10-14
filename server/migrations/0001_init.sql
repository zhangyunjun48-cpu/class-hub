CREATE TABLE IF NOT EXISTS app_meta (
  id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  app_name text NOT NULL,
  schema_version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO app_meta (id, app_name, schema_version)
VALUES (1, '山东大学智软芯片新工科实验班 11 班共享站', 1)
ON CONFLICT (id) DO UPDATE
SET app_name = EXCLUDED.app_name,
    schema_version = EXCLUDED.schema_version,
    updated_at = now();
