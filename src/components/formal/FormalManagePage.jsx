import { useEffect, useState } from "react";
import { AlertTriangle, Check, FileUp, Megaphone, Plus, ShieldCheck, Trash2, Undo2, Users } from "lucide-react";
import { formatShanghai } from "../../demo/time.js";
import { useFormal } from "../../formal/FormalContext.jsx";
import { AdminPinDialog, ConfirmDialog, EmptyState, Toaster } from "./FormalShared.jsx";

const TABS = [
  ["members", Users, "成员"],
  ["roster", FileUp, "名单导入"],
  ["announcements", Megaphone, "公告"],
  ["feedback", ShieldCheck, "反馈"],
  ["trash", Trash2, "回收站"],
  ["audit", Undo2, "审计"]
];

const CSV_TEMPLATE = "student_id,name,group,initial_role,active\n2021001,张三,一组,member,true\n2021002,李四,二组,admin,true";

const ROLE_LABEL = { owner: "主 Owner", admin: "管理员", member: "成员" };
const FEEDBACK_LABEL = { pending: "待处理", resolved: "已解决", ignored: "暂不处理" };

export function FormalManagePage({ onAnnouncement }) {
  const {
    session, isAdmin, adminVerified, reauthAdmin, snapshot, notify, toast,
    loadMembers, updateMember, previewRoster, commitRoster,
    deleteAnnouncement, loadTrash, restoreSchedule, loadAudit, revertRevision,
    loadAllFeedback, resolveFeedback
  } = useFormal();
  const [tab, setTab] = useState("members");
  const [pinOpen, setPinOpen] = useState(false);
  const [members, setMembers] = useState([]);
  const [trash, setTrash] = useState([]);
  const [audit, setAudit] = useState([]);
  const [feedback, setFeedback] = useState([]);
  const [csv, setCsv] = useState("");
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [removingAnnouncement, setRemovingAnnouncement] = useState(null);

  const verified = adminVerified;

  const loadTab = async (next = tab) => {
    setError("");
    try {
      if (next === "members") setMembers(await loadMembers());
      else if (next === "trash") setTrash(await loadTrash());
      else if (next === "audit") setAudit(await loadAudit());
      else if (next === "feedback") setFeedback(await loadAllFeedback());
    } catch (cause) {
      setError(cause?.message ?? "读取失败");
    }
  };

  useEffect(() => {
    if (!isAdmin || !verified) return;
    void loadTab(tab);
  }, [tab, isAdmin, verified]);

  if (!isAdmin) {
    return <div className="demo-page"><EmptyState icon={ShieldCheck} title="仅管理员可访问">当前账号没有管理权限。</EmptyState></div>;
  }

  if (!verified) {
    return (
      <div className="demo-page">
        <section className="demo-page-intro"><div><p className="demo-eyebrow">MANAGE</p><h1>管理</h1><p>敏感操作需要先验证管理员 PIN。</p></div></section>
        <section className="demo-section formal-gate">
          <ShieldCheck size={26} />
          <h2>需要管理员验证</h2>
          <p>发布公告、删除恢复、成员管理和名单导入都需要最近 15 分钟内验证过管理员 PIN；超过 15 分钟会自动要求重新验证。</p>
          <p className="formal-hint">
            当前账号：{session?.name}（{ROLE_LABEL[session?.role] ?? session?.role}）
            {session?.isSystemOwner ? " · 系统兜底管理员：无需 PIN，正常不会看到本页" : ""}
          </p>
          <p className="formal-hint">如果一直验证不过去：PIN 连续输错 5 次会锁定 15 分钟；忘记 PIN 时，可改用系统兜底账号登录（它不需要 PIN）。</p>
          <button className="demo-button demo-button--primary" type="button" onClick={() => setPinOpen(true)}>验证管理员 PIN</button>
        </section>
        {pinOpen && <AdminPinDialog systemOwner={session?.isSystemOwner} onClose={() => setPinOpen(false)} onSubmit={(payload) => reauthAdmin(payload)} />}
        <Toaster message={toast} />
      </div>
    );
  }

  return (
    <div className="demo-page">
      <section className="demo-page-intro">
        <div><p className="demo-eyebrow">MANAGE</p><h1>管理</h1><p>公告、成员、名单、反馈、回收站与审计日志。</p></div>
        <button className="demo-button demo-button--ghost" type="button" onClick={() => setPinOpen(true)}><ShieldCheck size={16} />重新验证</button>
      </section>

      <div className="demo-toolbar">
        <div className="demo-chips" role="tablist" aria-label="管理功能">
          {TABS.map(([id, Icon, label]) => (
            <button type="button" role="tab" aria-selected={tab === id} key={id} className={tab === id ? "is-active" : ""} onClick={() => setTab(id)}><Icon size={15} />{label}</button>
          ))}
        </div>
      </div>

      {error && <div className="demo-alert"><AlertTriangle size={16} />{error}</div>}

      {tab === "members" && (
        <section className="demo-section">
          <div className="demo-section-head"><div><p className="demo-eyebrow">MEMBERS</p><h2>成员管理</h2></div></div>
          <div className="formal-table" role="table">
            <div className="formal-table__head" role="row"><span>姓名</span><span>学号末四位</span><span>分组</span><span>角色</span><span>状态</span></div>
            {members.map((member) => (
              <div className="formal-table__row" role="row" key={member.id}>
                <span>{member.name}{member.isSystemOwner && <em>兜底</em>}</span>
                <span>{member.studentIdLast4}</span>
                <span>
                  <input
                    key={`${member.id}-${member.group}`}
                    className="formal-table__input"
                    defaultValue={member.group}
                    placeholder="未分组"
                    disabled={member.isSystemOwner || member.id === session.id}
                    aria-label={`${member.name} 的分组`}
                    onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }}
                    onBlur={async (event) => {
                      const next = event.currentTarget.value.trim();
                      if (next === member.group) return;
                      try {
                        await updateMember(member.id, { group: next });
                        await loadTab("members");
                      } catch (cause) {
                        setError(cause?.message ?? "分组更新失败");
                      }
                    }}
                  />
                </span>
                <span>
                  <select
                    value={member.role}
                    disabled={member.isSystemOwner || member.id === session.id || (member.role === "owner" && session.role !== "owner")}
                    onChange={async (event) => { await updateMember(member.id, { role: event.target.value }); await loadTab("members"); }}
                    aria-label={`${member.name} 的角色`}
                  >
                    <option value="member">成员</option>
                    <option value="admin">管理员</option>
                    <option value="owner">主 Owner</option>
                  </select>
                </span>
                <span>
                  <button
                    className="demo-button demo-button--small demo-button--ghost"
                    type="button"
                    disabled={member.isSystemOwner || member.id === session.id}
                    onClick={async () => { await updateMember(member.id, { active: !member.active }); await loadTab("members"); }}
                  >
                    {member.active ? "已启用" : "已禁用"}
                  </button>
                </span>
              </div>
            ))}
            {!members.length && <EmptyState icon={Users} title="暂无成员" small />}
          </div>
        </section>
      )}

      {tab === "roster" && (
        <section className="demo-section">
          <div className="demo-section-head"><div><p className="demo-eyebrow">ROSTER IMPORT</p><h2>导入白名单</h2></div></div>
          <p className="formal-hint">UTF-8 CSV，表头固定为 student_id,name,group,initial_role,active。学号只用于生成 HMAC 与末四位掩码，服务端不保存明文，原始 CSV 不会落盘。</p>
          <label className="demo-field demo-field--full">
            <span>CSV 内容</span>
            <textarea rows="7" value={csv} onChange={(event) => { setCsv(event.target.value); setPreview(null); }} placeholder={CSV_TEMPLATE} />
          </label>
          <div className="formal-actions">
            <button className="demo-button demo-button--ghost" type="button" onClick={() => setCsv(CSV_TEMPLATE)}>填入示例</button>
            <button
              className="demo-button demo-button--primary"
              type="button"
              disabled={busy || !csv.trim()}
              onClick={async () => {
                setBusy(true); setError("");
                try { setPreview(await previewRoster(csv)); }
                catch (cause) { setError(cause?.message ?? "解析失败"); }
                finally { setBusy(false); }
              }}
            >解析预览</button>
          </div>

          {preview && (
            <div className="formal-preview">
              <div className="demo-alert" role="status">
                <Check size={16} />共 {preview.rows.length} 行，启用 {preview.active} 人{preview.errors.length ? `，发现 ${preview.errors.length} 个错误` : "，没有发现错误"}
              </div>
              {preview.errors.length > 0 && <ul className="formal-error-list">{preview.errors.map((item) => <li key={item}>{item}</li>)}</ul>}
              <div className="formal-table" role="table">
                <div className="formal-table__head" role="row"><span>行号</span><span>姓名</span><span>学号</span><span>分组</span><span>角色</span></div>
                {preview.rows.map((row) => (
                  <div className="formal-table__row" role="row" key={row.line}>
                    <span>{row.line}</span><span>{row.name}</span><span>{row.studentIdLast4}</span><span>{row.group || "—"}</span><span>{ROLE_LABEL[row.initialRole] ?? row.initialRole}</span>
                  </div>
                ))}
              </div>
              <div className="formal-actions">
                <button
                  className="demo-button demo-button--primary"
                  type="button"
                  disabled={!preview.valid || busy}
                  onClick={async () => {
                    setBusy(true); setError("");
                    try {
                      const result = await commitRoster(preview.rows.map((row) => ({ studentId: row.studentId, name: row.name, group: row.group, initialRole: row.initialRole, active: row.active })));
                      notify(`已导入 ${result.imported} 名成员`);
                      setPreview(null); setCsv(""); setMembers(await loadMembers());
                    } catch (cause) { setError(cause?.message ?? "导入失败"); }
                    finally { setBusy(false); }
                  }}
                >确认入库</button>
              </div>
            </div>
          )}
        </section>
      )}

      {tab === "announcements" && (
        <section className="demo-section">
          <div className="demo-section-head">
            <div><p className="demo-eyebrow">ANNOUNCEMENTS</p><h2>公告管理</h2></div>
            <button className="demo-button demo-button--primary" type="button" onClick={onAnnouncement}><Plus size={16} />发布公告</button>
          </div>
          {snapshot.announcements.length ? snapshot.announcements.map((item) => (
            <div className="demo-manage-row" key={item.id}>
              <div><strong>{item.pinned ? "置顶 · " : ""}{item.title}</strong><small>{formatShanghai(item.createdAt, "M月d日 HH:mm")}</small></div>
              <button className="demo-button demo-button--small demo-button--ghost" type="button" onClick={() => setRemovingAnnouncement(item)}>删除</button>
            </div>
          )) : <EmptyState icon={Megaphone} title="还没有公告" small />}
        </section>
      )}

      {tab === "feedback" && (
        <section className="demo-section">
          <div className="demo-section-head"><div><p className="demo-eyebrow">FEEDBACK</p><h2>成员反馈</h2></div></div>
          {feedback.length ? feedback.map((item) => (
            <article className="formal-feedback-item" key={item.id}>
              <header>
                <strong>{item.memberName} · {item.category}</strong>
                <span className={`formal-status formal-status--${item.status}`}>{FEEDBACK_LABEL[item.status] ?? item.status}</span>
                <small>{formatShanghai(item.createdAt, "M月d日 HH:mm")}</small>
              </header>
              <p>{item.content}</p>
              <form
                className="formal-reply"
                onSubmit={async (event) => {
                  event.preventDefault();
                  const data = new FormData(event.currentTarget);
                  try {
                    setFeedback(await resolveFeedback(item.id, { status: String(data.get("status")), adminReply: String(data.get("reply") ?? "") }));
                    notify("反馈状态已更新");
                  } catch (cause) { setError(cause?.message ?? "更新失败"); }
                }}
              >
                <select name="status" defaultValue={item.status} aria-label="处理状态"><option value="pending">待处理</option><option value="resolved">已解决</option><option value="ignored">暂不处理</option></select>
                <input name="reply" defaultValue={item.adminReply} placeholder="回复内容（可选）" aria-label="回复内容" />
                <button className="demo-button demo-button--small demo-button--primary" type="submit">保存</button>
              </form>
            </article>
          )) : <EmptyState icon={ShieldCheck} title="暂无反馈" small />}
        </section>
      )}

      {tab === "trash" && (
        <section className="demo-section">
          <div className="demo-section-head"><div><p className="demo-eyebrow">RECYCLE BIN</p><h2>回收站</h2></div></div>
          {trash.length ? trash.map((item) => (
            <div className="demo-manage-row" key={item.id}>
              <div><strong>{item.title}</strong><small>删除于 {formatShanghai(item.deletedAt, "M月d日 HH:mm")}</small></div>
              <button className="demo-button demo-button--small demo-button--ghost" type="button" onClick={async () => { try { await restoreSchedule(item.id); notify("日程已恢复"); await loadTab("trash"); } catch (cause) { setError(cause?.message ?? "恢复失败，请重新验证管理员 PIN"); } }}>恢复</button>
            </div>
          )) : <EmptyState icon={Trash2} title="回收站是空的" small />}
        </section>
      )}

      {tab === "audit" && (
        <section className="demo-section">
          <div className="demo-section-head"><div><p className="demo-eyebrow">AUDIT</p><h2>变更日志</h2></div></div>
          {audit.length ? audit.map((item) => (
            <div className="demo-manage-row" key={item.id}>
              <div><strong>{item.summary}</strong><small>{item.actor} · {formatShanghai(item.createdAt, "M月d日 HH:mm")}</small></div>
              {item.entityType === "schedule" && item.before && item.action !== "create" && (
                <button className="demo-button demo-button--small demo-button--ghost" type="button" onClick={async () => { try { await revertRevision(item.id); notify("已回退到该版本"); await loadTab("audit"); } catch (cause) { setError(cause?.message ?? "回退失败"); } }}>回退</button>
              )}
            </div>
          )) : <EmptyState icon={Undo2} title="暂无变更记录" small />}
        </section>
      )}

      {pinOpen && <AdminPinDialog systemOwner={session?.isSystemOwner} onClose={() => setPinOpen(false)} onSubmit={(payload) => reauthAdmin(payload)} />}
      {removingAnnouncement && (
        <ConfirmDialog
          title="删除公告"
          message={`确定删除「${removingAnnouncement.title}」吗？`}
          confirmLabel="删除"
          danger
          onClose={() => setRemovingAnnouncement(null)}
          onConfirm={async () => { await deleteAnnouncement(removingAnnouncement.id); notify("公告已删除"); }}
        />
      )}
      <Toaster message={toast} />
    </div>
  );
}