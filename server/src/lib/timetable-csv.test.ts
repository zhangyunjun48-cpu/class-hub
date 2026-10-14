import assert from "node:assert/strict";
import test from "node:test";
import { parseTimetableGrid, suggestDefaultWeeks } from "./timetable-csv.js";

const q = (value: string) => `"${value.replace(/"/g, '""')}"`;
const block = (name: string, classNo: string, code: string, extra: string, teachers: string, weeks: string, location: string) =>
  [name, `课序号:(${classNo})`, code, extra, teachers, weeks, location].filter((part) => part !== "").join("\n");

/** 形态 A：教务系统「学生个人课表」导出的网格（真实数据，含一格两门课与整天课）。 */
const GRID_ROWS: Array<[string, string[]]> = [
  ["第一节\n(01,02小节)", [
    block("高等数学(1)", "321", "sd00920120", "", "郑修才,韩国平", "第4-18周([周])[01-02节]", "软件园1区307d"),
    "", "", "", "", "", "",
  ]],
  ["第二节\n(03,04小节)", [
    block("高等数学(1)", "321", "sd00920120", "", "郑修才,韩国平", "第4-18周([周])[03-04节]", "软件园1区307d"),
    block("新工科综合英语（1）", "354", "sd03119A82", "(示例班)", "李新云", "第4-18周([周])[03-04节]", "软件园4区102d"),
    "", "", "", "", "",
  ]],
  ["第三节\n(05,06小节)", [
    block("高级程序设计", "5", "sd03032C90", "", "刘炜", "第4-18周([周])[05-06节]", "软件园1区307d"),
    "",
    block("习近平新时代中国特色社会主义思想概论", "348", "sd02810740", "", "郎慧慧", "第4-11周([周])[05-06节]", "软件园1区"),
    [
      block("劳动实践（劳育）", "303", "sd070109A0", "", "曹利华", "第6周([周])[01-02-03-04-05-06-07-08节]", "兴隆山工程训练中心120"),
      block("国家安全教育课程", "347", "sd09310010", "", "张芹", "第7-10周([周])[05-06节]", "软件园1区107d"),
    ].join("\n\n"),
    "", "", "",
  ]],
  ["第四节\n(07,08小节)", [
    block("体育(1)", "371", "sd02910630", "", "张世国", "第4-17周([周])[07-08节]", "软件园校区升旗台"),
    block("习近平新时代中国特色社会主义思想概论", "348", "sd02810740", "", "郎慧慧", "第4-11周([周])[07-08节]", "软件园1区308d"),
    block("线性代数", "5", "sd03020980", "", "马金连", "第7-18周([周])[07-08节]", "软件园4区402d"),
    block("线性代数", "5", "sd03020980", "", "马金连", "第7-18周([周])[07-08节]", "软件园4区402d"),
    "", "", "",
  ]],
  ["第五节\n(09,10,11小节)", [
    block("大学生心理健康教育", "375", "sd07810220", "", "李晓含,孙长玉", "第4-18周([周])[09-10节]", "软件园1区308d"),
    block("LINUX应用", "102", "sd03030070", "", "王政", "第7-14周([周])[09-10节]", "软件园5区107d"),
    block("计算机与集成电路导论", "5", "sd04031800", "", "戴子忆,肖洪地,曹超,钱凯,唐昊煜", "第4-18周([周])[09-10节]", "软件园1区407d"),
    block("新生研讨课", "5", "sd04031740", "", "徐延宁,侯孟波,李玉香,邢建平,潘丽", "第9-16周([周])[09-10节]", "软件园1区308d"),
    "", "", "",
  ]],
];

const GRID_CSV = [
  "学期：2026-2027-1,,,,,,,",
  ",星期一,星期二,星期三,星期四,星期五,星期六,星期日",
  ...GRID_ROWS.map(([label, cells]) => [q(label), ...cells.map((cell) => (cell ? q(cell) : ""))].join(",")),
  `,,,,,,"备注：军事技能  1-3周",`,
].join("\n");

