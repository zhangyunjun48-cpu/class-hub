export type ScheduleCategory = "course" | "task" | "exam" | "activity" | "meeting" | "class";
export type DemoRole = "member" | "admin";

export interface Schedule {
  id: string;
  title: string;
  category: ScheduleCategory;
  startAt: string | null;
  dueAt: string | null;
  endAt: string | null;
  location: string;
  note: string;
  important: boolean;
  createdBy: string;
  updatedBy: string;
  version: number;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ScheduleDraft {
  title: string;
  category: ScheduleCategory;
  startAt: string | null;
  dueAt: string | null;
  endAt: string | null;
  location: string;
  note: string;
  important: boolean;
}

export interface DemoMember {
  id: string;
  nickname: string;
  role: DemoRole;
  joinedAt: string;
}

export interface DemoSession {
  memberId: string;
  nickname: string;
  role: DemoRole;
}

export interface Announcement {
  id: string;
  title: string;
  body: string;
  pinned: boolean;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface ScheduleRevision {
  id: string;
  action: "create" | "update" | "delete" | "restore" | "complete" | "announcement";
  entityId: string;
  summary: string;
  actor: string;
  createdAt: string;
}

export interface DemoStore {
  schemaVersion: 2;
  storeVersion: number;
  schedules: Schedule[];
  announcements: Announcement[];
  completions: Record<string, string[]>;
  members: DemoMember[];
  revisions: ScheduleRevision[];
  updatedAt: string;
}

export interface SyncSnapshot {
  store: DemoStore;
  serverTime: string;
  demo: true;
}

export type RepositoryErrorCode =
  | "VALIDATION_ERROR"
  | "VERSION_CONFLICT"
  | "FORBIDDEN"
  | "NOT_FOUND";

export interface RepositoryErrorShape {
  code: RepositoryErrorCode;
  message: string;
  current?: Schedule;
}
