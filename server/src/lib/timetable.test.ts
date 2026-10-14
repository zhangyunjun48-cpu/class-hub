import assert from "node:assert/strict";
import test from "node:test";
import {
  addDays,
  expandOccurrences,
  extractWeekText,
  formatWeeks,
  normalizeSections,
  normalizeToMonday,
  parsePeriodRange,
  parseWeeks,
  pickNext,
  shanghaiDateKey,
  toIsoAt,
  weekNumber,
  weekdayOf,
  type CourseTemplateInput,
} from "./timetable.js";

test("周次解析支持区间、单周与逗号枚举", () => {
  assert.deepEqual(parseWeeks("4-18"), Array.from({ length: 15 }, (_, index) => index + 4));
  assert.deepEqual(parseWeeks("6"), [6]);
  assert.deepEqual(parseWeeks("1-3,5"), [1, 2, 3, 5]);
  assert.deepEqual(parseWeeks(""), []);
});

test("从教务文本里取出周次片段", () => {
  assert.equal(extractWeekText("第4-18周([周])[01-02节]"), "4-18");
  assert.equal(extractWeekText("第6周([周])[01-02-03-04-05-06-07-08节]"), "6");
  assert.equal(extractWeekText("软件园1区307d"), "");
  assert.equal(formatWeeks([4, 5, 6, 7, 9]), "4-7,9周");
});

test("节次解析：小节区间映射到 1-5 节，含整天课", () => {
  assert.deepEqual(parsePeriodRange("[01-02节]"), { start: 1, end: 1 });
  assert.deepEqual(parsePeriodRange("[03-04节]"), { start: 2, end: 2 });
  assert.deepEqual(parsePeriodRange("[09-10节]"), { start: 5, end: 5 });
  assert.deepEqual(parsePeriodRange("[01-02-03-04-05-06-07-08节]"), { start: 1, end: 4 });
  assert.equal(parsePeriodRange("没有节次"), null);
});

test("时区固定为 +08:00（中国自 1991 年起无夏令时）", () => {
  assert.equal(toIsoAt("2026-10-05", "08:00"), "2026-10-05T00:00:00.000Z");
  assert.equal(toIsoAt("2026-10-05", "19:00"), "2026-10-05T11:00:00.000Z");
  assert.equal(shanghaiDateKey("2026-10-04T16:30:00.000Z"), "2026-10-05");
  assert.equal(shanghaiDateKey("2026-10-04T15:30:00.000Z"), "2026-10-04");
});

test("日期与周次计算跨月跨年", () => {
  assert.equal(weekdayOf("2026-10-05"), 1);
  assert.equal(weekdayOf("2026-10-11"), 7);
  assert.equal(normalizeToMonday("2026-10-07"), "2026-10-05");
  assert.equal(addDays("2026-12-30", 5), "2027-01-04");
  assert.equal(weekNumber("2026-10-05", "2026-08-31"), 6);
  assert.equal(weekNumber("2026-10-12", "2026-08-31"), 7);
  assert.equal(weekNumber("2026-08-24", "2026-08-31"), 0);
});

test("节次表规范化：非法输入回退默认值", () => {
  const sections = normalizeSections([{ no: 1, start: "08:00", end: "09:50" }]);
  assert.equal(sections.length, 5);
  assert.equal(sections[0]?.start, "08:00");
  const custom = normalizeSections(
    [1, 2, 3, 4, 5].map((no) => ({ no, start: "0" + no + ":00", end: "0" + no + ":45" })),
  );
  assert.equal(custom[4]?.start, "05:00");
});

const semester = {
  startDate: "2026-08-31",
  sections: normalizeSections(undefined),
};

const math: CourseTemplateInput = {
  id: "t-math",
  name: "高等数学(1)",
  courseCode: "sd00920120",
  classNo: "321",
  teachers: "郑修才,韩国平",
  location: "软件园1区307d",
  weekday: 1,
  periodStart: 1,
  periodEnd: 1,
  weeks: parseWeeks("4-18"),
  note: "",
};

