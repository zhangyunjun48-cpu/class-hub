import assert from "node:assert/strict";
import test from "node:test";

class MemoryStorage {
  constructor() { this.map = new Map(); }
  getItem(key) { return this.map.has(key) ? this.map.get(key) : null; }
  setItem(key, value) { this.map.set(key, String(value)); }
  removeItem(key) { this.map.delete(key); }
}

test("detects version conflicts and enforces admin deletion", async () => {
  const OriginalBroadcastChannel = globalThis.BroadcastChannel;
  globalThis.BroadcastChannel = undefined;
  const storage = new MemoryStorage();
  globalThis.window = {
    localStorage: storage,
    addEventListener() {},
    removeEventListener() {}
  };

  const module = await import(`../src/demo/MockScheduleRepository.js?test=${Date.now()}`);
  const repoA = new module.MockScheduleRepository();
  const repoB = new module.MockScheduleRepository();
  const member = { memberId: "member-1", nickname: "同学甲", role: "member" };
  const admin = { memberId: "admin-1", nickname: "班委甲", role: "admin" };

  const created = await repoA.create({
    title: "冲突测试",
    category: "task",
    startAt: null,
    dueAt: "2026-09-18T12:00:00.000Z",
    endAt: null,
    location: "线上",
    note: "",
    important: false
  }, member);

  await repoA.update(created.id, { ...created, title: "第一次修改" }, created.version, member);

  await assert.rejects(
    () => repoB.update(created.id, { ...created, title: "过期修改" }, created.version, member),
    (error) => error.code === "VERSION_CONFLICT"
  );

  await assert.rejects(
    () => repoB.softDelete(created.id, 2, member),
    (error) => error.code === "FORBIDDEN"
  );

  await repoB.softDelete(created.id, 2, admin);
  const snapshot = await repoB.getSnapshot();
  assert.ok(snapshot.store.schedules.find((item) => item.id === created.id)?.deletedAt);

  delete globalThis.window;
  globalThis.BroadcastChannel = OriginalBroadcastChannel;
});
