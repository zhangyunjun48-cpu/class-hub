import type { MemberRole, ScheduleImportance } from "../../../shared/types.js";

export interface PolicyViolation {
  statusCode: number;
  code: string;
  message: string;
}

export const isAdminRole = (role: MemberRole) => role === "owner" || role === "admin";

/**
 * 普通日程全班可直接协作修改；重要日程只有管理员可写。
 * 返回 null 表示允许，否则返回应当抛出的错误。
 */
export function scheduleWriteViolation(
  role: MemberRole,
  current: { importance: ScheduleImportance },
  next: { importance: ScheduleImportance },
): PolicyViolation | null {
  if (isAdminRole(role)) return null;
  if (current.importance === "important") {
    return { statusCode: 403, code: "FORBIDDEN", message: "重要日程只能由管理员修改" };
  }
  if (next.importance === "important") {
    return { statusCode: 403, code: "FORBIDDEN", message: "普通成员不能把日程设为重要" };
  }
  return null;
}

export function scheduleCreateViolation(role: MemberRole, next: { importance: ScheduleImportance }): PolicyViolation | null {
  if (isAdminRole(role)) return null;
  if (next.importance === "important") {
    return { statusCode: 403, code: "FORBIDDEN", message: "重要日程只能由管理员创建" };
  }
  return null;
}

export const hasVersionConflict = (currentVersion: number, expectedVersion: number) => currentVersion !== expectedVersion;