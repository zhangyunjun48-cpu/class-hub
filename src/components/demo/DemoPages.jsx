import { useMemo, useState } from "react";
import { AlertTriangle, ArrowRight, BellRing, CalendarDays, CheckCircle2, Clock3, Home, LogOut, Menu, Moon, Plus, RotateCcw, Search, ShieldCheck, Sun, Trash2, UserRound } from "lucide-react";
import { categories, categoryLabel, compareSchedules, countCompleted, effectiveAt, isDueSoon, isOverdue, isToday, searchSchedules, timelineAt } from "../../demo/schedule-logic.js";
import { dateKeyShanghai, formatShanghai, relativeDayShanghai } from "../../demo/time.js";
import { useDemoSchedule } from "../../demo/DemoScheduleContext.jsx";
import { CategoryPill, ScheduleRow } from "./DemoShared.jsx";
import { siteConfig } from "../../config/site.js";

const navItems = [
  ["home", Home, "首页"],
  ["schedule", CalendarDays, "日程"],
  ["me", UserRound, "我的"]
];

export function DemoJoinPage() {
  const { join, inviteCode } = useDemoSchedule();
  const [nickname, setNickname] = useState("演示同学");
  const [code, setCode] = useState(inviteCode);
  const [adminMode, setAdminMode] = useState(false);
  const [adminCode, setAdminCode] = useState("");
  const [error, setError] = useState("");

  const submit = (event) => {
    event.preventDefault();
    try {
      setError("");
      join({ nickname, inviteCode: code, adminCode, adminMode });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "加入失败");
    }
  };

  return (
    <main className="demo-join-page">
      <section className="demo-join-intro">
        <span className="demo-join-mark">11</span>
        <p>{siteConfig.latinEyebrow}</p>
        <h1>打开就能看到，<br />今天别漏掉什么。</h1>
        <span>全班共享同一份日程，改动自动同步。新增、修改和完成记录都会立即出现在另一个浏览器标签中。</span>
        <ul>
          <li>先看今日与截止事项</li>
          <li>发现变化可以直接修改</li>
          <li>版本不一致时不会静默覆盖</li>
        </ul>
      </section>
      <section className="demo-join-panel">
        <div className="demo-join-card">
          <div className="demo-join-card__head"><strong>加入演示班级</strong><small>本地数据，不会上传</small></div>
          {error && <div className="demo-alert"><AlertTriangle size={16} />{error}</div>}
          <form className="demo-form" onSubmit={submit}>
            <label className="demo-field demo-field--full"><span>昵称</span><input value={nickname} onChange={(event) => setNickname(event.target.value)} minLength={2} maxLength={16} autoFocus /><small>2–16 个字符，不填写学号或真实姓名。</small></label>
            <label className="demo-field demo-field--full"><span>邀请码</span><input value={code} onChange={(event) => setCode(event.target.value)} /></label>
            <label className="demo-check demo-field--full"><input type="checkbox" checked={adminMode} onChange={(event) => setAdminMode(event.target.checked)} /><span>使用班委演示身份</span></label>
            {adminMode && <label className="demo-field demo-field--full"><span>班委演示码</span><input type="password" value={adminCode} onChange={(event) => setAdminCode(event.target.value)} placeholder="由演示组织者单独提供" /></label>}
            <button className="demo-button demo-button--primary demo-field--full" type="submit">进入{siteConfig.siteName} <ArrowRight size={17} /></button>
          </form>
          <p className="demo-join-note">演示邀请码：<code>{inviteCode}</code></p>
        </div>
      </section>
    </main>
  );
}

