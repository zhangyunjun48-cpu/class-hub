import assert from "node:assert/strict";
import test from "node:test";
import {
  clearSessionCookie,
  hashPin,
  hashToken,
  normalizeName,
  normalizeStudentId,
  parseCookies,
  safeEqual,
  serializeSessionCookie,
  signChallenge,
  studentIdHmac,
  studentIdLast4,
  verifyChallenge,
  verifyPin,
} from "./crypto.js";

test("学号 HMAC 稳定、不可逆且大小写与空格归一", () => {
  const secret = "student-secret-value-that-is-long-enough";
  const a = studentIdHmac("2021001", secret);
  const b = studentIdHmac(" 2021001 ", secret);
  assert.equal(a, b);
  assert.equal(a.length, 64);
  assert.doesNotMatch(a, /2021001/);
  assert.notEqual(a, studentIdHmac("2021001", "another-secret-value-long-enough"));
});

test("学号只保留末四位掩码", () => {
  assert.equal(studentIdLast4("2021001"), "1001");
  assert.equal(studentIdLast4("ab"), "**AB");
  assert.equal(normalizeStudentId(" ab-c "), "AB-C");
});

test("姓名归一忽略大小写与内部空格", () => {
  assert.equal(normalizeName("  张 三 "), "张三");
  assert.equal(normalizeName("Wang Ming"), "wangming");
});

test("激活挑战可校验，篡改或换密钥后失效", () => {
  const secret = "auth-secret-value-that-is-long-enough";
  const token = signChallenge("member-1", secret);
  assert.equal(verifyChallenge(token, secret), "member-1");
  assert.equal(verifyChallenge(token, "different-auth-secret-long-enough"), null);
  assert.equal(verifyChallenge(`${token}x`, secret), null);
  assert.equal(verifyChallenge("not-a-token", secret), null);
});

test("Cookie 序列化带 HttpOnly / SameSite，Secure 可用环境控制", () => {
  const insecure = serializeSessionCookie("token value", false, 60);
  assert.match(insecure, /^classhub_session=token%20value;/);
  assert.match(insecure, /HttpOnly/);
  assert.match(insecure, /SameSite=Lax/);
  assert.doesNotMatch(insecure, /Secure/);
  assert.match(serializeSessionCookie("t", true, 60), /Secure/);
  assert.match(clearSessionCookie(false), /Max-Age=0/);
});

test("Cookie 解析还原原始 token", () => {
  const cookies = parseCookies("other=1; classhub_session=token%20value; theme=light");
  assert.equal(cookies.classhub_session, "token value");
  assert.equal(parseCookies(undefined).classhub_session, undefined);
});

test("会话 token 哈希确定且 safeEqual 抗长度差异", () => {
  assert.equal(hashToken("abc"), hashToken("abc"));
  assert.notEqual(hashToken("abc"), hashToken("abd"));
  assert.equal(safeEqual("abc", "abc"), true);
  assert.equal(safeEqual("abc", "abcd"), false);
});

test("管理员 PIN 使用 scrypt 加盐存储并可校验", async () => {
  const stored = await hashPin("482913");
  assert.match(stored, /^scrypt\$/);
  assert.doesNotMatch(stored, /482913/);
  assert.equal(await verifyPin("482913", stored), true);
  assert.equal(await verifyPin("000000", stored), false);
  assert.equal(await verifyPin("482913", "garbage"), false);
  assert.notEqual(stored, await hashPin("482913"));
});