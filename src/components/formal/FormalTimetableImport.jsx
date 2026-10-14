import { useMemo, useState } from "react";
import { AlertTriangle, Check, FileUp, Sparkles, Trash2 } from "lucide-react";
import { formatShanghai } from "../../demo/time.js";
import { useFormal } from "../../formal/FormalContext.jsx";
import { addDays, dateKeyOf, formatTimeRange, formatWeeksText, parseWeeksText, startOfWeek, WEEKDAY_SHORT } from "../../formal/timetable-view.js";
import { FormalModal } from "./FormalShared.jsx";

const decodeFile = async (file) => {
  const buffer = await file.arrayBuffer();
  let text = new TextDecoder("utf-8").decode(buffer);
  if (text.includes("\uFFFD")) {
    try {
      const gbk = new TextDecoder("gbk").decode(buffer);
      if (!gbk.includes("\uFFFD")) text = gbk;
    } catch {
      // 浏览器不支持 GBK 时继续用 UTF-8 结果
    }
  }
  return text;
};

export function TimetableImportDialog({ defaultStartDate = "", onClose, onDone }) {
  const { previewTimetable, commitTimetable, notify } = useFormal();
  const [step, setStep] = useState("input");
  const [form, setForm] = useState({
    startDate: defaultStartDate,
    semesterName: "",
    defaultWeeks: "4-18",
    content: "",
  });
  // 两种填法：知道第 1 周周一，或只知道「这周是第几周」
  const [anchorMode, setAnchorMode] = useState("week");
  const [currentWeek, setCurrentWeek] = useState("");

  const derivedStartDate = useMemo(() => {
    const week = Number(currentWeek);
    if (!Number.isInteger(week) || week < 1 || week > 30) return "";
    const todayKey = dateKeyOf(new Date().toISOString());
    return addDays(startOfWeek(todayKey), -(week - 1) * 7);
  }, [currentWeek]);

  const effectiveStartDate = anchorMode === "week" ? derivedStartDate : form.startDate;
  const [preview, setPreview] = useState(null);
  const [rows, setRows] = useState([]);
  const [confirmReplace, setConfirmReplace] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const update = (key, value) => setForm((current) => ({ ...current, [key]: value }));

  const runPreview = async () => {
    if (!form.content.trim()) {
      setError("请先粘贴或选择课表 CSV 内容");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const result = await previewTimetable({
        content: form.content,
        defaultWeeks: form.defaultWeeks,
        startDate: effectiveStartDate || undefined,
      });
      setPreview(result);
      setRows(result.templates.map((template, index) => ({
        key: `${template.line}-${template.weekday}-${index}`,
        checked: true,
        ...template,
        weeksText: formatWeeksText(template.weeks),
      })));
      if (!form.semesterName && result.semesterName) update("semesterName", result.semesterName);
      setStep("preview");
    } catch (cause) {
      setError(cause?.message ?? "解析失败");
    } finally {
      setBusy(false);
    }
  };

  const checkedRows = rows.filter((row) => row.checked);
  const missingWeeks = checkedRows.filter((row) => parseWeeksText(row.weeksText).length === 0);

  return (
    <FormalModal title="导入课表" onClose={onClose} wide>
      {error && <div className="demo-alert"><AlertTriangle size={16} />{error}</div>}

      {step === "input" ? (
        <>
          <p className="formal-hint">
            把教务系统的「学生个人课表」在 Excel/WPS 里<b>另存为 CSV</b>，再粘贴或选择文件。
            也支持「课程名 @地点」的简化周网格（没有周次时用下面的默认周次填充）。
          </p>
          <div className="demo-form">
            <div className="demo-field demo-field--full">
              <span>本学期从哪一周算起</span>
              <div className="formal-anchor-modes" role="tablist" aria-label="起始周填写方式">
                <button type="button" role="tab" aria-selected={anchorMode === "week"} className={anchorMode === "week" ? "is-active" : ""} onClick={() => setAnchorMode("week")}>我知道这周是第几周</button>
                <button type="button" role="tab" aria-selected={anchorMode === "date"} className={anchorMode === "date" ? "is-active" : ""} onClick={() => setAnchorMode("date")}>我知道第 1 周周一</button>
              </div>
            </div>
            {anchorMode === "week" ? (
              <label className="demo-field">
                <span>今天是第几周</span>
                <input type="number" min="1" max="30" value={currentWeek} onChange={(event) => setCurrentWeek(event.target.value)} placeholder="例如 6" />
                <small>{derivedStartDate ? `推算第 1 周周一：${derivedStartDate}` : "填一个 1–30 的数字，下面会显示推算结果"}</small>
              </label>
            ) : (
              <label className="demo-field">
                <span>第 1 周周一</span>
                <input type="date" value={form.startDate} onChange={(event) => update("startDate", event.target.value)} />
              </label>
            )}
            <label className="demo-field"><span>学期名称</span><input value={form.semesterName} onChange={(event) => update("semesterName", event.target.value)} placeholder="例如 2026-2027-1" /></label>
            <label className="demo-field demo-field--full"><span>默认周次（仅用于缺少周次的课）</span><input value={form.defaultWeeks} onChange={(event) => update("defaultWeeks", event.target.value)} placeholder="例如 4-18" /></label>
            <label className="demo-field demo-field--full">
              <span>课表 CSV 内容</span>
              <textarea rows="8" value={form.content} onChange={(event) => update("content", event.target.value)} placeholder="从 Excel 另存为 CSV 后，用记事本打开并全选复制到这里" />
            </label>
            <label className="demo-field demo-field--full">
              <span>或选择 CSV 文件</span>
              <input
                type="file"
                accept=".csv,text/csv"
                onChange={async (event) => {
                  const file = event.target.files?.[0];
                  if (!file) return;
                  try {
                    update("content", await decodeFile(file));
                    setError("");
                  } catch {
                    setError("文件读取失败");
                  }
                }}
              />
            </label>
          </div>
          <div className="demo-form__footer">
            <button className="demo-button demo-button--ghost" type="button" onClick={onClose}>取消</button>
            <button className="demo-button demo-button--primary" type="button" disabled={busy} onClick={runPreview}>
              {busy ? "解析中…" : "解析预览"}
            </button>
          </div>
        </>
      ) : (
        <>
          <div className="formal-preview-summary">
            <span>共解析出 <b>{rows.length}</b> 门课，已勾选 <b>{checkedRows.length}</b> 门</span>
            {preview?.stats?.inferredWeeks > 0 && <span className="formal-badge">有 {preview.stats.inferredWeeks} 门用默认周次</span>}
          </div>

          {preview?.warnings?.length > 0 && (
            <ul className="formal-error-list">
              {preview.warnings.map((warning) => <li key={warning}>{warning}</li>)}
            </ul>
          )}

          {preview?.selfCheck && (
            <div className="formal-self-check">
              <Sparkles size={16} />
              <div>
                <strong>按第 1 周周一 {preview.selfCheck.startDate} 推算，今天是第 {preview.selfCheck.currentWeek} 周。</strong>
                <p>
                  本周课程：
                  {preview.selfCheck.thisWeek.length
                    ? preview.selfCheck.thisWeek.map((item) => `${WEEKDAY_SHORT[item.weekday]}${formatTimeRange(item.startAt, item.endAt)} ${item.title}`).join("；")
                    : "（没有课）"}
                </p>
                <small>请对照教务系统核对；如果对不上，改上面的起始日期再点「重新推算」。</small>
              </div>
            </div>
          )}

          <div className="formal-table formal-table--timetable" role="table">
            <div className="formal-table__head" role="row">
              <span>选</span><span>星期</span><span>节次</span><span>课程</span><span>教师</span><span>地点</span><span>周次</span>
            </div>
            {rows.map((row, index) => (
              <div className={`formal-table__row ${row.checked ? "" : "is-muted"}`} role="row" key={row.key}>
                <span><input type="checkbox" checked={row.checked} onChange={(event) => setRows((current) => current.map((item, position) => position === index ? { ...item, checked: event.target.checked } : item))} aria-label={`选择 ${row.name}`} /></span>
                <span>{WEEKDAY_SHORT[row.weekday]}</span>
                <span>{row.periodStart === row.periodEnd ? `第${row.periodStart}节` : `第${row.periodStart}-${row.periodEnd}节`}</span>
                <span>{row.name}</span>
                <span>{row.teachers || "—"}</span>
                <span>{row.location || "—"}</span>
                <span>
                  <input
                    value={row.weeksText}
                    onChange={(event) => setRows((current) => current.map((item, position) => position === index ? { ...item, weeksText: event.target.value } : item))}
                    aria-label={`${row.name} 周次`}
                    className={row.weeksInferred ? "is-inferred" : ""}
                  />
                </span>
              </div>
            ))}
          </div>

          <div className="formal-actions">
            <button className="demo-button demo-button--ghost demo-button--small" type="button" onClick={() => setRows((current) => current.map((row) => ({ ...row, checked: true })))}><Check size={14} />全选</button>
            <button className="demo-button demo-button--ghost demo-button--small" type="button" onClick={() => setRows((current) => current.map((row) => ({ ...row, checked: false })))}><Trash2 size={14} />全不选</button>
            <button className="demo-button demo-button--ghost demo-button--small" type="button" onClick={() => setStep("input")}>返回修改</button>
            <button className="demo-button demo-button--ghost demo-button--small" type="button" disabled={busy} onClick={runPreview}>重新推算</button>
          </div>

          <label className="demo-check demo-field--full">
            <input type="checkbox" checked={confirmReplace} onChange={(event) => setConfirmReplace(event.target.checked)} />
            <span>我确认：入库会替换当前课表，已登记的停课/调课记录会一并清除。</span>
          </label>

          <div className="demo-form__footer">
            <button className="demo-button demo-button--ghost" type="button" onClick={onClose}>取消</button>
            <button
              className="demo-button demo-button--primary"
              type="button"
              disabled={busy || !confirmReplace || !checkedRows.length || missingWeeks.length > 0 || !effectiveStartDate || !form.semesterName.trim()}
              onClick={async () => {
                setBusy(true);
                setError("");
                try {
                  await commitTimetable({
                    semesterName: form.semesterName.trim(),
                    startDate: effectiveStartDate,
                    sections: preview.sections,
                    note: preview.semesterNote || "",
                    templates: checkedRows.map((row) => ({
                      name: row.name,
                      courseCode: row.courseCode || "",
                      classNo: row.classNo || "",
                      teachers: row.teachers || "",
                      location: row.location || "",
                      weekday: row.weekday,
                      periodStart: row.periodStart,
                      periodEnd: row.periodEnd,
                      weeks: parseWeeksText(row.weeksText),
                      note: row.note || "",
                    })),
                  });
                  notify(`已导入 ${checkedRows.length} 门课`);
                  await onDone();
                  onClose();
                } catch (cause) {
                  setError(cause?.message ?? "导入失败");
                } finally {
                  setBusy(false);
                }
              }}
            >
              {busy ? "导入中…" : "确认入库"}
            </button>
          </div>
          {missingWeeks.length > 0 && <p className="formal-hint">有 {missingWeeks.length} 门课还没有周次，请补全后再入库。</p>}
        </>
      )}
    </FormalModal>
  );
}