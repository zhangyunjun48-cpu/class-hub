import { useEffect, useState } from "react";
import {
  BookOpen, CalendarDays, CalendarRange, CircleUserRound, Grid2x2, Home, Library, LogOut,
  MessageSquarePlus, Moon, MoreHorizontal, ShieldCheck, Sun, UserRound
} from "lucide-react";
import { formatShanghai } from "../../demo/time.js";
import { SiteFooter } from "./SiteFooter.jsx";
import { siteConfig } from "../../config/site.js";
import { AdminPinDialog } from "./FormalShared.jsx";
import { useFormal } from "../../formal/FormalContext.jsx";

const mainNav = [
  ["home", Home, "首页"],
  ["timetable", CalendarRange, "课表"],
  ["schedule", CalendarDays, "日程"],
  ["me", CircleUserRound, "我的"]
];

function otherNav(isAdmin) {
  const items = [
    ["resources", Library, "资料", "公共链接与常用系统"],
    ["tutorial", BookOpen, "图文教程", "四步学会怎么用"],
    ["feedback", MessageSquarePlus, "反馈", "提交问题并查看处理状态"]
  ];
  if (isAdmin) items.push(["manage", ShieldCheck, "管理", "公告、成员、名单与审计"]);
  return items;
}

export function FormalShell({ children, route, navigate }) {
  const { session, logout, isAdmin, syncError, lastSyncAt, notify, reauthNeeded, clearReauthNeeded, reauthAdmin } = useFormal();
  const [theme, setTheme] = useState(() => window.localStorage.getItem(siteConfig.themeKey) || "light");
  const [otherOpen, setOtherOpen] = useState(false);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    window.localStorage.setItem(siteConfig.themeKey, theme);
  }, [theme]);

  useEffect(() => {
    if (!otherOpen) return undefined;
    const onKeyDown = (event) => { if (event.key === "Escape") setOtherOpen(false); };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [otherOpen]);

  const go = (next) => { setOtherOpen(false); navigate(next); };
  const items = otherNav(isAdmin);
  const inOtherGroup = items.some(([id]) => id === route);

  return (
    <div className="demo-shell">
      <a className="skip-link" href="#main-content">跳到主要内容</a>
      <header className="demo-header">
        <div className="demo-header__inner">
          <button className="demo-brand" type="button" onClick={() => navigate("home")}>
            <span>{siteConfig.brandMark}</span><strong>{siteConfig.siteName}</strong><small>{siteConfig.subtitle}</small>
          </button>
          <nav className="demo-nav" aria-label="主导航">
            {mainNav.map(([id, Icon, label]) => (
              <button type="button" key={id} className={route === id ? "is-active" : ""} onClick={() => navigate(id)}>
                <Icon size={16} />{label}
              </button>
            ))}
            <button type="button" className={inOtherGroup ? "is-active" : ""} onClick={() => setOtherOpen((value) => !value)} aria-expanded={otherOpen}>
              <MoreHorizontal size={16} />其它
            </button>
          </nav>
          <div className="demo-header__actions">
            <span className={`demo-sync-badge ${syncError ? "is-local" : "is-synced"}`}>{syncError ? "同步重试中" : "已同步"}</span>
            <button className="demo-icon-button" type="button" aria-label="切换主题" onClick={() => setTheme(theme === "light" ? "dark" : "light")}>
              {theme === "light" ? <Moon size={17} /> : <Sun size={17} />}
            </button>
            <button className="demo-user" type="button" onClick={() => navigate("me")}>
              <span>{session?.name?.slice(0, 1) ?? "?"}</span>
              <b>{session?.name}</b>
            </button>
          </div>
        </div>
        <div className="demo-sync-line">
          {syncError ? `同步失败，正在重试：${syncError}` : lastSyncAt ? `最近同步：${formatShanghai(lastSyncAt, "HH:mm:ss")}` : "正在同步…"}
        </div>
      </header>

      {otherOpen && (
        <div className="formal-other-layer" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setOtherOpen(false); }}>
          <nav className="formal-other-panel" aria-label="其它功能">
            <header>
              <strong>其它</strong>
              <button className="demo-icon-button" type="button" onClick={() => setOtherOpen(false)} aria-label="关闭">×</button>
            </header>
            {items.map(([id, Icon, label, hint]) => (
              <button type="button" key={id} className={route === id ? "is-active" : ""} onClick={() => go(id)}>
                <Icon size={17} />
                <span><strong>{label}</strong><small>{hint}</small></span>
              </button>
            ))}
            <button type="button" className="formal-other-panel__exit" onClick={async () => { setOtherOpen(false); await logout(); notify("已退出登录"); }}>
              <LogOut size={17} />
              <span><strong>退出登录</strong><small>下次打开需要重新验证</small></span>
            </button>
          </nav>
        </div>
      )}

      <main id="main-content">{children}</main>

      <SiteFooter />

      {reauthNeeded && isAdmin && (
        <AdminPinDialog
          systemOwner={session?.isSystemOwner}
          onClose={clearReauthNeeded}
          onSubmit={async (payload) => {
            await reauthAdmin(payload);
            notify("验证通过，请再点一次刚才的操作");
          }}
        />
      )}

      <nav className="demo-bottom-nav formal-bottom-nav" aria-label="移动端导航">
        {mainNav.slice(0, 3).map(([id, Icon, label]) => (
          <button type="button" key={id} className={route === id ? "is-active" : ""} onClick={() => navigate(id)}><Icon size={19} /><span>{label}</span></button>
        ))}
        <button type="button" className={inOtherGroup ? "is-active" : ""} onClick={() => setOtherOpen(true)}><Grid2x2 size={19} /><span>其它</span></button>
        <button type="button" className={route === "me" ? "is-active" : ""} onClick={() => navigate("me")}><UserRound size={19} /><span>我的</span></button>
      </nav>
    </div>
  );
}