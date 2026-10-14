import assert from "node:assert/strict";
import test from "node:test";
import { parseRosterCsv } from "./roster.js";

const HEADER = "student_id,name,group,initial_role,active";

test("解析合法名单并保留行号", () => {
  const csv = `${HEADER}\n2021001,张三,一组,member,true\n2021002,李四,二组,admin,1\n`;
  const result = parseRosterCsv(csv);
  assert.deepEqual(result.errors, []);
  assert.equal(result.rows.length, 2);
  assert.deepEqual(result.rows[0], { studentId: "2021001", name: "张三", group: "一组", initialRole: "member", active: true, line: 2 });
  assert.equal(result.rows[1]?.initialRole, "admin");
  assert.equal(result.rows[1]?.active, true);
});

test("支持 BOM、CRLF 与引号包裹的姓名", () => {
  const csv = `\uFEFF${HEADER}\r\n2021003,"王,小明",三组,member,false\r\n`;
  const result = parseRosterCsv(csv);
  assert.deepEqual(result.errors, []);
  assert.equal(result.rows[0]?.name, "王,小明");
  assert.equal(result.rows[0]?.active, false);
});

test("表头不正确时直接拒绝", () => {
  const result = parseRosterCsv("id,name\n2021001,张三");
  assert.equal(result.rows.length, 0);
  assert.match(result.errors[0] ?? "", /表头必须为/);
});

test("重复学号被标记为错误", () => {
  const csv = `${HEADER}\n2021001,张三,一组,member,true\n2021001,张三,一组,member,true\n`;
  const result = parseRosterCsv(csv);
  assert.ok(result.errors.some((error) => error.includes("学号重复")));
});

test("非法角色、active 与姓名会被逐行报错", () => {
  const csv = `${HEADER}\n2021001,张,一组,superuser,true\nabc,李四,二组,member,maybe\n`;
  const result = parseRosterCsv(csv);
  assert.ok(result.errors.some((error) => error.includes("第 2 行姓名不正确")));
  assert.ok(result.errors.some((error) => error.includes("第 2 行角色")));
  assert.ok(result.errors.some((error) => error.includes("第 3 行学号格式不正确")));
  assert.ok(result.errors.some((error) => error.includes("第 3 行 active")));
});

test("空 CSV 返回明确错误", () => {
  assert.deepEqual(parseRosterCsv("   ").errors, ["CSV 为空"]);
});