import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, CalendarDays, CalendarX, ChevronLeft, ChevronRight, FileUp, Pencil, Plus, RotateCcw } from "lucide-react";
import { formatShanghai, fromShanghaiInput, toShanghaiInput } from "../../demo/time.js";
import { useFormal } from "../../formal/FormalContext.jsx";
import {
  addDays,
  dateKeyOf,
  exceptionKindLabel,
  formatDayLabel,
  formatTimeRange,
  groupByDate,
  startOfWeek,
  WEEKDAY_SHORT,
} from "../../formal/timetable-view.js";
import { ConfirmDialog, EmptyState, FormalModal, Toaster } from "./FormalShared.jsx";
import { TimetableImportDialog } from "./FormalTimetableImport.jsx";

function CourseRow({ occurrence, isAdmin, onCancel, onMove }) {
  return (
    <article className={`formal-course ${occurrence.changed ? "is-changed" : ""}`}>
      <span className="formal-course__time">{formatTimeRange(occurrence.startAt, occurrence.endAt)}</span>
      <div className="formal-course__main">
        <div className="formal-course__title">
          <strong>{occurrence.title}</strong>
          {occurrence.changed && <span className="formal-badge">{exceptionKindLabel(occurrence.exceptionKind)}</span>}
          {occurrence.classNo && <small>课序号 {occurrence.classNo}</small>}
        </div>
        <p>
          {occurrence.teachers && <span>{occurrence.teachers}</span>}
          {occurrence.location && <span>{occurrence.location}</span>}
          {occurrence.exceptionNote && <span className="formal-course__note">{occurrence.exceptionNote}</span>}
        </p>
      </div>
      {isAdmin && (
        <div className="formal-course__actions">
          <button className="demo-icon-button" type="button" onClick={() => onMove(occurrence)} aria-label={`调整${occurrence.title}`}><Pencil size={15} /></button>
          <button className="demo-icon-button demo-icon-button--danger" type="button" onClick={() => onCancel(occurrence)} aria-label={`停课${occurrence.title}`}><CalendarX size={15} /></button>
        </div>
      )}
    </article>
  );
}

