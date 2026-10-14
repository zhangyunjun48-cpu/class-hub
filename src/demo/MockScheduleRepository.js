import { createDemoStore } from "./seed.js";
import { validateScheduleDraft } from "./schedule-logic.js";

export const DEMO_INVITE_CODE = "CLASS-DEMO";
export const DEMO_ADMIN_CODE = "CLASS-ADMIN";
export const DEMO_SESSION_KEY = "classhub.demo.session.v2";

const SNAPSHOT_KEY = "classhub.demo.snapshot.v2";
const CHANNEL_NAME = "classhub-schedule-demo";

export class RepositoryError extends Error {
  constructor(code, message, current = null) {
    super(message);
    this.name = "RepositoryError";
    this.code = code;
    this.current = current;
  }
}

const clone = (value) => {
  if (typeof structuredClone === "function") return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
};

const uuid = () => {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `demo-${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

function loadStore() {
  try {
    const stored = window.localStorage.getItem(SNAPSHOT_KEY);
    if (!stored) return createDemoStore();
    const parsed = JSON.parse(stored);
    if (parsed?.schemaVersion !== 2) return createDemoStore();
    return parsed;
  } catch {
    return createDemoStore();
  }
}

function assertAdmin(member) {
  if (member?.role !== "admin") {
    throw new RepositoryError("FORBIDDEN", "只有班委演示身份可以执行此操作");
  }
}

function assertVersion(schedule, version) {
  if (!schedule) throw new RepositoryError("NOT_FOUND", "日程不存在或已被处理");
  if (schedule.version !== version) {
    throw new RepositoryError("VERSION_CONFLICT", "已有同学修改了这条日程", clone(schedule));
  }
}

function revision(action, entityId, summary, actor) {
  return {
    id: uuid(),
    action,
    entityId,
    summary,
    actor: actor?.nickname ?? "演示用户",
    createdAt: new Date().toISOString()
  };
}

export class MockScheduleRepository {
  constructor() {
    this.channel = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel(CHANNEL_NAME) : null;
    this.listeners = new Set();
    if (this.channel) {
      this.channel.addEventListener("message", (event) => {
        if (event.data?.type === "store-updated") this.notify(event.data.store);
      });
    }
    if (typeof window !== "undefined") {
      window.addEventListener("storage", (event) => {
        if (event.key === SNAPSHOT_KEY && event.newValue) {
          try { this.notify(JSON.parse(event.newValue)); } catch { /* ignore */ }
        }
      });
    }
  }

  notify(store) {
    const snapshot = { store: clone(store), serverTime: new Date().toISOString(), demo: true };
    this.listeners.forEach((listener) => listener(snapshot));
  }

  write(store) {
    window.localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(store));
    this.channel?.postMessage({ type: "store-updated", store: clone(store) });
    this.notify(store);
    return clone(store);
  }

  mutate(mutator) {
    const store = loadStore();
    const next = mutator(store);
    next.storeVersion = (store.storeVersion ?? 0) + 1;
    next.updatedAt = new Date().toISOString();
    return this.write(next);
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async getSnapshot() {
    return { store: clone(loadStore()), serverTime: new Date().toISOString(), demo: true };
  }

  async list() {
    return clone(loadStore().schedules.filter((schedule) => !schedule.deletedAt));
  }

  async create(draft, member) {
    const errors = validateScheduleDraft(draft);
    if (Object.keys(errors).length) {
      throw new RepositoryError("VALIDATION_ERROR", Object.values(errors)[0]);
    }
    const now = new Date().toISOString();
    const schedule = {
      ...draft,
      id: uuid(),
      title: draft.title.trim(),
      createdBy: member.nickname,
      updatedBy: member.nickname,
      version: 1,
      deletedAt: null,
      createdAt: now,
      updatedAt: now
    };
    await this.mutate((store) => ({
      ...store,
      schedules: [...store.schedules, schedule],
      revisions: [revision("create", schedule.id, `新增「${schedule.title}」`, member), ...store.revisions].slice(0, 100)
    }));
    return clone(schedule);
  }

  async update(id, draft, version, member) {
    const errors = validateScheduleDraft(draft);
    if (Object.keys(errors).length) {
      throw new RepositoryError("VALIDATION_ERROR", Object.values(errors)[0]);
    }
    const current = loadStore().schedules.find((item) => item.id === id);
    assertVersion(current, version);
    const updated = {
      ...current,
      ...draft,
      title: draft.title.trim(),
      updatedBy: member.nickname,
      version: current.version + 1,
      updatedAt: new Date().toISOString()
    };
    await this.mutate((store) => ({
      ...store,
      schedules: store.schedules.map((item) => (item.id === id ? updated : item)),
      revisions: [revision("update", id, `修改「${updated.title}」`, member), ...store.revisions].slice(0, 100)
    }));
    return clone(updated);
  }

  async softDelete(id, version, member) {
    assertAdmin(member);
    const current = loadStore().schedules.find((item) => item.id === id);
    assertVersion(current, version);
    await this.mutate((store) => ({
      ...store,
      schedules: store.schedules.map((item) => item.id === id ? { ...item, deletedAt: new Date().toISOString(), version: item.version + 1 } : item),
      revisions: [revision("delete", id, `删除「${current.title}」`, member), ...store.revisions].slice(0, 100)
    }));
  }

  async restore(id, member) {
    assertAdmin(member);
    const current = loadStore().schedules.find((item) => item.id === id);
    if (!current) throw new RepositoryError("NOT_FOUND", "日程不存在");
    await this.mutate((store) => ({
      ...store,
      schedules: store.schedules.map((item) => item.id === id ? { ...item, deletedAt: null, version: item.version + 1, updatedBy: member.nickname } : item),
      revisions: [revision("restore", id, `恢复「${current.title}」`, member), ...store.revisions].slice(0, 100)
    }));
  }

  async complete(id, member, completed) {
    const current = loadStore().schedules.find((item) => item.id === id);
    if (!current) throw new RepositoryError("NOT_FOUND", "日程不存在");
    await this.mutate((store) => {
      const members = new Set(store.completions[id] ?? []);
      if (completed) members.add(member.memberId);
      else members.delete(member.memberId);
      return {
        ...store,
        completions: { ...store.completions, [id]: [...members] },
        revisions: [revision("complete", id, `${completed ? "完成" : "取消完成"}「${current.title}」`, member), ...store.revisions].slice(0, 100)
      };
    });
  }

  async publishAnnouncement(input, member) {
    assertAdmin(member);
    const title = String(input?.title ?? "").trim();
    const body = String(input?.body ?? "").trim();
    if (!title || !body) {
      throw new RepositoryError("VALIDATION_ERROR", "请填写公告标题和内容");
    }
    const now = new Date().toISOString();
    const announcement = {
      id: uuid(),
      title,
      body,
      pinned: Boolean(input.pinned),
      createdBy: member.nickname,
      createdAt: now,
      updatedAt: now,
      deletedAt: null
    };
    await this.mutate((store) => ({
      ...store,
      announcements: [announcement, ...store.announcements],
      revisions: [revision("announcement", announcement.id, `发布公告「${title}」`, member), ...store.revisions].slice(0, 100)
    }));
    return clone(announcement);
  }

  async resetDemo() {
    const store = this.write(createDemoStore());
    return { store, serverTime: new Date().toISOString(), demo: true };
  }
}

export const mockScheduleRepository = new MockScheduleRepository();

