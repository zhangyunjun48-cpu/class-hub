/**
 * 极简 CSV 工具。教务导出的课表里，一个单元格内部含多行文本，
 * 因此除了逐行解析，还需要一个能处理「引号包裹 + 字段内换行」的完整解析器。
 */

/** 逐行解析：用于名单这类单行 CSV（保持与旧实现一致的 trim 行为）。 */
export function parseCsvLine(line: string) {
  const cells: string[] = [];
  let current = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"') {
      if (quoted && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === "," && !quoted) {
      cells.push(current.trim());
      current = "";
    } else {
      current += character;
    }
  }
  cells.push(current.trim());
  return cells;
}

/**
 * 完整解析：支持 UTF-8 BOM、CRLF、双引号转义（""）以及字段内换行。
 * 返回值不做 trim，交给调用方按需处理。
 */
export function parseCsv(text: string): string[][] {
  const input = text.replace(/^\uFEFF/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < input.length; index += 1) {
    const character = input[index];
    if (quoted) {
      if (character === '"') {
        if (input[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          quoted = false;
        }
      } else {
        field += character;
      }
      continue;
    }
    if (character === '"') {
      quoted = true;
    } else if (character === ",") {
      row.push(field);
      field = "";
    } else if (character === "\n") {
      row.push(field);
      field = "";
      rows.push(row);
      row = [];
    } else if (character !== "\r") {
      field += character;
    }
  }
  row.push(field);
  rows.push(row);
  return rows;
}

/** 去掉空行（所有单元格都为空）。 */
export function dropEmptyRows(rows: string[][]) {
  return rows.filter((row) => row.some((cell) => cell.trim() !== ""));
}