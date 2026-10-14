-- 修复：services/timetable.ts 的 loadTemplates 用了 `WHERE semester_id = $1 AND active`，
-- 但 0003_timetable.sql 建 course_templates 时漏了这一列，导致：
--   一旦存在学期（也就是导入课表成功后），/api/timetable 与 /api/sync 都会 500。
-- 单元测试只覆盖纯函数、不连库，所以一直没暴露。
--
-- 加上这一列（默认 true，既有数据自动生效），保留"停用某门课"的能力。

ALTER TABLE course_templates ADD COLUMN IF NOT EXISTS active boolean NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS course_templates_active_idx
  ON course_templates (semester_id, weekday, period_start) WHERE active;