export function FormalTimetablePage() {
  const { timetable, isAdmin, loadTimetable, deleteTimetableException, notify, toast } = useFormal();
  const todayKey = dateKeyOf(new Date().toISOString());
  const [weekStart, setWeekStart] = useState(() => startOfWeek(todayKey));
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [importOpen, setImportOpen] = useState(false);
  const [cancelTarget, setCancelTarget] = useState(null);
  const [moveTarget, setMoveTarget] = useState(null);
  const [bulkDate, setBulkDate] = useState(null);
  const [addOpen, setAddOpen] = useState(false);

  const version = timetable?.version ?? "";

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const result = await loadTimetable(weekStart, addDays(weekStart, 6));
      setData(result);
      setError("");
    } catch (cause) {
      setError(cause?.message ?? "课表读取失败");
    } finally {
      setLoading(false);
    }
  }, [loadTimetable, weekStart]);

  useEffect(() => { void reload(); }, [reload, version]);

  const occurrences = data?.occurrences ?? [];
  const groups = useMemo(() => groupByDate(occurrences), [occurrences]);
  const weekChanges = useMemo(
    () => (timetable?.changes ?? []).filter((item) => item.date >= weekStart && item.date <= addDays(weekStart, 6)),
    [timetable, weekStart],
  );
  const currentWeek = timetable?.semester?.currentWeek ?? null;
  const isCurrentWeek = weekStart === startOfWeek(todayKey);

  return (
    <div className="demo-page">
      <section className="demo-page-intro">
        <div>
          <p className="demo-eyebrow">TIMETABLE</p>
          <h1>课表</h1>
          <p>
            {timetable?.semester
              ? `${timetable.semester.name}${currentWeek ? ` · 本周第 ${currentWeek} 周` : ""}`
              : "还没有导入课表"}
          </p>
        </div>
        {isAdmin && (
          <button className="demo-button demo-button--primary" type="button" onClick={() => setImportOpen(true)}>
            <FileUp size={17} />导入课表
          </button>
        )}
      </section>

      <div className="demo-toolbar formal-week-bar">
        <button className="demo-button demo-button--ghost demo-button--small" type="button" onClick={() => setWeekStart((value) => addDays(value, -7))}><ChevronLeft size={15} />上一周</button>
        <button className="demo-button demo-button--ghost demo-button--small" type="button" onClick={() => setWeekStart(startOfWeek(todayKey))} disabled={isCurrentWeek}>本周</button>
        <button className="demo-button demo-button--ghost demo-button--small" type="button" onClick={() => setWeekStart((value) => addDays(value, 7))}>下一周<ChevronRight size={15} /></button>
        <span className="formal-week-bar__label">{formatShanghai(`${weekStart}T00:00:00+08:00`, "M月d日")} – {formatShanghai(`${addDays(weekStart, 6)}T00:00:00+08:00`, "M月d日")}</span>
        {isAdmin && timetable?.semester && (
          <button className="demo-text-link" type="button" onClick={() => setAddOpen(true)}><Plus size={15} />登记补课</button>
        )}
      </div>

      {error && <div className="demo-alert"><AlertTriangle size={16} />{error}</div>}

      {weekChanges.length > 0 && (
        <section className="formal-change-strip">
          {weekChanges.map((item) => (
            <span key={item.id}>
              <strong>{formatShanghai(`${item.date}T00:00:00+08:00`, "M月d日")}</strong>
              {item.title} · {exceptionKindLabel(item.kind)}
              {item.note ? `（${item.note}）` : ""}
              {isAdmin && (
                <button className="demo-text-link" type="button" onClick={async () => { await deleteTimetableException(item.id); notify("已撤销该变更"); await reload(); }}>
                  <RotateCcw size={13} />撤销
                </button>
              )}
            </span>
          ))}
        </section>
      )}

      {loading && !data ? (
        <p className="formal-hint">正在读取课表…</p>
      ) : !data?.semester ? (
        <EmptyState icon={CalendarDays} title="还没有课表">
          {isAdmin
            ? <span>把教务系统导出的课表另存为 CSV，然后点右上角「导入课表」。</span>
            : <span>等班委导入本学期课表后，这里会自动显示每天上什么课。</span>}
        </EmptyState>
      ) : groups.length === 0 ? (
        <EmptyState icon={CalendarDays} title="这一周没有课">
          <span>{currentWeek ? `当前是第 ${currentWeek} 周，` : ""}如果与实际不符，请联系班委核对学期起始日期或周次。</span>
        </EmptyState>
      ) : (
        <div className="formal-week">
          {groups.map(([date, items]) => (
            <section className="formal-week__day" key={date}>
              <header>
                <strong>{WEEKDAY_SHORT[items[0]?.weekday ?? 1]}</strong>
                <span>{formatDayLabel(date)}</span>
                {date === todayKey && <span className="formal-badge">今天</span>}
                <small>第 {items[0]?.weekNo} 周</small>
                {isAdmin && (
                  <button className="demo-text-link" type="button" onClick={() => setBulkDate(date)}>这天停课</button>
                )}
              </header>
              <div className="formal-course-list">
                {items.map((occurrence) => (
                  <CourseRow
                    key={occurrence.id}
                    occurrence={occurrence}
                    isAdmin={isAdmin}
                    onCancel={setCancelTarget}
                    onMove={setMoveTarget}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      {importOpen && <TimetableImportDialog defaultStartDate={timetable?.semester?.startDate ?? ""} onClose={() => setImportOpen(false)} onDone={async () => { await reload(); }} />}
      {cancelTarget && <ExceptionCancelDialog occurrence={cancelTarget} onClose={() => setCancelTarget(null)} onDone={async () => { await reload(); }} />}
      {moveTarget && <ExceptionMoveDialog occurrence={moveTarget} onClose={() => setMoveTarget(null)} onDone={async () => { await reload(); }} />}
      {bulkDate && <BulkCancelDialog date={bulkDate} occurrences={occurrences.filter((item) => item.date === bulkDate)} onClose={() => setBulkDate(null)} onDone={async () => { await reload(); }} />}
      {addOpen && <MakeUpDialog onClose={() => setAddOpen(false)} onDone={async () => { await reload(); }} />}
      <Toaster message={toast} />
    </div>
  );
}

function ExceptionCancelDialog({ occurrence, onClose, onDone }) {
  const { createTimetableException, notify } = useFormal();
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  return (
    <FormalModal title="登记停课" onClose={onClose}>
      {error && <div className="demo-alert"><AlertTriangle size={16} />{error}</div>}
      <p className="formal-hint">{formatDayLabel(occurrence.date)} · {formatTimeRange(occurrence.startAt, occurrence.endAt)} · {occurrence.title}</p>
      <label className="demo-field demo-field--full"><span>原因（可选）</span><input value={note} onChange={(event) => setNote(event.target.value)} placeholder="例如：国庆调休 / 教师出差" autoFocus /></label>
      <div className="demo-form__footer">
        <button className="demo-button demo-button--ghost" type="button" onClick={onClose}>取消</button>
        <button
          className="demo-button demo-button--danger"
          type="button"
          disabled={saving}
          onClick={async () => {
            setSaving(true);
            try {
              await createTimetableException({ templateId: occurrence.templateId, date: occurrence.date, kind: "cancel", note });
              notify("已登记停课");
              await onDone();
              onClose();
            } catch (cause) {
              setError(cause?.message ?? "登记失败");
            } finally {
              setSaving(false);
            }
          }}
        >确认停课</button>
      </div>
    </FormalModal>
  );
}

function ExceptionMoveDialog({ occurrence, onClose, onDone }) {
  const { createTimetableException, notify } = useFormal();
  const [form, setForm] = useState({
    startAt: toShanghaiInput(occurrence.startAt),
    endAt: toShanghaiInput(occurrence.endAt),
    location: occurrence.location ?? "",
    note: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const update = (key, value) => setForm((current) => ({ ...current, [key]: value }));
  return (
    <FormalModal title="调整这节课" onClose={onClose}>
      {error && <div className="demo-alert"><AlertTriangle size={16} />{error}</div>}
      <p className="formal-hint">{formatDayLabel(occurrence.date)} · {occurrence.title}</p>
      <div className="demo-form">
        <label className="demo-field"><span>新的开始时间</span><input type="datetime-local" value={form.startAt} onChange={(event) => update("startAt", event.target.value)} /></label>
        <label className="demo-field"><span>新的结束时间</span><input type="datetime-local" value={form.endAt} onChange={(event) => update("endAt", event.target.value)} /></label>
        <label className="demo-field demo-field--full"><span>新的地点（可选）</span><input value={form.location} onChange={(event) => update("location", event.target.value)} /></label>
        <label className="demo-field demo-field--full"><span>说明（可选）</span><input value={form.note} onChange={(event) => update("note", event.target.value)} placeholder="例如：换到 4 区 402" /></label>
      </div>
      <div className="demo-form__footer">
        <button className="demo-button demo-button--ghost" type="button" onClick={onClose}>取消</button>
        <button
          className="demo-button demo-button--primary"
          type="button"
          disabled={saving}
          onClick={async () => {
            setSaving(true);
            try {
              await createTimetableException({
                templateId: occurrence.templateId,
                date: occurrence.date,
                kind: "move",
                newStartAt: fromShanghaiInput(form.startAt),
                newEndAt: fromShanghaiInput(form.endAt),
                newLocation: form.location.trim(),
                note: form.note.trim(),
              });
              notify("已更新这节课");
              await onDone();
              onClose();
            } catch (cause) {
              setError(cause?.message ?? "保存失败");
            } finally {
              setSaving(false);
            }
          }}
        >保存调整</button>
      </div>
    </FormalModal>
  );
}

function BulkCancelDialog({ date, occurrences, onClose, onDone }) {
  const { createTimetableException, notify } = useFormal();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  return (
    <FormalModal title="这一天停课" onClose={onClose}>
      {error && <div className="demo-alert"><AlertTriangle size={16} />{error}</div>}
      <p className="formal-hint">{formatDayLabel(date)} 共 {occurrences.length} 节课，确认后整天的课都会移除。</p>
      <label className="demo-field demo-field--full"><span>原因（可选）</span><input value={note} onChange={(event) => setNote(event.target.value)} autoFocus /></label>
      <div className="demo-form__footer">
        <button className="demo-button demo-button--ghost" type="button" onClick={onClose}>取消</button>
        <button
          className="demo-button demo-button--danger"
          type="button"
          disabled={saving || !occurrences.length}
          onClick={async () => {
            setSaving(true);
            try {
              for (const occurrence of occurrences) {
                await createTimetableException({ templateId: occurrence.templateId, date: occurrence.date, kind: "cancel", note });
              }
              notify(`已停课 ${occurrences.length} 节`);
              await onDone();
              onClose();
            } catch (cause) {
              setError(cause?.message ?? "操作失败");
            } finally {
              setSaving(false);
            }
          }}
        >确认停课</button>
      </div>
    </FormalModal>
  );
}

function MakeUpDialog({ onClose, onDone }) {
  const { createTimetableException, notify } = useFormal();
  const [form, setForm] = useState({ title: "", date: dateKeyOf(new Date().toISOString()), startAt: "", endAt: "", location: "", note: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const update = (key, value) => setForm((current) => ({ ...current, [key]: value }));
  return (
    <FormalModal title="登记补课" onClose={onClose}>
      {error && <div className="demo-alert"><AlertTriangle size={16} />{error}</div>}
      <div className="demo-form">
        <label className="demo-field demo-field--full"><span>课程名称</span><input value={form.title} onChange={(event) => update("title", event.target.value)} placeholder="例如：高等数学(1)" autoFocus /></label>
        <label className="demo-field"><span>日期</span><input type="date" value={form.date} onChange={(event) => update("date", event.target.value)} /></label>
        <label className="demo-field"><span>地点（可选）</span><input value={form.location} onChange={(event) => update("location", event.target.value)} /></label>
        <label className="demo-field"><span>开始时间</span><input type="datetime-local" value={form.startAt} onChange={(event) => update("startAt", event.target.value)} /></label>
        <label className="demo-field"><span>结束时间</span><input type="datetime-local" value={form.endAt} onChange={(event) => update("endAt", event.target.value)} /></label>
        <label className="demo-field demo-field--full"><span>说明（可选）</span><input value={form.note} onChange={(event) => update("note", event.target.value)} /></label>
      </div>
      <div className="demo-form__footer">
        <button className="demo-button demo-button--ghost" type="button" onClick={onClose}>取消</button>
        <button
          className="demo-button demo-button--primary"
          type="button"
          disabled={saving || !form.title.trim() || !form.startAt || !form.endAt}
          onClick={async () => {
            setSaving(true);
            try {
              await createTimetableException({
                date: form.date,
                kind: "add",
                title: form.title.trim(),
                newStartAt: fromShanghaiInput(form.startAt),
                newEndAt: fromShanghaiInput(form.endAt),
                newLocation: form.location.trim(),
                note: form.note.trim(),
              });
              notify("已登记补课");
              await onDone();
              onClose();
            } catch (cause) {
              setError(cause?.message ?? "登记失败");
            } finally {
              setSaving(false);
            }
          }}
        >保存</button>
      </div>
    </FormalModal>
  );
}