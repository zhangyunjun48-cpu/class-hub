import { useEffect, useMemo, useState } from "react";
import { BookOpen, ExternalLink, Library, MessageSquarePlus, Pencil, Plus, ShieldCheck, Trash2 } from "lucide-react";
import { formatShanghai } from "../../demo/time.js";
import { useFormal } from "../../formal/FormalContext.jsx";
import { ConfirmDialog, EmptyState, FeedbackComposer, ResourceEditor, Toaster } from "./FormalShared.jsx";
import { siteConfig } from "../../config/site.js";

export function FormalResourcesPage() {
  const { resources, isAdmin, createResource, updateResource, deleteResource, notify, toast } = useFormal();
  const [editing, setEditing] = useState(null);
  const [creating, setCreating] = useState(false);
  const [removing, setRemoving] = useState(null);

  const grouped = useMemo(() => {
    const map = new Map();
    resources.forEach((item) => {
      const key = item.category || "其他";
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(item);
    });
    return [...map.entries()];
  }, [resources]);

  return (
    <div className="demo-page">
      <section className="demo-page-intro">
        <div>
          <p className="demo-eyebrow">RESOURCES</p>
          <h1>资料</h1>
          <p>只保存外部链接与获取方式，不托管课件、往年题等受版权保护的文件。</p>
        </div>
        {isAdmin && <button className="demo-button demo-button--primary" type="button" onClick={() => setCreating(true)}><Plus size={17} />新增资料</button>}
      </section>

      {grouped.length ? grouped.map(([category, items]) => (
        <section className="demo-section formal-resource-group" key={category}>
          <div className="demo-section-head"><div><p className="demo-eyebrow">CATEGORY</p><h2>{category}</h2></div></div>
          <div className="formal-resource-grid">
            {items.map((item) => (
              <article className="formal-resource-card" key={item.id}>
                <header>
                  <strong>{item.title}</strong>
                  {item.official && <span className="formal-badge">常用</span>}
                </header>
                {item.description && <p>{item.description}</p>}
                <footer>
                  <a href={item.url} target="_blank" rel="noreferrer noopener"><ExternalLink size={14} />打开链接</a>
                  <small>{item.ownerName ? `维护人：${item.ownerName}` : `更新于 ${formatShanghai(item.updatedAt, "M月d日")}`}</small>
                  {isAdmin && (
                    <span className="formal-resource-card__actions">
                      <button className="demo-icon-button" type="button" onClick={() => setEditing(item)} aria-label={`编辑${item.title}`}><Pencil size={15} /></button>
                      <button className="demo-icon-button demo-icon-button--danger" type="button" onClick={() => setRemoving(item)} aria-label={`删除${item.title}`}><Trash2 size={15} /></button>
                    </span>
                  )}
                </footer>
              </article>
            ))}
          </div>
        </section>
      )) : <EmptyState icon={Library} title="还没有资料"><span>管理员可以添加常用系统或学习资源的外部链接。</span></EmptyState>}

      {creating && <ResourceEditor onClose={() => setCreating(false)} onSubmit={async (input) => { await createResource(input); notify("资料已添加"); }} />}
      {editing && <ResourceEditor resource={editing} onClose={() => setEditing(null)} onSubmit={async (input) => { await updateResource(editing.id, input); notify("资料已更新"); }} />}
      {removing && (
        <ConfirmDialog
          title="删除资料"
          message={`确定删除「${removing.title}」吗？资料只保存链接，删除不会影响原网站。`}
          confirmLabel="删除"
          danger
          onClose={() => setRemoving(null)}
          onConfirm={async () => { await deleteResource(removing.id); notify("资料已删除"); }}
        />
      )}
      <Toaster message={toast} />
    </div>
  );
}

const STATUS_LABEL = { pending: "待处理", resolved: "已解决", ignored: "暂不处理" };

