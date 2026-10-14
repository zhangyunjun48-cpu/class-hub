import { useEffect, useState } from "react";
import { siteConfig } from "./config/site.js";
import { DemoScheduleProvider, useDemoSchedule } from "./demo/DemoScheduleContext.jsx";
import { DemoHomePage, DemoJoinPage, DemoManagePage, DemoMePage, DemoSchedulePage, DemoShell } from "./components/demo/DemoPages.jsx";
import { AnnouncementEditor, DemoModal, ScheduleEditor, Toast } from "./components/demo/DemoShared.jsx";
import { FormalProvider, useFormal } from "./formal/FormalContext.jsx";
import { FormalLoginPage, FormalPublicShell } from "./components/formal/FormalAuthPages.jsx";
import { FormalShell } from "./components/formal/FormalShell.jsx";
import { FormalHomePage, FormalMePage, FormalSchedulePage } from "./components/formal/FormalPages.jsx";
import { FormalFeedbackPage, FormalResourcesPage, FormalTutorialPage } from "./components/formal/FormalOtherPages.jsx";
import { FormalManagePage } from "./components/formal/FormalManagePage.jsx";
import { FormalTimetablePage } from "./components/formal/FormalTimetablePage.jsx";
import { AnnouncementEditor as FormalAnnouncementEditor, ConfirmDialog, ScheduleEditor as FormalScheduleEditor, Toaster } from "./components/formal/FormalShared.jsx";

// mock：离线演示（localStorage + BroadcastChannel）；remote：腾讯云 Fastify + PostgreSQL 正式版。
const dataMode = import.meta.env.VITE_DATA_MODE === "mock" ? "mock" : "remote";

