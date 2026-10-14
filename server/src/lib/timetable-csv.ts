/**
 * 解析教务系统导出的课表网格。
 *
 * 支持两种来源：
 *  A. `学生个人课表_xxx.xls` 另存为 CSV：行标签是「第一节」，单元格里是
 *     「课程名 / 课序号 / 课程代码 / 教师 / 第X-Y周[NN-NN节] / 地点」多行文本。
 *  B. 简化的周网格（如 table_课表.csv）：行标签是「第1节 (08:00-09:50)」，
 *     单元格是「课程名 @地点」，没有周次，需要用导入页的默认周次兜底。
 */
import { dropEmptyRows, parseCsv } from "./csv.js";
import {
  DEFAULT_SECTIONS,
  extractWeekText,
  parsePeriodRange,
  parseWeeks,
  type Section,
} from "./timetable.js";

export interface ParsedTemplate {
  line: number;
  name: string;
  courseCode: string;
  classNo: string;
  teachers: string;
  location: string;
  weekday: number;
  periodStart: number;
  periodEnd: number;
  weeks: number[];
  weeksInferred: boolean;
  note: string;
}

export interface TimetableParseResult {
  semesterName: string;
  semesterNote: string;
  sections: Section[];
  templates: ParsedTemplate[];
  warnings: string[];
  stats: { rows: number; cells: number; blocks: number; inferredWeeks: number };
}

const CHINESE_DIGITS: Record<string, number> = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 };
const weekdayCellPattern = /^星期([一二三四五六日天])$/;
const rowLabelPattern = /^\s*第\s*([一二三四五六七八九十\d]{1,3})\s*节/;
const timeRangePattern = /(\d{1,2}:\d{2})\s*[-–~]\s*(\d{1,2}:\d{2})/;

const toPeriodNo = (raw: string): number => {
  if (/^\d+$/.test(raw)) return Number(raw);
  return CHINESE_DIGITS[raw] ?? 0;
};

const weekdayNumber = (label: string): number => {
  const match = label.trim().match(weekdayCellPattern);
  if (!match) return 0;
  const key = match[1] === "天" ? "日" : match[1];
  return ["一", "二", "三", "四", "五", "六", "日"].indexOf(key ?? "") + 1;
};

/** 把单元格文本切成若干「课程块」：课程名在「课序号」之前一行。 */
function splitBlocks(cell: string): Array<{ name: string; head: string; body: string[] }> {
  const lines = cell
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const blocks: Array<{ name: string; head: string; body: string[] }> = [];
  let cursor = 0;
  while (cursor < lines.length) {
    const index = lines.findIndex((line, position) => position >= cursor && /^课序号/.test(line));
    if (index < 0) break;
    const name = index > 0 ? lines[index - 1] ?? "" : "";
    const body: string[] = [];
    let scan = index + 1;
    while (scan < lines.length && !/^课序号/.test(lines[scan] ?? "")) {
      body.push(lines[scan] ?? "");
      scan += 1;
    }
    // 下一个块的课程名紧跟在「课序号」之前，这里要把它从本块正文里摘掉
    if (scan < lines.length) body.pop();
    blocks.push({ name, head: lines[index] ?? "", body });
    cursor = index + 1;
  }
  return blocks;
}

interface BlockContext {
  line: number;
  weekday: number;
  periodNo: number;
  defaultWeeks: number[];
}

function interpretBlock(block: { name: string; head: string; body: string[] }, context: BlockContext): ParsedTemplate | null {
  const code = block.body.find((line) => /^[A-Za-z]{2}[A-Za-z0-9]{6,}$/.test(line)) ?? "";
  const classTag = block.body.find((line) => /^[（(].+[)）]$/.test(line)) ?? "";
  const weeksLine = block.body.find((line) => extractWeekText(line) !== "") ?? "";
  const residual = block.body.filter((line) => line !== code && line !== classTag && line !== weeksLine);

  const weeksText = extractWeekText(weeksLine);
  let weeks = parseWeeks(weeksText);
  const weeksInferred = weeks.length === 0;
  if (weeksInferred) weeks = [...context.defaultWeeks];

  const periodRange = parsePeriodRange(weeksLine);
  const periodStart = periodRange?.start ?? context.periodNo;
  const periodEnd = periodRange?.end ?? context.periodNo;

  // 正文里剩下的最后一行是地点，其余是教师
  const location = residual.length > 1 ? (residual[residual.length - 1] ?? "") : "";
  const teachers = (residual.length > 1 ? residual.slice(0, -1) : residual).join(" ");

  const name = block.name.replace(/^[\s\u3000]+|[\s\u3000]+$/g, "");
  if (!name) return null;

  return {
    line: context.line,
    name,
    courseCode: code,
    classNo: block.head.replace(/^课序号\s*[:：]\s*/, "").replace(/^[（(]|[)）]$/g, "").trim(),
    teachers: teachers || classTag,
    location,
    weekday: context.weekday,
    periodStart,
    periodEnd,
    weeks,
    weeksInferred,
    note: classTag && teachers ? classTag : "",
  };
}

