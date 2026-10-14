import { useEffect, useRef, useState } from "react";
import { AlertTriangle, CalendarClock, Check, Clock3, MapPin, Pencil, Trash2, X } from "lucide-react";
import { categories, categoryLabel, validateScheduleDraft } from "../../demo/schedule-logic.js";
import { fromShanghaiInput, toShanghaiInput } from "../../demo/time.js";
import { RepositoryError } from "../../demo/MockScheduleRepository.js";

export function DemoModal({ title, onClose, children, wide = false }) {
  const panelRef = useRef(null);
  const titleId = useRef(`dialog-title-${Math.random().toString(16).slice(2)}`);

  useEffect(() => {
    const panel = panelRef.current;
    const previous = document.activeElement;
    const focusable = panel?.querySelectorAll('button, input, select, textarea, [href], [tabindex]:not([tabindex="-1"])');
    focusable?.[0]?.focus();
    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab" || !focusable?.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      if (previous instanceof HTMLElement) previous.focus();
    };
  }, [onClose]);

  return (
    <div className="demo-modal-layer" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className={`demo-modal ${wide ? "demo-modal--wide" : ""}`} ref={panelRef} role="dialog" aria-modal="true" aria-labelledby={titleId.current}>
        <header>
          <h2 id={titleId.current}>{title}</h2>
          <button className="demo-icon-button" type="button" onClick={onClose} aria-label="关闭"><X size={18} /></button>
        </header>
        <div className="demo-modal__body">{children}</div>
      </section>
    </div>
  );
}

export function CategoryPill({ category }) {
  const item = categories.find((entry) => entry.id === category);
  return <span className={`demo-category demo-category--${item?.tone ?? "ink"}`}>{categoryLabel(category)}</span>;
}