export function DemoShell({ children, route, navigate, theme, setTheme }) {
  const { session, logout, channelAvailable, lastUpdated } = useDemoSchedule();
  const [mobileOpen, setMobileOpen] = useState(false);
  return (
    <div className="demo-shell">
      <a className="skip-link" href="#main-content">跳到主要内容</a>
      <header className="demo-header">
        <div className="demo-header__inner">
          <button className="demo-brand" type="button" onClick={() => navigate("home")}><span>{siteConfig.brandMark}</span><strong>{siteConfig.siteName}</strong><small>本地演示版</small></button>
          <nav className="demo-nav" aria-label="主导航">
            {navItems.map(([id, Icon, label]) => <button type="button" key={id} className={route === id ? "is-active" : ""} onClick={() => navigate(id)}><Icon size={16} />{label}</button>)}
            {session.role === "admin" && <button type="button" className={route === "manage" ? "is-active" : ""} onClick={() => navigate("manage")}><ShieldCheck size={16} />管理</button>}
          </nav>
          <div className="demo-header__actions">
            <span className={`demo-sync-badge ${channelAvailable ? "is-synced" : "is-local"}`}>{channelAvailable ? "多标签同步" : "单机模式"}</span>
            <button className="demo-icon-button" type="button" aria-label="切换主题" onClick={() => setTheme(theme === "light" ? "dark" : "light")}>{theme === "light" ? <Moon size={17} /> : <Sun size={17} />}</button>
            <button className="demo-user" type="button" onClick={() => navigate("me")}><span>{session.nickname.slice(0, 1)}</span><b>{session.nickname}</b></button>
            <button className="demo-icon-button demo-menu-button" type="button" onClick={() => setMobileOpen((value) => !value)} aria-label="打开导航"><Menu size={18} /></button>
          </div>
        </div>
        {mobileOpen && <nav className="demo-mobile-menu">{navItems.map(([id, Icon, label]) => <button type="button" key={id} onClick={() => { navigate(id); setMobileOpen(false); }}><Icon size={17} />{label}</button>)}{session.role === "admin" && <button type="button" onClick={() => { navigate("manage"); setMobileOpen(false); }}><ShieldCheck size={17} />管理</button>}<button type="button" onClick={logout}><LogOut size={17} />退出演示</button></nav>}
        <div className="demo-sync-line">{lastUpdated ? `最近本地更新：${formatShanghai(lastUpdated, "HH:mm:ss")}` : "正在读取本地演示数据"}</div>
      </header>
      <main id="main-content">{children}</main>
      <nav className="demo-bottom-nav" aria-label="移动端导航">
        {navItems.map(([id, Icon, label]) => <button type="button" key={id} className={route === id ? "is-active" : ""} onClick={() => navigate(id)}><Icon size={19} /><span>{label}</span></button>)}
      </nav>
    </div>
  );
}

function Metric({ value, label, tone = "ink" }) {
  return <div className={`demo-metric demo-metric--${tone}`}><strong>{value}</strong><span>{label}</span></div>;
}

export function DemoHomePage({ onAdd, onEdit, onDelete, onToggle, navigate, onAnnouncement }) {
  const { snapshot, session } = useDemoSchedule();
  const schedules = useMemo(() => (snapshot?.store.schedules ?? []).filter((item) => !item.deletedAt), [snapshot]);
  const completions = snapshot?.store.completions ?? {};
  const sorted = useMemo(() => [...schedules].sort(compareSchedules), [schedules]);
  const today = sorted.filter((item) => isToday(item) && !countCompleted(item.id, session.memberId, completions));
  const dueSoon = sorted.filter((item) => isDueSoon(item) && !countCompleted(item.id, session.memberId, completions));
  const overdue = sorted.filter((item) => isOverdue(item) && !countCompleted(item.id, session.memberId, completions));
  const attention = [...overdue, ...dueSoon, ...sorted].filter((item, index, list) => list.findIndex((entry) => entry.id === item.id) === index && !countCompleted(item.id, session.memberId, completions)).slice(0, 5);
  const announcements = (snapshot?.store.announcements ?? []).filter((item) => !item.deletedAt).slice(0, 3);
  const revisions = (snapshot?.store.revisions ?? []).slice(0, 5);

  return (
    <div className="demo-page">
      <section className="demo-page-intro">
        <div><p className="demo-eyebrow">SHARED SCHEDULE</p><h1>{siteConfig.siteName}</h1><p>全班共享同一份日程，改动自动同步。</p></div>
        <button className="demo-button demo-button--primary" type="button" onClick={onAdd}><Plus size={17} />新增日程</button>
      </section>

      <section className="demo-metrics">
        <Metric value={today.length} label="今日事项" tone="red" />
        <Metric value={dueSoon.length} label="7日内截止" tone="gold" />
        <Metric value={overdue.length} label="已逾期" tone="danger" />
        <Metric value={Object.values(completions).filter((members) => members.includes(session.memberId)).length} label="我的完成" tone="green" />
      </section>

      <div className="demo-home-grid">
        <section className="demo-section">
          <div className="demo-section-head"><div><p className="demo-eyebrow">NEEDS ATTENTION</p><h2>现在最需要关注</h2></div><button className="demo-text-link" type="button" onClick={() => navigate("schedule")}>全部日程 <ArrowRight size={15} /></button></div>
          <div className="demo-schedule-list">{attention.map((item) => <ScheduleRow key={item.id} schedule={item} completed={completions[item.id] ?? []} memberId={session.memberId} onToggle={onToggle} onEdit={onEdit} onDelete={onDelete} canDelete={session.role === "admin"} compact />)}</div>
        </section>

        <aside className="demo-feed">
          <section className="demo-feed-card">
            <div className="demo-section-head"><div><p className="demo-eyebrow">NOTICE FEED</p><h2>信息流</h2></div>{session.role === "admin" && <button className="demo-text-link" type="button" onClick={onAnnouncement}>发布公告</button>}</div>
            {announcements.map((item) => <article className="demo-feed-item" key={item.id}><span>{formatShanghai(item.createdAt, "M月d日")}</span><strong>{item.pinned ? "置顶 · " : ""}{item.title}</strong><p>{item.body}</p></article>)}
          </section>
          <section className="demo-feed-card">
            <div className="demo-section-head"><div><p className="demo-eyebrow">RECENT CHANGES</p><h2>最近变更</h2></div></div>
            {revisions.map((item) => <div className="demo-revision" key={item.id}><span>{item.actor}</span><p>{item.summary}</p><small>{formatShanghai(item.createdAt, "M月d日 HH:mm")}</small></div>)}
          </section>
        </aside>
      </div>
    </div>
  );
}

