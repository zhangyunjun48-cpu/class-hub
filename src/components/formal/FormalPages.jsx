import { useMemo, useState } from "react";
import { AlertTriangle, ArrowRight, CalendarDays, LogOut, Plus, Search, ShieldCheck } from "lucide-react";
import { categories, categoryLabel } from "../../demo/schedule-logic.js";
import { dateKeyShanghai, formatShanghai, relativeDayShanghai } from "../../demo/time.js";
import { useFormal } from "../../formal/FormalContext.jsx";
import { compareSchedules, countCompleted, isDueSoon, isOverdue, isToday, searchSchedules, timelineAt } from "../../formal/schedule-logic.js";
import { activeChanges, exceptionKindLabel, formatTimeRange } from "../../formal/timetable-view.js";
import { EmptyState, LinkifiedText, ScheduleRow } from "./FormalShared.jsx";
import { siteConfig } from "../../config/site.js";

function Metric({ value, label, tone = "ink" }) {
  return <div className={`demo-metric demo-metric--${tone}`}><strong>{value}</strong><span>{label}</span></div>;
}

const canEditSchedule = (schedule, isAdmin) => isAdmin || schedule.importance !== "important";

export function FormalHomePage({ onAdd, onEdit, onDelete, onToggle, navigate }) {
  const { snapshot, session, isAdmin, timetable } = useFormal();
  const schedules = useMemo(() => snapshot.schedules.filter((item) => !item.deletedAt), [snapshot.schedules]);
  const completed = snapshot.completedScheduleIds;
  const sorted = useMemo(() => [...schedules].sort(compareSchedules), [schedules]);

  const today = sorted.filter((item) => isToday(item) && !countCompleted(completed, item.id));
  const dueSoon = sorted.filter((item) => isDueSoon(item) && !countCompleted(completed, item.id));
  const overdue = sorted.filter((item) => isOverdue(item) && !countCompleted(completed, item.id));
  const pending = sorted.filter((item) => !countCompleted(completed, item.id));
  const attention = [...overdue, ...dueSoon, ...pending]
    .filter((item, index, list) => list.findIndex((entry) => entry.id === item.id) === index)
    .slice(0, 5);
  const announcements = snapshot.announcements.slice(0, 3);
  const revisions = snapshot.revisions.slice(0, 5);
  const important = sorted.filter((item) => item.importance === "important" && !countCompleted(completed, item.id)).slice(0, 4);
  const todayKey = dateKeyShanghai(new Date().toISOString());
  const timetableChanges = activeChanges(timetable?.changes, todayKey);
  const todayCourses = timetable?.today ?? [];

  return (
    <div className="demo-page">
      <section className="demo-page-intro">
        <div>
          <p className="demo-eyebrow">SHARED SCHEDULE</p>
          <h1>{siteConfig.siteName}</h1>
          <p>全班共享同一份日程，改动自动同步；重要事项与公告由班委维护。</p>
        </div>
        <button className="demo-button demo-button--primary" type="button" onClick={onAdd}><Plus size={17} />新增日程</button>
      </section>

      <section className="demo-metrics">
        <Metric value={today.length} label="今日事项" tone="red" />
        <Metric value={dueSoon.length} label="7 日内截止" tone="gold" />
        <Metric value={overdue.length} label="已逾期" tone="danger" />
        <Metric value={snapshot.completedScheduleIds.length} label="我的完成" tone="green" />
      </section>

      {timetableChanges.length > 0 && (
        <section className="formal-change-strip" aria-label="课表变更">
          {timetableChanges.map((item) => (
            <button type="button" key={item.id} onClick={() => navigate("timetable")}>
              <AlertTriangle size={14} />
              <strong>{formatShanghai(`${item.date}T00:00:00+08:00`, "M月d日")}</strong>
              <span>{item.title} · {exceptionKindLabel(item.kind)}{item.note ? `（${item.note}）` : ""}</span>
            </button>
          ))}
        </section>
      )}

      <div className="demo-home-grid">
        <section className="demo-section">
          <div className="demo-section-head">
            <div><p className="demo-eyebrow">NEEDS ATTENTION</p><h2>现在最需要关注</h2></div>
            <button className="demo-text-link" type="button" onClick={() => navigate("schedule")}>全部日程 <ArrowRight size={15} /></button>
          </div>
          {attention.length ? (
            <div className="demo-schedule-list">
              {attention.map((item) => (
                <ScheduleRow
                  key={item.id}
                  schedule={item}
                  completed={countCompleted(completed, item.id)}
                  onToggle={onToggle}
                  onEdit={onEdit}
                  onDelete={onDelete}
                  canEdit={canEditSchedule(item, isAdmin)}
                  canDelete={isAdmin}
                  compact
                />
              ))}
            </div>
          ) : (
            <EmptyState title="暂时没有待处理事项" small>新增的日程会立即出现在这里。</EmptyState>
          )}
        </section>

        <aside className="demo-feed">
          <section className="demo-feed-card">
            <div className="demo-section-head">
              <div><p className="demo-eyebrow">TODAY &amp; NEXT</p><h2>今天课程</h2></div>
              <button className="demo-text-link" type="button" onClick={() => navigate("timetable")}>课表 <ArrowRight size={15} /></button>
            </div>
            {!timetable?.semester ? (
              <p className="formal-hint">班委还没有导入课表。</p>
            ) : (
              <>
                <div className="formal-course-summary">
                  <strong>{todayCourses.length}</strong>
                  <span>节课</span>
                  {timetable.next && <small>下一节 {formatShanghai(timetable.next.startAt, "HH:mm")} · {timetable.next.title}</small>}
                </div>
                {todayCourses.length ? todayCourses.map((item) => (
                  <div className="demo-revision" key={item.id}>
                    <span>{formatTimeRange(item.startAt, item.endAt)}</span>
                    <p>{item.title}{item.changed ? "（已调整）" : ""}</p>
                    <small>{item.location}</small>
                  </div>
                )) : <p className="formal-hint">今天没有课。</p>}
              </>
            )}
          </section>

          <section className="demo-feed-card">
            <div className="demo-section-head"><div><p className="demo-eyebrow">NOTICE FEED</p><h2>信息流</h2></div></div>
            {announcements.length ? announcements.map((item) => (
              <article className="demo-feed-item" key={item.id}>
                <span>{formatShanghai(item.createdAt, "M月d日")}</span>
                <strong>{item.pinned ? "置顶 · " : ""}{item.title}</strong>
                <LinkifiedText text={item.body} />
              </article>
            )) : <EmptyState title="暂无公告" small />}
          </section>

          <section className="demo-feed-card">
            <div className="demo-section-head"><div><p className="demo-eyebrow">IMPORTANT</p><h2>重要日程</h2></div></div>
            {important.length ? important.map((item) => (
              <div className="demo-revision" key={item.id}><span>{categoryLabel(item.category)}</span><p>{item.title}</p><small>{formatShanghai(item.dueAt ?? item.startAt, "M月d日 HH:mm")}</small></div>
            )) : <EmptyState title="暂无重要日程" small />}
          </section>

          <section className="demo-feed-card">
            <div className="demo-section-head"><div><p className="demo-eyebrow">RECENT CHANGES</p><h2>最近变更</h2></div></div>
            {revisions.length ? revisions.map((item) => (
              <div className="demo-revision" key={item.id}><span>{item.actor}</span><p>{item.summary}</p><small>{formatShanghai(item.createdAt, "M月d日 HH:mm")}</small></div>
            )) : <EmptyState title="暂无变更记录" small />}
          </section>
        </aside>
      </div>

      {session?.isSystemOwner && (
        <section className="demo-danger-zone">
          <div><strong>系统兜底管理员</strong><p>当前账号由服务器恢复密钥初始化，不可被删除、禁用或降级。</p></div>
          <span className="formal-badge"><ShieldCheck size={14} />受保护</span>
        </section>
      )}
    </div>
  );
}

