export type ApiEnvironment = "development" | "staging" | "production";

export type DatabaseHealthStatus = "up" | "down";

export type MemberRole = "owner" | "admin" | "member";

/** @deprecated 使用 MemberRole，保留旧名以避免破坏既有引用。 */
export type UserRole = MemberRole;

export type ScheduleCategory = "course" | "task" | "exam" | "activity" | "meeting" | "class";

export type ScheduleImportance = "normal" | "important";

export interface HealthResponse {
  ok: boolean;
  version: string;
  environment: ApiEnvironment;
  database: {
    status: DatabaseHealthStatus;
    latencyMs: number | null;
  };
  time: string;
}

export interface VersionResponse {
  name: string;
  version: string;
  deployVersion: string | null;
  environment: ApiEnvironment;
  migrationVersion: number | null;
  builtAt: string | null;
}

export interface ApiError {
  error: {
    code: string;
    message: string;
    requestId: string;
    details?: unknown;
  };
}

export interface ScheduleDto {
  id: string;
  title: string;
  category: ScheduleCategory;
  importance: ScheduleImportance;
  startAt: string | null;
  dueAt: string | null;
  endAt: string | null;
  location: string;
  note: string;
  relatedLink: string;
  createdBy: string;
  updatedBy: string;
  version: number;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SessionMember {
  id: string;
  name: string;
  role: MemberRole;
  studentIdLast4: string;
  isSystemOwner: boolean;
  adminVerified: boolean;
}

export interface PublicResource {
  id: string;
  title: string;
  description: string;
  category: string;
  url: string;
  ownerName: string;
  official: boolean;
  updatedAt: string;
}

export interface TutorialStep {
  id: number;
  title: string;
  body: string;
  image: string;
}