export function FormalFeedbackPage() {
  const { submitFeedback, loadMyFeedback, notify, toast } = useFormal();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [composing, setComposing] = useState(false);
  const [error, setError] = useState("");

  const reload = async () => {
    setLoading(true);
    try {
      setItems(await loadMyFeedback());
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "读取反馈失败");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void reload(); }, []);

  return (
    <div className="demo-page">
      <section className="demo-page-intro">
        <div><p className="demo-eyebrow">FEEDBACK</p><h1>反馈</h1><p>你只能看到自己提交的反馈和处理状态。</p></div>
        <button className="demo-button demo-button--primary" type="button" onClick={() => setComposing(true)}><Plus size={17} />提交反馈</button>
      </section>

      {error && <div className="demo-alert">{error}</div>}
      <section className="demo-section">
        <div className="demo-section-head"><div><p className="demo-eyebrow">MY FEEDBACK</p><h2>我的提交</h2></div></div>
        {loading ? <p className="formal-hint">正在读取…</p> : items.length ? (
          <div className="formal-feedback-list">
            {items.map((item) => (
              <article className="formal-feedback-item" key={item.id}>
                <header>
                  <strong>{item.category}</strong>
                  <span className={`formal-status formal-status--${item.status}`}>{STATUS_LABEL[item.status] ?? item.status}</span>
                  <small>{formatShanghai(item.createdAt, "M月d日 HH:mm")}</small>
                </header>
                <p>{item.content}</p>
                {item.adminReply && <blockquote><ShieldCheck size={14} />班委回复：{item.adminReply}</blockquote>}
              </article>
            ))}
          </div>
        ) : <EmptyState icon={MessageSquarePlus} title="还没有提交过反馈"><span>遇到问题或想新增功能，可以点右上角提交。</span></EmptyState>}
      </section>

      {composing && (
        <FeedbackComposer
          onClose={() => setComposing(false)}
          onSubmit={async (input) => { await submitFeedback(input); notify("反馈已提交"); await reload(); }}
        />
      )}
      <Toaster message={toast} />
    </div>
  );
}

const FALLBACK_STEPS = [
  { id: 1, title: "首次验证", body: "输入白名单中的学号和姓名，再输入班级激活码。验证成功后，同一浏览器 30 天内无需重复验证。", image: "/tutorial/01-login.svg" },
  { id: 2, title: "普通与重要日程", body: "普通日程全班都可以直接修改；重要日程只有管理员可以修改。保存后会立即同步给其他在线成员。", image: "/tutorial/02-schedules.svg" },
  { id: 3, title: "完成与反馈", body: "成员只能看到自己的完成状态。遇到问题可在“其它 → 反馈”提交，管理员回复后原帖显示处理结果。", image: "/tutorial/03-feedback.svg" },
  { id: 4, title: "资料与管理", body: "资料库只保存外部链接。管理员可以发布公告、维护资料、调整成员角色和查看变更日志。", image: "/tutorial/04-manage.svg" }
];

export function FormalTutorialPage() {
  const { tutorial } = useFormal();
  const steps = tutorial.length ? tutorial : FALLBACK_STEPS;

  return (
    <div className="demo-page">
      <section className="demo-page-intro">
        <div><p className="demo-eyebrow">HOW IT WORKS</p><h1>怎么使用 {siteConfig.siteName}</h1><p>四步看懂：怎么登录、怎么改日程、怎么完成、怎么找班委。</p></div>
      </section>

      <div className="formal-tutorial-grid">
        {steps.map((step, index) => (
          <article className="formal-tutorial-card" key={step.id ?? index}>
            <span className="formal-tutorial-index">{String(index + 1).padStart(2, "0")}</span>
            <h2>{step.title}</h2>
            <p>{step.body}</p>
            {step.image && <img src={step.image} alt={`${step.title} 示意图`} loading="lazy" />}
          </article>
        ))}
      </div>

      <section className="demo-section formal-tutorial-notes">
        <div className="demo-section-head"><div><p className="demo-eyebrow">QUICK ANSWERS</p><h2>常见问题</h2></div><BookOpen size={18} /></div>
        <dl>
          <dt>换了浏览器或清了 Cookie？</dt><dd>重新用学号 + 姓名 + 班级激活码验证一次即可。</dd>
          <dt>为什么不能保存重要日程？</dt><dd>重要日程和公告由管理员锁定，避免上课时间、考试安排被误改。</dd>
          <dt>保存时提示有人改过？</dt><dd>说明另一位同学已经改过这条日程。载入最新内容确认后再保存，系统不会静默覆盖。</dd>
          <dt>能上传课件或作业吗？</dt><dd>目前不托管文件。资料只记录外部链接和获取方式，作业提交仍在学校系统完成。</dd>
        </dl>
      </section>
    </div>
  );
}