export function FormalSchedulePage({ onAdd, onEdit, onDelete, onToggle }) {
  const { snapshot, isAdmin } = useFormal();
  const [keyword, setKeyword] = useState("");
  const [category, setCategory] = useState("all");
  const completed = snapshot.completedScheduleIds;
  const schedules = snapshot.schedules.filter((item) => !item.deletedAt);
  const filtered = searchSchedules(schedules, keyword)
    .filter((item) => category === "all" || item.category === category)
    .sort(compareSchedules);
  const groups = filtered.reduce((result, item) => {
    const key = dateKeyShanghai(timelineAt(item));
    (result[key] ??= []).push(item);
    return result;
  }, {});

  return (
    <div className="demo-page">
      <section className="demo-page-intro">
        <div><p className="demo-eyebrow">ALL SCHEDULES</p><h1>全部日程</h1><p>搜索标题、地点、补充说明或相关链接。</p></div>
        <button className="demo-button demo-button--primary" type="button" onClick={onAdd}><Plus size={17} />新增日程</button>
      </section>

      <div className="demo-toolbar">
        <label className="demo-search">
          <Search size={16} />
          <input value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder="搜索日程" aria-label="搜索日程" />
        </label>
        <div className="demo-chips" role="group" aria-label="按分类筛选">
          <button type="button" className={category === "all" ? "is-active" : ""} onClick={() => setCategory("all")}>全部</button>
          {categories.map((item) => (
            <button type="button" key={item.id} className={category === item.id ? "is-active" : ""} onClick={() => setCategory(item.id)}>{item.label}</button>
          ))}
        </div>
      </div>

      <div className="demo-timeline">
        {Object.entries(groups).map(([key, items]) => (
          <section className="demo-timeline-group" key={key}>
            <header>
              <strong>{relativeDayShanghai(`${key}T00:00:00.000Z`)}</strong>
              <span>{formatShanghai(`${key}T00:00:00.000Z`, "M月d日 EEEE")}</span>
            </header>
            <div className="demo-schedule-list">
              {items.map((item) => (
                <ScheduleRow
                  key={item.id}
                  schedule={item}
                  completed={countCompleted(completed, item.id)}
                  onToggle={onToggle}
                  onEdit={onEdit}
                  onDelete={onDelete}
                  canEdit={canEditSchedule(item, isAdmin)}
                  canDelete={isAdmin}
                />
              ))}
            </div>
          </section>
        ))}
        {!filtered.length && <EmptyState icon={CalendarDays} title="没有匹配的日程">换一个关键词或分类试试。</EmptyState>}
      </div>
    </div>
  );
}

