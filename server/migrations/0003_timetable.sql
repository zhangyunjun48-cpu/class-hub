-- 课表模块：学期 / 课程模板 / 例外（停课、调课、补课）
-- 课程实例不落库，按周次实时推导，避免与模板脱节。

CREATE TABLE IF NOT EXISTS semesters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  start_date date NOT NULL,
  sections jsonb NOT NULL DEFAULT '[]'::jsonb,
  note text NOT NULL DEFAULT '',
  active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES members(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 同一时刻只允许一个生效学期
CREATE UNIQUE INDEX IF NOT EXISTS semesters_single_active_idx ON semesters (active) WHERE active;

CREATE TABLE IF NOT EXISTS course_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  semester_id uuid NOT NULL REFERENCES semesters(id) ON DELETE CASCADE,
  name text NOT NULL,
  course_code text NOT NULL DEFAULT '',
  class_no text NOT NULL DEFAULT '',
  teachers text NOT NULL DEFAULT '',
  location text NOT NULL DEFAULT '',
  weekday smallint NOT NULL CHECK (weekday BETWEEN 1 AND 7),
  period_start smallint NOT NULL CHECK (period_start BETWEEN 1 AND 5),
  period_end smallint NOT NULL CHECK (period_end BETWEEN 1 AND 5),
  weeks integer[] NOT NULL,
  note text NOT NULL DEFAULT '',
  version integer NOT NULL DEFAULT 1,
  created_by uuid REFERENCES members(id),
  updated_by uuid REFERENCES members(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (period_end >= period_start),
  CHECK (array_length(weeks, 1) IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS course_templates_semester_idx ON course_templates (semester_id, weekday);

CREATE TABLE IF NOT EXISTS course_exceptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  semester_id uuid NOT NULL REFERENCES semesters(id) ON DELETE CASCADE,
  template_id uuid REFERENCES course_templates(id) ON DELETE CASCADE,
  date date NOT NULL,
  kind text NOT NULL CHECK (kind IN ('cancel', 'move', 'add')),
  title text NOT NULL DEFAULT '',
  new_start_at timestamptz,
  new_end_at timestamptz,
  new_location text NOT NULL DEFAULT '',
  note text NOT NULL DEFAULT '',
  version integer NOT NULL DEFAULT 1,
  created_by uuid REFERENCES members(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  -- 补课必须能显示成一门课：要么关联模板，要么自带名称
  CHECK (kind <> 'add' OR template_id IS NOT NULL OR title <> '')
);

-- 同一次课只能有一条停课/调课记录
CREATE UNIQUE INDEX IF NOT EXISTS course_exceptions_template_date_idx
  ON course_exceptions (template_id, date)
  WHERE template_id IS NOT NULL AND kind IN ('cancel', 'move');

CREATE INDEX IF NOT EXISTS course_exceptions_date_idx ON course_exceptions (semester_id, date);