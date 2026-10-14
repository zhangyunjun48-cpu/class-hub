import { parseCsvLine } from "./csv.js";

export const BASIC_ROLES = ["owner", "admin", "member"] as const;

export type BasicRole = (typeof BASIC_ROLES)[number];

export interface RosterRow {
  studentId: string;
  name: string;
  group: string;
  initialRole: BasicRole;
  active: boolean;
  line: number;
}

export interface RosterParseResult {
  rows: RosterRow[];
  errors: string[];
}

export const ROSTER_HEADERS = ["student_id", "name", "group", "initial_role", "active"] as const;

const normalizeStudentId = (value: string) => value.replace(/\s+/g, "").toUpperCase();

/**
 * 解析 UTF-8 名单 CSV。返回的 rows 含明文 student_id，仅用于立即生成 HMAC 与末四位，
 * 不允许写入数据库或日志。
 */
export function parseRosterCsv(csv: string): RosterParseResult {
  const lines = csv.replace(/^\uFEFF/, "").split(/\r?\n/).filter((line) => line.trim());
  if (!lines.length) return { rows: [], errors: ["CSV 为空"] };
  const headers = parseCsvLine(lines[0] ?? "").map((header) => header.trim());
  if (ROSTER_HEADERS.some((header, index) => headers[index] !== header)) {
    return { rows: [], errors: [`表头必须为：${ROSTER_HEADERS.join(",")}`] };
  }
  const errors: string[] = [];
  const rows = lines.slice(1).map((line, index) => {
    const cells = parseCsvLine(line);
    const studentId = cells[0] ?? "";
    const name = cells[1] ?? "";
    const group = cells[2] ?? "";
    const initialRole = (cells[3] || "member") as BasicRole;
    const activeValue = (cells[4] || "true").toLowerCase();
    if (!/^[A-Za-z0-9_-]{4,32}$/.test(studentId)) errors.push(`第 ${index + 2} 行学号格式不正确`);
    if (name.trim().length < 2) errors.push(`第 ${index + 2} 行姓名不正确`);
    if (!BASIC_ROLES.includes(initialRole)) errors.push(`第 ${index + 2} 行角色必须是 owner/admin/member`);
    if (!["true", "false", "1", "0"].includes(activeValue)) errors.push(`第 ${index + 2} 行 active 必须是 true/false`);
    return { studentId, name: name.trim(), group: group.trim(), initialRole, active: activeValue === "true" || activeValue === "1", line: index + 2 };
  });
  const seen = new Set<string>();
  rows.forEach((row) => {
    const normalized = normalizeStudentId(row.studentId);
    if (seen.has(normalized)) errors.push(`第 ${row.line} 行学号重复`);
    seen.add(normalized);
  });
  return { rows, errors };
}