test("按周次展开：命中周次才生成课程实例", () => {
  const occurrences = expandOccurrences({ ...semester, templates: [math], exceptions: [], from: "2026-10-05", to: "2026-10-11" });
  assert.equal(occurrences.length, 1);
  assert.equal(occurrences[0]?.date, "2026-10-05");
  assert.equal(occurrences[0]?.weekNo, 6);
  assert.equal(occurrences[0]?.startAt, "2026-10-05T00:00:00.000Z");
  assert.equal(occurrences[0]?.endAt, "2026-10-05T01:50:00.000Z");
  assert.equal(occurrences[0]?.changed, false);

  // 第 3 周（2026-09-14 ~ 09-20）不在 4-18 周内
  const early = expandOccurrences({ ...semester, templates: [math], exceptions: [], from: "2026-09-14", to: "2026-09-20" });
  assert.equal(early.length, 0);
});

test("学期起始日不是周一时自动归一到周一", () => {
  const shifted = expandOccurrences({
    ...semester,
    startDate: "2026-09-02",
    templates: [math],
    exceptions: [],
    from: "2026-10-05",
    to: "2026-10-11",
  });
  assert.equal(shifted.length, 1);
  assert.equal(shifted[0]?.weekNo, 6);
});

test("例外：停课取消、调课改时间地点、补课新增", () => {
  const cancelled = expandOccurrences({
    ...semester,
    templates: [math],
    exceptions: [{ id: "e1", templateId: "t-math", date: "2026-10-05", kind: "cancel", title: "", newStartAt: null, newEndAt: null, newLocation: "", note: "国庆调休" }],
    from: "2026-10-05",
    to: "2026-10-11",
  });
  assert.equal(cancelled.length, 0);

  const moved = expandOccurrences({
    ...semester,
    templates: [math],
    exceptions: [{
      id: "e2", templateId: "t-math", date: "2026-10-05", kind: "move", title: "",
      newStartAt: "2026-10-05T02:00:00.000Z", newEndAt: "2026-10-05T03:50:00.000Z", newLocation: "软件园4区402d", note: "换教室",
    }],
    from: "2026-10-05",
    to: "2026-10-11",
  });
  assert.equal(moved.length, 1);
  assert.equal(moved[0]?.changed, true);
  assert.equal(moved[0]?.exceptionKind, "move");
  assert.equal(moved[0]?.startAt, "2026-10-05T02:00:00.000Z");
  assert.equal(moved[0]?.location, "软件园4区402d");

  const added = expandOccurrences({
    ...semester,
    templates: [math],
    exceptions: [{
      id: "e3", templateId: "t-math", date: "2026-10-10", kind: "add", title: "",
      newStartAt: "2026-10-10T00:00:00.000Z", newEndAt: "2026-10-10T01:50:00.000Z", newLocation: "软件园1区307d", note: "补课",
    }],
    from: "2026-10-05",
    to: "2026-10-11",
  });
  assert.equal(added.length, 2);
  assert.equal(added[1]?.date, "2026-10-10");
  assert.equal(added[1]?.weekday, 6);
  assert.equal(added[1]?.exceptionKind, "add");
  assert.equal(added[1]?.title, "高等数学(1)");
});

test("同一天多门课按开始时间排序，pickNext 取未结束的第一节", () => {
  const english: CourseTemplateInput = { ...math, id: "t-en", name: "新工科综合英语(1)", weekday: 1, periodStart: 3, periodEnd: 3, weeks: parseWeeks("4-18") };
  const occurrences = expandOccurrences({ ...semester, templates: [english, math], exceptions: [], from: "2026-10-05", to: "2026-10-05" });
  assert.deepEqual(occurrences.map((item) => item.title), ["高等数学(1)", "新工科综合英语(1)"]);
  assert.equal(pickNext(occurrences, "2026-10-05T00:30:00.000Z")?.title, "高等数学(1)");
  assert.equal(pickNext(occurrences, "2026-10-05T02:00:00.000Z")?.title, "新工科综合英语(1)");
  assert.equal(pickNext(occurrences, "2026-10-05T09:00:00.000Z"), null);
});