test("解析教务网格：学期、节次表、地点、教师、课程代码、课序号", () => {
  const result = parseTimetableGrid(GRID_CSV);
  assert.deepEqual(result.warnings, []);
  assert.equal(result.semesterName, "2026-2027-1");
  assert.match(result.semesterNote, /军事技能/);
  assert.equal(result.templates.length, 15);
  assert.equal(result.sections.length, 5);
  assert.equal(result.sections[0]?.start, "08:00");
  assert.equal(result.sections[4]?.end, "20:50");

  const math = result.templates.find((item) => item.name === "高等数学(1)" && item.periodStart === 1);
  assert.ok(math);
  assert.equal(math.weekday, 1);
  assert.equal(math.classNo, "321");
  assert.equal(math.courseCode, "sd00920120");
  assert.equal(math.teachers, "郑修才,韩国平");
  assert.equal(math.location, "软件园1区307d");
  assert.deepEqual(math.weeks, Array.from({ length: 15 }, (_, index) => index + 4));
  assert.equal(math.weeksInferred, false);
});

test("解析教务网格：班级标记、单周、整天课与一格两门课", () => {
  const result = parseTimetableGrid(GRID_CSV);

  const english = result.templates.find((item) => item.name.startsWith("新工科综合英语"));
  assert.ok(english);
  assert.equal(english.weekday, 2);
  assert.equal(english.periodStart, 2);
  assert.equal(english.periodEnd, 2);
  assert.equal(english.teachers, "李新云");
  assert.equal(english.location, "软件园4区102d");
  assert.equal(english.note, "(示例班)");

  const labour = result.templates.find((item) => item.name.startsWith("劳动实践"));
  assert.ok(labour);
  assert.deepEqual(labour.weeks, [6]);
  assert.equal(labour.periodStart, 1);
  assert.equal(labour.periodEnd, 4, "整天课 [01-08节] 应覆盖第 1-4 节");
  assert.equal(labour.weekday, 4);

  const safety = result.templates.find((item) => item.name.startsWith("国家安全教育课程"));
  assert.ok(safety, "同一格里的第二门课也要解析出来");
  assert.equal(safety.weekday, 4);
  assert.equal(safety.periodStart, 3);
  assert.deepEqual(safety.weeks, [7, 8, 9, 10]);

  // 14 个非空单元格 → 15 门课（周四第三节同一格里有两门）
  assert.equal(result.stats.cells, 14);
  assert.equal(result.stats.inferredWeeks, 0);
});

test("解析简化网格：学习节次时间，并用默认周次兜底", () => {
  const simple = [
    "节次/时间,星期一,星期二,星期三,星期四,星期五",
    "第1节 (08:00-09:50),,,高等数学(1) @软件园1区307d,",
    "第2节 (10:10-12:00),高等数学(1) @软件园1区307d,新工科综合英语(1) @软件园4区102d,高等数学(1) @软件园1区307d,,",
  ].join("\n");

  const result = parseTimetableGrid(simple, { defaultWeeks: Array.from({ length: 15 }, (_, index) => index + 4) });
  assert.equal(result.templates.length, 4);
  assert.equal(result.sections[0]?.start, "08:00");
  assert.equal(result.sections[0]?.end, "09:50");
  assert.equal(result.sections[1]?.start, "10:10");

  const wednesday = result.templates.find((item) => item.weekday === 3);
  assert.ok(wednesday);
  assert.equal(wednesday.periodStart, 1);
  assert.equal(wednesday.location, "软件园1区307d");
  assert.equal(wednesday.weeksInferred, true);
  assert.deepEqual(wednesday.weeks, Array.from({ length: 15 }, (_, index) => index + 4));
  assert.ok(result.warnings.some((warning) => warning.includes("默认周次")));
});

test("没有默认周次时给出明确警告", () => {
  const simple = [
    "节次/时间,星期一,星期二,星期三",
    "第1节 (08:00-09:50),高等数学(1) @软件园1区307d,,",
  ].join("\n");
  const result = parseTimetableGrid(simple);
  assert.equal(result.templates[0]?.weeks.length, 0);
  assert.ok(result.warnings.some((warning) => warning.includes("请填写「默认周次」")));
});

test("找不到表头时拒绝解析并说明原因", () => {
  const result = parseTimetableGrid("随便,一些,内容\n1,2,3");
  assert.equal(result.templates.length, 0);
  assert.match(result.warnings[0] ?? "", /没有找到「星期一…星期日」表头/);
});

test("suggestDefaultWeeks 取已识别周次的跨度", () => {
  const result = parseTimetableGrid(GRID_CSV);
  const weeks = suggestDefaultWeeks(result.templates);
  assert.equal(weeks[0], 4);
  assert.equal(weeks[weeks.length - 1], 18);
});