function useHashRoute() {
  const getRoute = () => window.location.hash.replace(/^#\/?/, "") || "home";
  const [route, setRoute] = useState(getRoute);
  useEffect(() => {
    const onChange = () => setRoute(getRoute());
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);
  const navigate = (next) => {
    window.location.hash = `/${next}`;
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  return [route, navigate];
}

/* ------------------------------- 离线演示版 ------------------------------- */

function DemoApplication() {
  const { session, snapshot, createSchedule, updateSchedule, softDeleteSchedule, completeSchedule, publishAnnouncement } = useDemoSchedule();
  const [route, navigate] = useHashRoute();
  const [theme, setTheme] = useState(() => window.localStorage.getItem(siteConfig.themeKey) || "light");
  const [editing, setEditing] = useState(null);
  const [showAdd, setShowAdd] = useState(false);
  const [showAnnouncement, setShowAnnouncement] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [toast, setToast] = useState("");

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    window.localStorage.setItem(siteConfig.themeKey, theme);
  }, [theme]);

  useEffect(() => {
    if (!toast) return undefined;
    const timer = window.setTimeout(() => setToast(""), 2200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  if (!session) return <DemoJoinPage />;
  if (!snapshot) return <div className="demo-loading">正在读取本地演示数据…</div>;

  const onToggle = async (id, completed) => {
    await completeSchedule(id, completed);
    setToast(completed ? "已标记完成" : "已取消完成");
  };
  const onEdit = (schedule) => setEditing(schedule);
  const onDelete = (schedule) => setDeleteTarget(schedule);
  const saveEdit = async (draft, version) => {
    await updateSchedule(editing.id, draft, version);
    setToast("日程修改已同步到其他演示标签");
  };
  const createNew = async (draft) => {
    await createSchedule(draft);
    setToast("日程已添加，另一个浏览器标签会立即更新");
  };
  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      await softDeleteSchedule(deleteTarget.id, deleteTarget.version);
      setToast("已移入管理演示的回收站");
    } finally {
      setDeleteTarget(null);
    }
  };
  const publish = async (input) => {
    await publishAnnouncement(input);
    setToast("公告已加入首页信息流");
  };

  let page;
  if (route === "schedule") page = <DemoSchedulePage onAdd={() => setShowAdd(true)} onEdit={onEdit} onDelete={onDelete} onToggle={onToggle} />;
  else if (route === "me") page = <DemoMePage onToggle={onToggle} onEdit={onEdit} />;
  else if (route === "manage") page = <DemoManagePage onAnnouncement={() => setShowAnnouncement(true)} />;
  else page = <DemoHomePage onAdd={() => setShowAdd(true)} onEdit={onEdit} onDelete={onDelete} onToggle={onToggle} navigate={navigate} onAnnouncement={() => setShowAnnouncement(true)} />;

  return (
    <>
      <DemoShell route={route} navigate={navigate} theme={theme} setTheme={setTheme}>{page}</DemoShell>
      {showAdd && <ScheduleEditor onClose={() => setShowAdd(false)} onSubmit={createNew} />}
      {editing && <ScheduleEditor schedule={editing} onClose={() => setEditing(null)} onSubmit={saveEdit} />}
      {showAnnouncement && <AnnouncementEditor onClose={() => setShowAnnouncement(false)} onSubmit={publish} />}
      {deleteTarget && (
        <DemoModal title="删除日程" onClose={() => setDeleteTarget(null)}>
          <div className="demo-confirm"><p>确定删除「{deleteTarget.title}」吗？删除后会进入管理演示的回收站。</p><footer><button className="demo-button demo-button--ghost" type="button" onClick={() => setDeleteTarget(null)}>取消</button><button className="demo-button demo-button--danger" type="button" onClick={confirmDelete}>确认删除</button></footer></div>
        </DemoModal>
      )}
      <Toast message={toast} />
    </>
  );
}

/* ------------------------------ 正式版（云端） ----------------------------- */

const PUBLIC_ROUTES = new Set(["resources", "tutorial"]);

function FormalApplication() {
  const formal = useFormal();
  const { status, session, isAdmin, createSchedule, updateSchedule, softDeleteSchedule, completeSchedule, publishAnnouncement, notify, toast } = formal;
  const [route, navigate] = useHashRoute();
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState(null);
  const [showAnnouncement, setShowAnnouncement] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);

  useEffect(() => {
    document.documentElement.dataset.theme = window.localStorage.getItem(siteConfig.themeKey) || "light";
  }, []);

  if (status === "booting") return <div className="demo-loading">正在恢复登录状态…</div>;

  if (!session) {
    const guestPage = route === "resources" ? <FormalResourcesPage /> : route === "tutorial" ? <FormalTutorialPage /> : null;
    if (guestPage) return <FormalPublicShell route={route} navigate={navigate}>{guestPage}</FormalPublicShell>;
    return <FormalLoginPage navigate={navigate} />;
  }

  const onToggle = async (id, completed) => {
    try {
      await completeSchedule(id, completed);
      notify(completed ? "已标记完成" : "已取消完成");
    } catch (error) {
      notify(error?.message ?? "操作失败");
    }
  };
  const confirmDelete = async () => {
    await softDeleteSchedule(deleteTarget.id, deleteTarget.version);
    notify("日程已移入回收站");
  };
  const publish = async (input) => {
    await publishAnnouncement(input);
    notify("公告已发布");
  };

  let page;
  if (route === "timetable") page = <FormalTimetablePage />;
  else if (route === "schedule") page = <FormalSchedulePage onAdd={() => setShowAdd(true)} onEdit={setEditing} onDelete={setDeleteTarget} onToggle={onToggle} />;
  else if (route === "me") page = <FormalMePage onEdit={setEditing} onDelete={setDeleteTarget} onToggle={onToggle} />;
  else if (route === "resources") page = <FormalResourcesPage />;
  else if (route === "tutorial") page = <FormalTutorialPage />;
  else if (route === "feedback") page = <FormalFeedbackPage />;
  else if (route === "manage") page = <FormalManagePage onAnnouncement={() => setShowAnnouncement(true)} />;
  else page = <FormalHomePage onAdd={() => setShowAdd(true)} onEdit={setEditing} onDelete={setDeleteTarget} onToggle={onToggle} navigate={navigate} />;

  return (
    <>
      <FormalShell route={route} navigate={navigate}>{page}</FormalShell>
      {showAdd && (
        <FormalScheduleEditor
          canSetImportant={isAdmin}
          onClose={() => setShowAdd(false)}
          onSubmit={async (draft) => { await createSchedule(draft); notify("日程已添加"); }}
        />
      )}
      {editing && (
        <FormalScheduleEditor
          schedule={editing}
          canSetImportant={isAdmin}
          onClose={() => setEditing(null)}
          onSubmit={async (draft, version) => { await updateSchedule(editing.id, draft, version); notify("日程已更新"); }}
        />
      )}
      {showAnnouncement && <FormalAnnouncementEditor onClose={() => setShowAnnouncement(false)} onSubmit={publish} />}
      {deleteTarget && (
        <ConfirmDialog
          title="删除日程"
          message={`确定删除「${deleteTarget.title}」吗？删除后进入回收站，管理员可以恢复。`}
          confirmLabel="确认删除"
          danger
          onClose={() => setDeleteTarget(null)}
          onConfirm={confirmDelete}
        />
      )}
      <Toaster message={toast} />
    </>
  );
}

export default function App() {
  if (dataMode === "mock") return <DemoScheduleProvider><DemoApplication /></DemoScheduleProvider>;
  return <FormalProvider><FormalApplication /></FormalProvider>;
}