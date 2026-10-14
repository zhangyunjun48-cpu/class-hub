CREATE TABLE IF NOT EXISTS members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id_hmac text NOT NULL UNIQUE,
  student_id_last4 text NOT NULL,
  name text NOT NULL,
  name_normalized text NOT NULL,
  group_name text NOT NULL DEFAULT '',
  role text NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member')),
  is_system_owner boolean NOT NULL DEFAULT false,
  active boolean NOT NULL DEFAULT true,
  activation_at timestamptz,
  onboarding_seen_at timestamptz,
  last_seen_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS members_name_normalized_idx ON members (name_normalized);
CREATE INDEX IF NOT EXISTS members_active_role_idx ON members (active, role);

CREATE TABLE IF NOT EXISTS sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id uuid NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  admin_reauth_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS sessions_member_idx ON sessions (member_id);
CREATE INDEX IF NOT EXISTS sessions_expiry_idx ON sessions (expires_at);

CREATE TABLE IF NOT EXISTS admin_credentials (
  member_id uuid PRIMARY KEY REFERENCES members(id) ON DELETE CASCADE,
  pin_hash text NOT NULL,
  failed_attempts integer NOT NULL DEFAULT 0,
  locked_until timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  category text NOT NULL DEFAULT 'class',
  importance text NOT NULL DEFAULT 'normal' CHECK (importance IN ('normal', 'important')),
  start_at timestamptz,
  due_at timestamptz,
  end_at timestamptz,
  location text NOT NULL DEFAULT '',
  note text NOT NULL DEFAULT '',
  related_link text NOT NULL DEFAULT '',
  created_by uuid NOT NULL REFERENCES members(id),
  updated_by uuid NOT NULL REFERENCES members(id),
  version integer NOT NULL DEFAULT 1,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (start_at IS NOT NULL OR due_at IS NOT NULL),
  CHECK (end_at IS NULL OR start_at IS NOT NULL),
  CHECK (end_at IS NULL OR end_at >= start_at),
  CHECK (due_at IS NULL OR start_at IS NULL OR due_at >= start_at)
);

CREATE INDEX IF NOT EXISTS schedules_updated_idx ON schedules (updated_at);
CREATE INDEX IF NOT EXISTS schedules_due_idx ON schedules (due_at) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS schedule_completions (
  schedule_id uuid NOT NULL REFERENCES schedules(id) ON DELETE CASCADE,
  member_id uuid NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  completed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (schedule_id, member_id)
);

CREATE TABLE IF NOT EXISTS announcements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  body text NOT NULL,
  pinned boolean NOT NULL DEFAULT false,
  created_by uuid NOT NULL REFERENCES members(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE TABLE IF NOT EXISTS revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  summary text NOT NULL,
  actor_id uuid NOT NULL REFERENCES members(id),
  actor_nickname text NOT NULL,
  before_json jsonb,
  after_json jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS revisions_created_idx ON revisions (created_at DESC);

CREATE TABLE IF NOT EXISTS resources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  category text NOT NULL DEFAULT '其他',
  url text NOT NULL,
  owner_name text NOT NULL DEFAULT '',
  official boolean NOT NULL DEFAULT false,
  created_by uuid REFERENCES members(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE INDEX IF NOT EXISTS resources_category_idx ON resources (category);

CREATE TABLE IF NOT EXISTS feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id uuid NOT NULL REFERENCES members(id),
  category text NOT NULL DEFAULT '其他',
  content text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'resolved', 'ignored')),
  admin_reply text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS feedback_member_idx ON feedback (member_id, created_at DESC);
CREATE INDEX IF NOT EXISTS feedback_status_idx ON feedback (status, created_at DESC);

CREATE TABLE IF NOT EXISTS roster_imports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  imported_by uuid NOT NULL REFERENCES members(id),
  row_count integer NOT NULL,
  summary jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS auth_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ip_hash text NOT NULL,
  student_id_hmac text,
  success boolean NOT NULL,
  attempted_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS auth_attempts_ip_idx ON auth_attempts (ip_hash, attempted_at DESC);

INSERT INTO resources (title, description, category, url, owner_name, official)
SELECT item.title, item.description, item.category, item.url, item.owner_name, true
FROM (VALUES
  ('本科生院教学管理服务平台', '选课、考试、成绩与培养方案查询', '常用系统', 'https://www.bkjx.sdu.edu.cn/', '学习委员'),
  ('山东大学信息化工作办公室', '校园网络与信息化服务', '常用系统', 'https://nc.sdu.edu.cn/', '班委'),
  ('山东大学图书馆', '馆藏检索、电子资源与借阅服务', '学习资源', 'https://library.sdu.edu.cn/', '学习委员'),
  ('山东大学学生在线', '学生服务与校园活动信息', '校园生活', 'https://online.sdu.edu.cn/', '班委')
) AS item(title, description, category, url, owner_name)
WHERE NOT EXISTS (SELECT 1 FROM resources);