export function ScheduleEditor({ schedule = null, onClose, onSubmit }) {
  const [form, setForm] = useState({
    title: schedule?.title ?? "",
    category: schedule?.category ?? "task",
    startAt: toShanghaiInput(schedule?.startAt),
    dueAt: toShanghaiInput(schedule?.dueAt),
    endAt: toShanghaiInput(schedule?.endAt),
    location: schedule?.location ?? "",
    note: schedule?.note ?? "",
    important: schedule?.important ?? false
  });
  const [errors, setErrors] = useState({});
  const [version, setVersion] = useState(schedule?.version ?? 1);
  const [conflict, setConflict] = useState("");
  const [saving, setSaving] = useState(false);

  const update = (key, value) => setForm((current) => ({ ...current, [key]: value }));

  const submit = async (event) => {
    event.preventDefault();
    const draft = {
      ...form,
      title: form.title.trim(),
      location: form.location.trim(),
      note: form.note.trim(),
      startAt: fromShanghaiInput(form.startAt),
      dueAt: fromShanghaiInput(form.dueAt),
      endAt: fromShanghaiInput(form.endAt)
    };
    const nextErrors = validateScheduleDraft(draft);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;

    setSaving(true);
    setConflict("");
    try {
      await onSubmit(draft, version);
      onClose();
    } catch (error) {
      if (error instanceof RepositoryError && error.code === "VERSION_CONFLICT") {
        setVersion(error.current?.version ?? version);
        setConflict("已有同学修改了这条日程。已刷新为最新版本，请核对内容后再次保存。");
      } else {
        setConflict(error instanceof Error ? error.message : "保存失败，请重试");
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <DemoModal title={schedule ? "修改日程" : "新增日程"} onClose={onClose} wide>
      {conflict && <div className="demo-alert"><AlertTriangle size={17} />{conflict}</div>}
      <form className="demo-form" onSubmit={submit}>
        <label className="demo-field demo-field--full"><span>事项名称</span><input value={form.title} onChange={(event) => update("title", event.target.value)} placeholder="例如：数据结构第三次作业" autoFocus />{errors.title && <small>{errors.title}</small>}</label>
        <label className="demo-field"><span>分类</span><select value={form.category} onChange={(event) => update("category", event.target.value)}>{categories.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
        <label className="demo-field"><span>地点</span><input value={form.location} onChange={(event) => update("location", event.target.value)} placeholder="线上或具体教室" /></label>
        <label className="demo-field"><span>开始时间</span><input type="datetime-local" value={form.startAt} onChange={(event) => update("startAt", event.target.value)} />{errors.startAt && <small>{errors.startAt}</small>}</label>
        <label className="demo-field"><span>截止时间</span><input type="datetime-local" value={form.dueAt} onChange={(event) => update("dueAt", event.target.value)} />{errors.dueAt && <small>{errors.dueAt}</small>}</label>
        <label className="demo-field"><span>结束时间，可选</span><input type="datetime-local" value={form.endAt} disabled={!form.startAt} onChange={(event) => update("endAt", event.target.value)} />{errors.endAt && <small>{errors.endAt}</small>}</label>
        <label className="demo-field demo-field--full"><span>补充说明</span><textarea rows="3" value={form.note} onChange={(event) => update("note", event.target.value)} placeholder="提交格式、携带物品等" /></label>
        <label className="demo-check demo-field--full"><input type="checkbox" checked={form.important} onChange={(event) => update("important", event.target.checked)} /><span>标记为重要事项</span></label>
        <footer className="demo-form__footer demo-field--full">
          <button className="demo-button demo-button--ghost" type="button" onClick={onClose}>取消</button>
          <button className="demo-button demo-button--primary" type="submit" disabled={saving}>{saving ? "保存中" : schedule ? "保存修改" : "添加日程"}</button>
        </footer>
      </form>
    </DemoModal>
  );
}

export function ScheduleRow({ schedule, completed, memberId, onToggle, onEdit, onDelete, canDelete, compact = false }) {
  const time = schedule.startAt ?? schedule.dueAt;
  const completedByMember = completed.includes(memberId);
  return (
    <article className={`demo-schedule-row ${schedule.important ? "is-important" : ""} ${compact ? "is-compact" : ""}`}>
      <button className={`demo-complete ${completedByMember ? "is-complete" : ""}`} type="button" onClick={() => onToggle(schedule.id, !completedByMember)} aria-label={completedByMember ? "取消完成" : "标记完成"}>
        {completedByMember ? <Check size={17} /> : <span />}
      </button>
      <div className="demo-schedule-row__main">
        <div className="demo-schedule-row__meta"><CategoryPill category={schedule.category} />{schedule.important && <span className="demo-important">重要</span>}</div>
        <h3>{schedule.title}</h3>
        <div className="demo-schedule-row__details">
          {time && <span><CalendarClock size={14} />{time === schedule.dueAt ? "截止" : "开始"}：{new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(time))}</span>}
          {schedule.location && <span><MapPin size={14} />{schedule.location}</span>}
        </div>
      </div>
      <div className="demo-schedule-row__actions">
        <button className="demo-icon-button" type="button" onClick={() => onEdit(schedule)} aria-label={`编辑${schedule.title}`}><Pencil size={16} /></button>
        {canDelete && <button className="demo-icon-button demo-icon-button--danger" type="button" onClick={() => onDelete(schedule)} aria-label={`删除${schedule.title}`}><Trash2 size={16} /></button>}
      </div>
    </article>
  );
}

export function AnnouncementEditor({ onClose, onSubmit }) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [pinned, setPinned] = useState(false);
  const [error, setError] = useState("");
  return (
    <DemoModal title="发布公告" onClose={onClose}>
      {error && <div className="demo-alert"><AlertTriangle size={17} />{error}</div>}
      <form className="demo-form" onSubmit={async (event) => {
        event.preventDefault();
        const values = new FormData(event.currentTarget);
        const submittedTitle = String(values.get("title") ?? "").trim();
        const submittedBody = String(values.get("body") ?? "").trim();
        setTitle(submittedTitle);
        setBody(submittedBody);
        try { await onSubmit({ title: submittedTitle, body: submittedBody, pinned }); onClose(); } catch (cause) { setError(cause instanceof Error ? cause.message : "发布失败"); }
      }}>
        <label className="demo-field demo-field--full"><span>标题</span><input name="title" value={title} onChange={(event) => setTitle(event.target.value)} required autoFocus /></label>
        <label className="demo-field demo-field--full"><span>内容</span><textarea name="body" rows="5" value={body} onChange={(event) => setBody(event.target.value)} required /></label>
        <label className="demo-check demo-field--full"><input type="checkbox" checked={pinned} onChange={(event) => setPinned(event.target.checked)} /><span>置顶显示</span></label>
        <footer className="demo-form__footer demo-field--full"><button className="demo-button demo-button--ghost" type="button" onClick={onClose}>取消</button><button className="demo-button demo-button--primary" type="submit">发布</button></footer>
      </form>
    </DemoModal>
  );
}

export function Toast({ message }) {
  if (!message) return null;
  return <div className="demo-toast" role="status"><Check size={16} />{message}</div>;
}