export function FormalMePage({ onEdit, onToggle, onDelete }) {
  const { snapshot, session, isAdmin, logout, notify } = useFormal();
  const schedules = snapshot.schedules.filter((item) => !item.deletedAt);
  const completed = snapshot.completedScheduleIds;
  const done = schedules.filter((item) => countCompleted(completed, item.id));
  const pending = schedules.filter((item) => !countCompleted(completed, item.id)).sort(compareSchedules);

  return (
    <div className="demo-page">
      <section className="demo-page-intro">
        <div><p className="demo-eyebrow">MY SPACE</p><h1>我的完成</h1><p>完成状态只属于你自己的账号，管理员只查看聚合数量。</p></div>
      </section>

      <section className="demo-profile-card">
        <span className="demo-profile-avatar">{session?.name?.slice(0, 1) ?? "?"}</span>
        <div>
          <small>{session?.isSystemOwner ? "系统兜底管理员" : isAdmin ? "管理员" : "班级成员"}</small>
          <h2>{session?.name}</h2>
          <p>学号末四位 {session?.studentIdLast4} · 同一浏览器 30 天内免验证，换浏览器需要重新验证。</p>
        </div>
        <button className="demo-button demo-button--ghost" type="button" onClick={async () => { await logout(); notify("已退出登录"); }}><LogOut size={16} />退出登录</button>
      </section>

      <section className="demo-metrics demo-metrics--profile">
        <Metric value={done.length} label="已完成" tone="green" />
        <Metric value={pending.length} label="待完成" tone="red" />
        <Metric value={schedules.length} label="全部日程" />
      </section>

      <section className="demo-section">
        <div className="demo-section-head"><div><p className="demo-eyebrow">PENDING</p><h2>我的待完成事项</h2></div></div>
        {pending.length ? (
          <div className="demo-schedule-list">
            {pending.map((item) => (
              <ScheduleRow
                key={item.id}
                schedule={item}
                completed={false}
                onToggle={onToggle}
                onEdit={onEdit}
                onDelete={onDelete}
                canEdit={canEditSchedule(item, isAdmin)}
                canDelete={isAdmin}
                compact
              />
            ))}
          </div>
        ) : <EmptyState title="所有事项都已完成" small>新增的日程会自动出现在这里。</EmptyState>}
      </section>

      {done.length > 0 && (
        <section className="demo-section">
          <div className="demo-section-head"><div><p className="demo-eyebrow">DONE</p><h2>已完成</h2></div></div>
          <div className="demo-schedule-list">
            {done.map((item) => (
              <ScheduleRow key={item.id} schedule={item} completed onToggle={onToggle} onEdit={onEdit} onDelete={onDelete} canEdit={canEditSchedule(item, isAdmin)} canDelete={isAdmin} compact />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}