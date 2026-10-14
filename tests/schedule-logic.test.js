import assert from "node:assert/strict";
import test from "node:test";
import {
  compareSchedules,
  isDueSoon,
  isOverdue,
  searchSchedules,
  validateScheduleDraft
} from "../src/demo/schedule-logic.js";

const baseDraft = {
  title: "测试日程",
  category: "task",
  startAt: null,
  dueAt: "2026-09-16T12:00:00.000Z",
  endAt: null,
  location: "线上",
  note: "备注",
  important: false
};

test("requires at least one of startAt and dueAt", () => {
  const errors = validateScheduleDraft({ ...baseDraft, dueAt: null });
  assert.equal(errors.startAt, "开始时间和截止时间至少填写一个");
});

test("rejects endAt earlier than startAt", () => {
  const errors = validateScheduleDraft({
    ...baseDraft,
    startAt: "2026-09-16T12:00:00.000Z",
    endAt: "2026-09-16T10:00:00.000Z"
  });
  assert.equal(errors.endAt, "结束时间不能早于开始时间");
});

test("requires endAt to have startAt", () => {
  const errors = validateScheduleDraft({
    ...baseDraft,
    startAt: null,
    dueAt: "2026-09-16T12:00:00.000Z",
    endAt: "2026-09-16T13:00:00.000Z"
  });
  assert.equal(errors.endAt, "填写结束时间前需要先填写开始时间");
});

test("searches title, location and note", () => {
  const items = [
    { title: "芯片实验", location: "A304", note: "带电脑" },
    { title: "班会", location: "线上", note: "讨论分组" }
  ];
  assert.equal(searchSchedules(items, "A304").length, 1);
  assert.equal(searchSchedules(items, "讨论").length, 1);
});

test("uses dueAt for overdue and due-soon reminders", () => {
  const now = new Date("2026-09-16T00:00:00.000Z");
  assert.equal(isOverdue({ ...baseDraft, dueAt: "2026-09-15T00:00:00.000Z" }, now), true);
  assert.equal(isDueSoon({ ...baseDraft, dueAt: "2026-09-18T00:00:00.000Z" }, now), true);
  assert.equal(isDueSoon({ ...baseDraft, dueAt: null, startAt: "2026-09-18T00:00:00.000Z" }, now), false);
});

test("sorts deadline-only items by dueAt", () => {
  const later = { ...baseDraft, id: "later", dueAt: "2026-09-18T00:00:00.000Z" };
  const earlier = { ...baseDraft, id: "earlier", dueAt: "2026-09-17T00:00:00.000Z" };
  assert.deepEqual([later, earlier].sort(compareSchedules).map((item) => item.id), ["earlier", "later"]);
});
