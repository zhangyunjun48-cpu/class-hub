import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Check, CheckCircle2, Link2, MapPin, Pencil, ShieldCheck, Trash2, X } from "lucide-react";
import { categories, categoryLabel } from "../../demo/schedule-logic.js";
import { formatShanghai, fromShanghaiInput, toShanghaiInput } from "../../demo/time.js";
import { validateScheduleDraft } from "../../formal/schedule-logic.js";
import { RepositoryError } from "../../formal/repository.js";

export function FormalModal({ title, onClose, children, wide = false, sheet = false }) {
  const panelRef = useRef(null);
  const titleId = useRef(`formal-dialog-${Math.random().toString(16).slice(2)}`);

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
      <section
        className={`demo-modal ${wide ? "demo-modal--wide" : ""} ${sheet ? "formal-sheet" : ""}`}
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId.current}
      >
        <header>
          <h2 id={titleId.current}>{title}</h2>
          <button className="demo-icon-button" type="button" onClick={onClose} aria-label="关闭"><X size={18} /></button>
        </header>
        <div className="demo-modal__body">{children}</div>
      </section>
    </div>
  );
}

const URL_PATTERN = /(https?:\/\/[^\s<>()（）"'，。、；]+)/g;

/** 把纯文本里的网址渲染成可点击链接，其余部分原样显示。 */
export function LinkifiedText({ text }) {
  if (!text) return null;
  const parts = String(text).split(URL_PATTERN);
  return (
    <p>
      {parts.map((part, index) => (
        /^https?:\/\//.test(part)
          ? <a key={index} className="formal-link" href={part} target="_blank" rel="noreferrer noopener">{part}</a>
          : <span key={index}>{part}</span>
      ))}
    </p>
  );
}

export function CategoryPill({ category }) {
  const item = categories.find((entry) => entry.id === category);
  return <span className={`demo-category demo-category--${item?.tone ?? "ink"}`}>{categoryLabel(category)}</span>;
}

export function Toaster({ message }) {
  if (!message) return null;
  return <div className="demo-toast" role="status"><Check size={16} />{message}</div>;
}

export function EmptyState({ icon: Icon = CheckCircle2, title, children, small = false }) {
  return (
    <div className={`demo-empty ${small ? "demo-empty--small" : ""}`}>
      <Icon size={small ? 20 : 26} />
      <h3>{title}</h3>
      {children}
    </div>
  );
}

export function ScheduleEditor({ schedule = null, onClose, onSubmit, canSetImportant = false }) {
  const [form, setForm] = useState({
    title: schedule?.title ?? "",
    category: schedule?.category ?? "task",
    importance: schedule?.importance ?? "normal",
    startAt: toShanghaiInput(schedule?.startAt),
    dueAt: toShanghaiInput(schedule?.dueAt),
    endAt: toShanghaiInput(schedule?.endAt),
    location: schedule?.location ?? "",
    note: schedule?.note ?? "",
    relatedLink: schedule?.relatedLink ?? "",
  });
  const [errors, setErrors] = useState({});
  const [version, setVersion] = useState(schedule?.version ?? 1);
  const [conflict, setConflict] = useState(null);
  const [saving, setSaving] = useState(false);

  const update = (key, value) => setForm((current) => ({ ...current, [key]: value }));

  const loadLatest = () => {
    if (!conflict) return;
    setForm({
      title: conflict.title,
      category: conflict.category,
      importance: conflict.importance,
      startAt: toShanghaiInput(conflict.startAt),
      dueAt: toShanghaiInput(conflict.dueAt),
      endAt: toShanghaiInput(conflict.endAt),
      location: conflict.location ?? "",
      note: conflict.note ?? "",
      relatedLink: conflict.relatedLink ?? "",
    });
    setVersion(conflict.version);
    setConflict(null);
  };

  const submit = async (event) => {
    event.preventDefault();
    const draft = {
      ...form,
      title: form.title.trim(),
      location: form.location.trim(),
      note: form.note.trim(),
      relatedLink: form.relatedLink.trim(),
      startAt: fromShanghaiInput(form.startAt),
      dueAt: fromShanghaiInput(form.dueAt),
      endAt: fromShanghaiInput(form.endAt),
    };
    const nextErrors = validateScheduleDraft(draft);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;

    setSaving(true);
    setConflict(null);
    try {
      await onSubmit(draft, version);
      onClose();
    } catch (error) {
      if (error instanceof RepositoryError && error.code === "VERSION_CONFLICT") {
        setConflict(error.current ?? null);
      } else if (error instanceof RepositoryError && error.code === "ADMIN_REAUTH_REQUIRED") {
        setConflict({ error: "管理员验证已过期，请重新验证后再保存" });
      } else {
        setConflict({ error: error instanceof Error ? error.message : "保存失败，请重试" });
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <FormalModal title={schedule ? "修改日程" : "新增日程"} onClose={onClose} wide>
      {conflict?.error && <div className="demo-alert"><AlertTriangle size={17} />{conflict.error}</div>}
      {conflict && !conflict.error && (
        <div className="demo-alert demo-alert--stack">
          <div><AlertTriangle size={17} />已有同学修改了这条日程，本次内容没有覆盖对方。</div>
          <button className="demo-button demo-button--small demo-button--ghost" type="button" onClick={loadLatest}>载入服务器最新内容</button>
        </div>
      )}
      <form className="demo-form" onSubmit={submit}>
        <label className="demo-field demo-field--full"><span>事项名称</span><input value={form.title} onChange={(event) => update("title", event.target.value)} placeholder="例如：数据结构第三次作业" autoFocus />{errors.title && <small>{errors.title}</small>}</label>
        <label className="demo-field"><span>分类</span><select value={form.category} onChange={(event) => update("category", event.target.value)}>{categories.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
        {canSetImportant ? (
          <label className="demo-field"><span>重要程度</span><select value={form.importance} onChange={(event) => update("importance", event.target.value)}><option value="normal">普通（全班可协作修改）</option><option value="important">重要（仅管理员可修改）</option></select></label>
        ) : (
          <div className="demo-field"><span>重要程度</span><p className="formal-hint">{form.importance === "important" ? "重要（仅管理员可修改）" : "普通（全班可协作修改）"}</p></div>
        )}
        <label className="demo-field"><span>开始时间，可选</span><input type="datetime-local" value={form.startAt} onChange={(event) => update("startAt", event.target.value)} />{errors.startAt && <small>{errors.startAt}</small>}</label>
        <label className="demo-field"><span>截止时间，可选</span><input type="datetime-local" value={form.dueAt} onChange={(event) => update("dueAt", event.target.value)} />{errors.dueAt && <small>{errors.dueAt}</small>}</label>
        <label className="demo-field"><span>结束时间，可选</span><input type="datetime-local" value={form.endAt} disabled={!form.startAt} onChange={(event) => update("endAt", event.target.value)} />{errors.endAt && <small>{errors.endAt}</small>}</label>
        <label className="demo-field"><span>地点，可选</span><input value={form.location} onChange={(event) => update("location", event.target.value)} placeholder="例如：软件园校区 A304" /></label>
        <label className="demo-field demo-field--full"><span>补充说明，可选</span><textarea rows="3" value={form.note} onChange={(event) => update("note", event.target.value)} placeholder="提交格式、携带物品等" /></label>
        <label className="demo-field demo-field--full"><span>相关链接，可选</span><input value={form.relatedLink} onChange={(event) => update("relatedLink", event.target.value)} placeholder="https://…（只保存外部链接，不上传文件）" />{errors.relatedLink && <small>{errors.relatedLink}</small>}</label>
        {!canSetImportant && <p className="demo-field demo-field--full formal-hint">普通日程全班都可以直接修改，保存后其他在线同学会立即看到。</p>}
        <footer className="demo-form__footer demo-field--full">
          <button className="demo-button demo-button--ghost" type="button" onClick={onClose}>取消</button>
          <button className="demo-button demo-button--primary" type="submit" disabled={saving}>{saving ? "保存中" : schedule ? "保存修改" : "添加日程"}</button>
        </footer>
      </form>
    </FormalModal>
  );
}

export function ScheduleRow({ schedule, completed, onToggle, onEdit, onDelete, canEdit = true, canDelete = false, compact = false }) {
  const important = schedule.importance === "important";
  const primaryTime = schedule.dueAt ?? schedule.startAt ?? schedule.endAt;
  const showRange = Boolean(schedule.startAt && schedule.endAt);
  return (
    <article className={`demo-schedule-row ${important ? "is-important" : ""} ${compact ? "is-compact" : ""}`}>
      <button className={`demo-complete ${completed ? "is-complete" : ""}`} type="button" onClick={() => onToggle(schedule.id, !completed)} aria-label={completed ? `取消完成${schedule.title}` : `标记完成${schedule.title}`}>
        {completed ? <Check size={17} /> : <span />}
      </button>
      <div className="demo-schedule-row__main">
        <div className="demo-schedule-row__meta">
          <CategoryPill category={schedule.category} />
          {important && <span className="demo-important">重要</span>}
          {schedule.dueAt && <span className="formal-badge">截止</span>}
        </div>
        <h3>{schedule.title}</h3>
        <div className="demo-schedule-row__details">
          {primaryTime && (
            <span>
              {schedule.dueAt ? "截止" : showRange ? "时间" : "开始"}：{formatShanghai(primaryTime, "M月d日 HH:mm")}
              {showRange && ` – ${formatShanghai(schedule.endAt, "HH:mm")}`}
            </span>
          )}
          {schedule.location && <span><MapPin size={14} />{schedule.location}</span>}
          {schedule.relatedLink && <a href={schedule.relatedLink} target="_blank" rel="noreferrer noopener"><Link2 size={14} />相关链接</a>}
        </div>
        {!compact && schedule.note && <p className="demo-schedule-row__note">{schedule.note}</p>}
      </div>
      <div className="demo-schedule-row__actions">
        {canEdit && <button className="demo-icon-button" type="button" onClick={() => onEdit(schedule)} aria-label={`编辑${schedule.title}`}><Pencil size={16} /></button>}
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
  const [saving, setSaving] = useState(false);
  return (
    <FormalModal title="发布公告" onClose={onClose}>
      {error && <div className="demo-alert"><AlertTriangle size={17} />{error}</div>}
      <form className="demo-form" onSubmit={async (event) => {
        event.preventDefault();
        const nextTitle = title.trim();
        const nextBody = body.trim();
        if (!nextTitle || !nextBody) {
          setError("请填写公告标题和内容");
          return;
        }
        setSaving(true);
        try {
          await onSubmit({ title: nextTitle, body: nextBody, pinned });
          onClose();
        } catch (cause) {
          setError(cause instanceof Error ? cause.message : "发布失败");
        } finally {
          setSaving(false);
        }
      }}>
        <label className="demo-field demo-field--full"><span>标题</span><input value={title} onChange={(event) => setTitle(event.target.value)} autoFocus /></label>
        <label className="demo-field demo-field--full"><span>内容</span><textarea rows="5" value={body} onChange={(event) => setBody(event.target.value)} /></label>
        <label className="demo-check demo-field--full"><input type="checkbox" checked={pinned} onChange={(event) => setPinned(event.target.checked)} /><span>置顶显示</span></label>
        <footer className="demo-form__footer demo-field--full">
          <button className="demo-button demo-button--ghost" type="button" onClick={onClose}>取消</button>
          <button className="demo-button demo-button--primary" type="submit" disabled={saving}>{saving ? "发布中" : "发布"}</button>
        </footer>
      </form>
    </FormalModal>
  );
}

export function AdminPinDialog({ onClose, onSubmit, systemOwner = false }) {
  const [mode, setMode] = useState("verify");
  const [pin, setPin] = useState("");
  const [confirm, setConfirm] = useState("");
  const [recoveryKey, setRecoveryKey] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    if (mode === "setup" && pin !== confirm) {
      setError("两次输入的 PIN 不一致");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await onSubmit(mode === "setup" ? { newPin: pin } : recoveryKey ? { recoveryKey } : { pin });
      onClose();
    } catch (cause) {
      if (cause?.code === "ADMIN_PIN_SETUP_REQUIRED") {
        setMode("setup");
        setError("首次使用请先设置管理员 PIN（至少 6 位）");
      } else if (cause?.code === "ADMIN_PIN_LOCKED") {
        setError("PIN 已锁定，请 15 分钟后再试");
      } else {
        setError(cause instanceof Error ? cause.message : "验证失败");
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <FormalModal title={mode === "setup" ? "设置管理员 PIN" : "管理员验证"} onClose={onClose}>
      <div className="formal-pin-intro"><ShieldCheck size={20} /><p>发布公告、删除恢复、成员管理和名单导入需要管理员验证，验证 15 分钟内有效。</p></div>
      {error && <div className="demo-alert"><AlertTriangle size={17} />{error}</div>}
      <form className="demo-form" onSubmit={submit}>
        {mode === "verify" ? (
          <>
            <label className="demo-field demo-field--full"><span>管理员 PIN</span><input type="password" value={pin} onChange={(event) => setPin(event.target.value)} autoFocus autoComplete="current-password" /></label>
            {systemOwner && (
              <label className="demo-field demo-field--full"><span>或使用服务器恢复密钥</span><input type="password" value={recoveryKey} onChange={(event) => setRecoveryKey(event.target.value)} autoComplete="off" /></label>
            )}
          </>
        ) : (
          <>
            <label className="demo-field demo-field--full"><span>新 PIN（至少 6 位）</span><input type="password" value={pin} onChange={(event) => setPin(event.target.value)} autoFocus autoComplete="new-password" /></label>
            <label className="demo-field demo-field--full"><span>再次输入</span><input type="password" value={confirm} onChange={(event) => setConfirm(event.target.value)} autoComplete="new-password" /></label>
          </>
        )}
        <footer className="demo-form__footer demo-field--full">
          <button className="demo-button demo-button--ghost" type="button" onClick={onClose}>取消</button>
          <button className="demo-button demo-button--primary" type="submit" disabled={saving}>{saving ? "验证中" : mode === "setup" ? "设置并验证" : "验证"}</button>
        </footer>
      </form>
    </FormalModal>
  );
}

export function ResourceEditor({ resource = null, onClose, onSubmit }) {
  const [form, setForm] = useState({
    title: resource?.title ?? "",
    description: resource?.description ?? "",
    category: resource?.category ?? "学习资源",
    url: resource?.url ?? "",
    ownerName: resource?.ownerName ?? "",
    official: resource?.official ?? false,
  });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const update = (key, value) => setForm((current) => ({ ...current, [key]: value }));

  return (
    <FormalModal title={resource ? "编辑资料" : "新增资料"} onClose={onClose}>
      {error && <div className="demo-alert"><AlertTriangle size={17} />{error}</div>}
      <form className="demo-form" onSubmit={async (event) => {
        event.preventDefault();
        if (!form.title.trim() || !form.url.trim()) {
          setError("请填写资料名称和链接");
          return;
        }
        setSaving(true);
        try {
          await onSubmit({ ...form, title: form.title.trim(), url: form.url.trim(), description: form.description.trim(), ownerName: form.ownerName.trim() });
          onClose();
        } catch (cause) {
          setError(cause instanceof Error ? cause.message : "保存失败");
        } finally {
          setSaving(false);
        }
      }}>
        <label className="demo-field demo-field--full"><span>资料名称</span><input value={form.title} onChange={(event) => update("title", event.target.value)} autoFocus /></label>
        <label className="demo-field demo-field--full"><span>外部链接</span><input value={form.url} onChange={(event) => update("url", event.target.value)} placeholder="https://…" /></label>
        <label className="demo-field"><span>分类</span><input value={form.category} onChange={(event) => update("category", event.target.value)} /></label>
        <label className="demo-field"><span>维护人</span><input value={form.ownerName} onChange={(event) => update("ownerName", event.target.value)} placeholder="例如：学习委员" /></label>
        <label className="demo-field demo-field--full"><span>说明</span><textarea rows="2" value={form.description} onChange={(event) => update("description", event.target.value)} /></label>
        <label className="demo-check demo-field--full"><input type="checkbox" checked={form.official} onChange={(event) => update("official", event.target.checked)} /><span>标记为班委维护的常用资料</span></label>
        <p className="demo-field demo-field--full formal-hint">资料只保存链接，不上传课件、往年题等受版权保护的文件。</p>
        <footer className="demo-form__footer demo-field--full">
          <button className="demo-button demo-button--ghost" type="button" onClick={onClose}>取消</button>
          <button className="demo-button demo-button--primary" type="submit" disabled={saving}>{saving ? "保存中" : "保存"}</button>
        </footer>
      </form>
    </FormalModal>
  );
}

export function FeedbackComposer({ onClose, onSubmit }) {
  const [category, setCategory] = useState("功能建议");
  const [content, setContent] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  return (
    <FormalModal title="提交反馈" onClose={onClose}>
      {error && <div className="demo-alert"><AlertTriangle size={17} />{error}</div>}
      <form className="demo-form" onSubmit={async (event) => {
        event.preventDefault();
        if (content.trim().length < 2) {
          setError("请填写至少 2 个字的反馈内容");
          return;
        }
        setSaving(true);
        try {
          await onSubmit({ category, content: content.trim() });
          onClose();
        } catch (cause) {
          setError(cause instanceof Error ? cause.message : "提交失败");
        } finally {
          setSaving(false);
        }
      }}>
        <label className="demo-field"><span>类型</span><select value={category} onChange={(event) => setCategory(event.target.value)}><option>功能建议</option><option>数据纠错</option><option>使用问题</option><option>其他</option></select></label>
        <label className="demo-field demo-field--full"><span>反馈内容</span><textarea rows="4" value={content} onChange={(event) => setContent(event.target.value)} placeholder="描述你遇到的问题或希望新增的功能" autoFocus /></label>
        {error && <small className="demo-field demo-field--full">{error}</small>}
        <footer className="demo-form__footer demo-field--full">
          <button className="demo-button demo-button--ghost" type="button" onClick={onClose}>取消</button>
          <button className="demo-button demo-button--primary" type="submit" disabled={saving}>{saving ? "提交中" : "提交反馈"}</button>
        </footer>
      </form>
    </FormalModal>
  );
}

export function ConfirmDialog({ title, message, confirmLabel = "确认", onClose, onConfirm, danger = false }) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  return (
    <FormalModal title={title} onClose={onClose}>
      {error && <div className="demo-alert"><AlertTriangle size={17} />{error}</div>}
      <div className="demo-confirm">
        <p>{message}</p>
        <footer>
          <button className="demo-button demo-button--ghost" type="button" onClick={onClose}>取消</button>
          <button
            className={`demo-button ${danger ? "demo-button--danger" : "demo-button--primary"}`}
            type="button"
            disabled={saving}
            onClick={async () => {
              setSaving(true);
              try {
                await onConfirm();
                onClose();
              } catch (cause) {
                setError(cause instanceof Error ? cause.message : "操作失败");
              } finally {
                setSaving(false);
              }
            }}
          >
            {saving ? "处理中" : confirmLabel}
          </button>
        </footer>
      </div>
    </FormalModal>
  );
}