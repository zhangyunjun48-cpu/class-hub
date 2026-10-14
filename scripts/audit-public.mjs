#!/usr/bin/env node
/**
 * 开源前的防泄漏门禁：扫描「被 git 跟踪的文件」，一旦出现密钥或实例私有信息就失败退出。
 *
 *   npm run audit:public
 *
 * 只检查跟踪文件（不含 node_modules / work / outputs 等本地目录）。
 * 如果你的实例信息本来就该公开（例如你愿意在 README 里写明自己的站点），
 * 把对应片段加入下面的 ALLOW 列表即可。
 */
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";

const ALLOW = [
  // 允许出现的示例/模板占位
  "<your-domain>",
  "<your-server-ip>",
  "classhub_session",
];

const RULES = [
  { name: "Supabase / JWT 形态的密钥", re: /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{20,}/ },
  { name: "service_role 字样", re: /service_role/ },
  { name: "私钥文件内容", re: /-----BEGIN (RSA |OPENSSH |EC |PGP )?PRIVATE KEY-----/ },
  { name: "生产库连接串带真实密码", re: /postgresql:\/\/[^:\s]+:(?!change-me)[^@\s]{12,}@/ },
  { name: "中国大陆手机号", re: /(?<!\d)1[3-9]\d{9}(?!\d)/ },
  { name: "12 位以上疑似学号", re: /(?<!\d)20\d{10,}(?!\d)/ },
  {
    name: "疑似真实邮箱",
    re: /[A-Za-z0-9._%+-]+@([A-Za-z0-9.-]+\.[A-Za-z]{2,})/,
    // 示例域、git 主机、匿名 noreply 地址都不算泄漏
    skip: (hit) => /@(example\.(com|cn|org)|[A-Za-z0-9.-]*\.invalid|qq\.com|foxmail\.com|gitee\.com|github\.com|user\.noreply)/.test(hit),
  },
];

const files = execSync("git ls-files", { encoding: "utf8" }).split(/\r?\n/).filter(Boolean);
const findings = [];

// .ps1 必须是 UTF-8 with BOM：Windows PowerShell 5.1 对无 BOM 文件按 GBK 解析，中文会乱码报错
for (const file of files) {
  if (!file.endsWith(".ps1")) continue;
  const head = readFileSync(file);
  if (!(head[0] === 0xef && head[1] === 0xbb && head[2] === 0xbf)) {
    findings.push(`${file}:1  缺少 UTF-8 BOM（Windows PowerShell 5.1 会按 GBK 解析导致中文报错）`);
  }
}

for (const file of files) {
  // 跳过本文件：它本身就以这些模式作为检测规则，属于自指误报
  if (file === "scripts/audit-public.mjs") continue;
  if (/\.(png|jpe?g|gif|ico|woff2?|ttf|pdf|zip|svg)$/i.test(file)) continue;
  let text;
  try { text = readFileSync(file, "utf8"); } catch { continue; }
  for (const rule of RULES) {
    const match = rule.re.exec(text);
    if (!match) continue;
    const hit = match[0];
    if (ALLOW.some((ok) => hit.includes(ok))) continue;
    if (rule.skip && rule.skip(hit)) continue;
    const line = text.slice(0, match.index).split("\n").length;
    findings.push(`${file}:${line}  ${rule.name}  ->  ${hit.slice(0, 40)}${hit.length > 40 ? "…" : ""}`);
  }
}

if (findings.length) {
  console.error("发现疑似敏感内容，已阻止发布：\n" + findings.map((f) => "  " + f).join("\n"));
  process.exit(1);
}
console.log(`audit:public 通过（已扫描 ${files.length} 个跟踪文件，0 命中）`);