export function DemoSchedulePage({ onAdd, onEdit, onDelete, onToggle }) {
  const { snapshot, session } = useDemoSchedule();
  const [keyword, setKeyword] = useState("");
  const [category, setCategory] = useState("all");
  const schedules = (snapshot?.store.schedules ?? []).filter((item) => !item.deletedAt);
  const completions = snapshot?.store.completions ?? {};
  const filtered = searchSchedules(schedules, keyword).filter((item) => category === "all" || item.category === category).sort(compareSchedules);
  const groups = filtered.reduce((result, item) => {
    const key = dateKeyShanghai(timelineAt(item));
    (result[key] ??= []).push(item);
    return result;
  }, {});

  return (
    <div className="demo-page">
      <section className="demo-page-intro"><div><p className="demo-eyebrow">ALL SCHEDULES</p><h1>全部日程</h1><p>搜索标题、地点或补充说明。</p></div><button className="demo-button demo-button--primary" type="button" onClick={onAdd}><Plus size={17} />新增日程</button></section>
      <div className="demo-toolbar">
        <label className="demo-search"><Search size={16} /><input value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder="搜索日程" /></label>
        <select value={category} onChange={(event) => setCategory(event.target.value)} aria-label="按分类筛选"><option value="all">全部分类</option>{categories.map((item) => <option value={item.id} key={item.id}>{item.label}</option>)}</select>
      </div>
      <div className="demo-timeline">
        {Object.entries(groups).map(([day, items]) => <section className="demo-timeline-group" key={day}><header><strong>{relativeDayShanghai(`${day}T09:00:00+08:00`)}</strong><span>{formatShanghai(`${day}T09:00:00+08:00`, "M月d日 EEEE")}</span></header><div className="demo-schedule-list">{items.map((item) => <ScheduleRow key={item.id} schedule={item} completed={completions[item.id] ?? []} memberId={session.memberId} onToggle={onToggle} onEdit={onEdit} onDelete={onDelete} canDelete={session.role === "admin"} />)}</div></section>)}
        {!filtered.length && <div className="demo-empty"><CalendarDays size={24} /><h3>没有匹配的日程</h3><p>换一个关键词或分类试试。</p></div>}
      </div>
    </div>
  );
}