/** 形态 B：`课程名 @地点`，没有周次。 */
function interpretInlineCell(cell: string, context: BlockContext): ParsedTemplate[] {
  return cell
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line): ParsedTemplate | null => {
      const atIndex = line.lastIndexOf("@");
      const name = (atIndex >= 0 ? line.slice(0, atIndex) : line).trim();
      const location = atIndex >= 0 ? line.slice(atIndex + 1).trim() : "";
      if (!name) return null;
      const item: ParsedTemplate = {
        line: context.line,
        name,
        courseCode: "",
        classNo: "",
        teachers: "",
        location,
        weekday: context.weekday,
        periodStart: context.periodNo,
        periodEnd: context.periodNo,
        weeks: [...context.defaultWeeks],
        weeksInferred: true,
        note: "",
      };
      return item;
    })
    .filter((item): item is ParsedTemplate => item !== null);
}

export function parseTimetableGrid(content: string, options: { defaultWeeks?: number[] } = {}): TimetableParseResult {
  const warnings: string[] = [];
  const templates: ParsedTemplate[] = [];
  const rows = dropEmptyRows(parseCsv(content));
  const defaultWeeks = options.defaultWeeks?.length ? [...options.defaultWeeks].sort((a, b) => a - b) : [];

  const semesterName = content.match(/学期\s*[:：]\s*([0-9]{4}-[0-9]{4}-[0-9]{1,2})/)?.[1] ?? "";
  const semesterNote = [...content.matchAll(/备注\s*[:：]\s*([^\n"]+)/g)]
    .map((match) => (match[1] ?? "").trim())
    .filter(Boolean)
    .join("；");

  // 表头行：包含最多「星期X」的一行
  let headerIndex = -1;
  let weekdayColumns = new Map<number, number>();
  rows.forEach((row, index) => {
    const columns = new Map<number, number>();
    row.forEach((cell, column) => {
      const weekday = weekdayNumber(cell);
      if (weekday > 0) columns.set(weekday, column);
    });
    if (columns.size > weekdayColumns.size) {
      weekdayColumns = columns;
      headerIndex = index;
    }
  });
  if (headerIndex < 0 || weekdayColumns.size < 3) {
    return {
      semesterName,
      semesterNote,
      sections: DEFAULT_SECTIONS.map((section) => ({ ...section })),
      templates,
      warnings: ["没有找到「星期一…星期日」表头，请确认这是教务系统导出的课表 CSV。"],
      stats: { rows: rows.length, cells: 0, blocks: 0, inferredWeeks: 0 },
    };
  }

  const learnedSections = new Map<number, Section>();
  let cells = 0;
  let blocks = 0;
  let inline = false;

  for (let index = headerIndex + 1; index < rows.length; index += 1) {
    const row = rows[index] ?? [];
    const label = (row[0] ?? "").trim();
    const labelMatch = label.match(rowLabelPattern);
    if (!labelMatch) continue;
    const periodNo = toPeriodNo(labelMatch[1] ?? "");
    if (!periodNo) continue;
    const timeMatch = label.match(timeRangePattern);
    if (timeMatch) {
      learnedSections.set(periodNo, { no: periodNo, start: timeMatch[1] ?? "", end: timeMatch[2] ?? "" });
    }

    for (const [weekday, column] of weekdayColumns) {
      const cell = (row[column] ?? "").trim();
      if (!cell) continue;
      cells += 1;
      const blockList = splitBlocks(cell);
      if (!blockList.length) {
        // 形态 B：没有课序号，按「课程名 @地点」处理
        const inlineItems = interpretInlineCell(cell, { line: index + 1, weekday, periodNo, defaultWeeks });
        if (inlineItems.length) {
          inline = true;
          blocks += inlineItems.length;
          templates.push(...inlineItems);
        } else {
          warnings.push(`第 ${index + 1} 行「${label}」的第 ${weekday} 列内容无法识别，已跳过。`);
        }
        continue;
      }
      inline = false;
      for (const block of blockList) {
        const parsed = interpretBlock(block, { line: index + 1, weekday, periodNo, defaultWeeks });
        if (!parsed) {
          warnings.push(`第 ${index + 1} 行第 ${weekday} 列有一门课缺少名称，已跳过。`);
          continue;
        }
        blocks += 1;
        templates.push(parsed);
      }
    }
  }

  const sections = DEFAULT_SECTIONS.map((fallback) => learnedSections.get(fallback.no) ?? { ...fallback });
  const inferredWeeks = templates.filter((template) => template.weeksInferred).length;
  if (inferredWeeks > 0 && !defaultWeeks.length) {
    warnings.push(`有 ${inferredWeeks} 门课没有周次信息：请填写「默认周次」后重新解析。`);
  } else if (inferredWeeks > 0) {
    warnings.push(`有 ${inferredWeeks} 门课没有周次信息，已按默认周次「${defaultWeeks[0]}-${defaultWeeks[defaultWeeks.length - 1]}」填充，请核对。`);
  }
  if (inline) warnings.push("检测到「课程名 @地点」格式（无课序号），周次全部来自默认值。");

  return {
    semesterName,
    semesterNote,
    sections,
    templates,
    warnings,
    stats: { rows: rows.length, cells, blocks, inferredWeeks },
  };
}

/** 建议的默认周次：取所有已识别周次的最小值到最大值。 */
export function suggestDefaultWeeks(templates: ParsedTemplate[]): number[] {
  const all = templates.flatMap((template) => template.weeks);
  if (!all.length) return [];
  const min = Math.min(...all);
  const max = Math.max(...all);
  return Array.from({ length: max - min + 1 }, (_, index) => min + index);
}