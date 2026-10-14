import assert from "node:assert/strict";
import test from "node:test";
import { fromShanghaiInput, formatShanghai, toShanghaiInput } from "../src/demo/time.js";

test("converts Shanghai wall time to UTC", () => {
  assert.equal(
    fromShanghaiInput("2026-09-16T08:00"),
    "2026-09-16T00:00:00.000Z"
  );
});

test("converts UTC back to Shanghai datetime-local value", () => {
  assert.equal(
    toShanghaiInput("2026-09-16T00:00:00.000Z"),
    "2026-09-16T08:00"
  );
});

test("formats timestamps in Asia/Shanghai regardless of process timezone", () => {
  assert.equal(
    formatShanghai("2026-09-16T00:00:00.000Z", "yyyy-MM-dd HH:mm"),
    "2026-09-16 08:00"
  );
});