export function DemoMePage({ onToggle, onEdit }) {
  const { session, snapshot, resetDemo, logout } = useDemoSchedule();
  const schedules = (snapshot?.store.schedules ?? []).filter((item) => !item.deletedAt);
  const completions = snapshot?.store.completions ?? {};
  const completed = schedules.filter((item) => countCompleted(item.id, session.memberId, completions));
  const pending = schedules.filter((item) => !countCompleted(item.id, session.memberId, completions)).sort(compareSchedules);

  return (
    <div className="demo-page">
      <section className="demo-page-intro"><div><p className="demo-eyebrow">MY SPACE</p><h1>我的完成</h1><p>完成状态只属于当前浏览器标签中的演示身份。</p></div></section>
      <section className="demo-profile-card">
        <span className="demo-profile-avatar">{session.nickname.slice(0, 1)}</span>
        <div><small>{session.role === "admin" ? "班委演示身份" : "同学演示身份"}</small><h2>{session.nickname}</h2><p>数据仅保存在本机浏览器中，刷新后保留，退出演示不会删除日程。</p></div>
        <button className="demo-button demo-button--ghost" type="button" onClick={logout}><LogOut size={16} />退出演示</button>
      </section>
      <section className="demo-metrics demo-metrics--profile"><Metric value={completed.length} label="已完成" tone="green" /><Metric value={pending.length} label="待完成" tone="red" /><Metric value={schedules.length} label="全部日程" /></section>
      <section className="demo-section">
        <div className="demo-section-head"><div><p className="demo-eyebrow">PENDING</p><h2>我的待完成事项</h2></div></div>
        <div className="demo-schedule-list">{pending.map((item) => <ScheduleRow key={item.id} schedule={item} completed={completions[item.id] ?? []} memberId={session.memberId} onToggle={onToggle} onEdit={onEdit} canDelete={false} compact />)}</div>
      </section>
      <section className="demo-danger-zone">
        <div><strong>重置演示数据</strong><p>恢复六种初始日程场景，保留当前登录身份。</p></div>
        <button className="demo-button demo-button--danger" type="button" onClick={resetDemo}><RotateCcw size={16} />重置演示</button>
      </section>
    </div>
  );
}

export function DemoManagePage({ onAnnouncement }) {
  const { session, snapshot, restoreSchedule } = useDemoSchedule();
  if (session.role !== "admin") return <div className="demo-page"><div className="demo-empty"><ShieldCheck size={24} /><h3>仅班委演示身份可访问</h3><p>退出后使用班委演示码重新加入。</p></div></div>;
  const deleted = (snapshot?.store.schedules ?? []).filter((item) => item.deletedAt);
  const announcements = (snapshot?.store.announcements ?? []).filter((item) => !item.deletedAt);
  const revisions = snapshot?.store.revisions ?? [];
  return (
    <div className="demo-page">
      <section className="demo-page-intro"><div><p className="demo-eyebrow">MANAGE</p><h1>管理演示</h1><p>发布信息流、恢复删除和查看最近变更。</p></div><button className="demo-button demo-button--primary" type="button" onClick={onAnnouncement}><Plus size={17} />发布公告</button></section>
      <div className="demo-manage-grid">
        <section className="demo-section"><div className="demo-section-head"><div><p className="demo-eyebrow">RECYCLE BIN</p><h2>回收站</h2></div></div>{deleted.map((item) => <div className="demo-manage-row" key={item.id}><div><strong>{item.title}</strong><small>由 {item.updatedBy} 删除</small></div><button className="demo-button demo-button--small demo-button--ghost" type="button" onClick={() => restoreSchedule(item.id)}>恢复</button></div>)}{!deleted.length && <div className="demo-empty demo-empty--small"><Trash2 size={20} /><p>回收站是空的。</p></div>}</section>
        <section className="demo-section"><div className="demo-section-head"><div><p className="demo-eyebrow">ANNOUNCEMENTS</p><h2>已发布公告</h2></div></div>{announcements.map((item) => <div className="demo-manage-row" key={item.id}><div><strong>{item.pinned ? "置顶 · " : ""}{item.title}</strong><small>{item.createdBy} · {formatShanghai(item.createdAt, "M月d日 HH:mm")}</small></div></div>)}</section>
        <section className="demo-section demo-section--wide"><div className="demo-section-head"><div><p className="demo-eyebrow">AUDIT</p><h2>最近变更</h2></div></div><div className="demo-audit-list">{revisions.map((item) => <div className="demo-revision" key={item.id}><span>{item.actor}</span><p>{item.summary}</p><small>{formatShanghai(item.createdAt, "M月d日 HH:mm")}</small></div>)}</div></section>
      </div>
    </div>
  );
}

