import assert from "node:assert/strict";
import test from "node:test";
import { hasVersionConflict, scheduleCreateViolation, scheduleWriteViolation } from "./schedule-policy.js";

test("普通成员可以创建和修改普通日程", () => {
  assert.equal(scheduleCreateViolation("member", { importance: "normal" }), null);
  assert.equal(scheduleWriteViolation("member", { importance: "normal" }, { importance: "normal" }), null);
});

test("普通成员不能创建重要日程", () => {
  const violation = scheduleCreateViolation("member", { importance: "important" });
  assert.equal(violation?.statusCode, 403);
  assert.equal(violation?.code, "FORBIDDEN");
});

test("重要日程只有管理员可写", () => {
  const violation = scheduleWriteViolation("member", { importance: "important" }, { importance: "important" });
  assert.equal(violation?.statusCode, 403);
  assert.equal(scheduleWriteViolation("admin", { importance: "important" }, { importance: "important" }), null);
  assert.equal(scheduleWriteViolation("owner", { importance: "important" }, { importance: "normal" }), null);
});

test("普通成员不能把普通日程升级为重要", () => {
  const violation = scheduleWriteViolation("member", { importance: "normal" }, { importance: "important" });
  assert.equal(violation?.code, "FORBIDDEN");
  assert.equal(scheduleWriteViolation("admin", { importance: "normal" }, { importance: "important" }), null);
});

test("版本号不一致即冲突", () => {
  assert.equal(hasVersionConflict(3, 3), false);
  assert.equal(hasVersionConflict(4, 3), true);
});