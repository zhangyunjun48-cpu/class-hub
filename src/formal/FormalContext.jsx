import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { ApiClientError, apiRequest } from "../lib/apiClient.ts";
import { normalizeAnnouncement, normalizeFeedback, normalizeResource, normalizeRevision, normalizeSchedule } from "./normalize.js";
import { httpScheduleRepository } from "./repository.js";

const FormalContext = createContext(null);

const POLL_MS = 15000;
const EMPTY_SNAPSHOT = { schedules: [], announcements: [], revisions: [], completedScheduleIds: [], stats: {}, serverTime: null, timetable: null };

function mergeSchedules(existing, incoming) {
  const map = new Map(existing.map((item) => [item.id, item]));
  incoming.forEach((item) => map.set(item.id, item));
  return [...map.values()];
}

export function FormalProvider({ children }) {
  const [status, setStatus] = useState("booting");
  const [session, setSession] = useState(null);
  const [challenge, setChallenge] = useState(null);
  const [snapshot, setSnapshot] = useState(EMPTY_SNAPSHOT);
  const [lastSyncAt, setLastSyncAt] = useState(null);
  const [syncError, setSyncError] = useState("");
  const [resources, setResources] = useState([]);
  const [tutorial, setTutorial] = useState([]);
  const [toast, setToast] = useState("");
  const [reauthNeeded, setReauthNeeded] = useState(false);
  const sinceRef = useRef(null);

  // 系统兜底管理员永远不需要 PIN；其他管理员看"最近验证是否还在有效期内"
  const computeAdminVerified = useCallback((me) => {
    if (!me) return false;
    if (me.isSystemOwner) return true;
    return Boolean(me.adminReauthUntil && new Date(me.adminReauthUntil).getTime() > Date.now());
  }, []);

  const clearReauthNeeded = useCallback(() => setReauthNeeded(false), []);

  // 所有请求都走这里：服务端一旦回 ADMIN_REAUTH_REQUIRED，就自动弹出 PIN 验证框，
  // 避免"点了没反应 / 一直提示需要管理员 PIN"这种死循环。
  const call = useCallback(async (path, options) => {
    try {
      return await apiRequest(path, options);
    } catch (error) {
      if (error instanceof ApiClientError && error.code === "ADMIN_REAUTH_REQUIRED") setReauthNeeded(true);
      throw error;
    }
  }, []);

  const notify = useCallback((message) => {
    setToast(message);
    window.setTimeout(() => setToast((current) => (current === message ? "" : current)), 2400);
  }, []);

  const applySync = useCallback(async ({ full = false } = {}) => {
    const since = full ? null : sinceRef.current;
    const payload = await httpScheduleRepository.sync(since);
    sinceRef.current = payload.serverTime;
    setSnapshot((current) => ({
      schedules: since
        ? mergeSchedules(current.schedules, (payload.schedules ?? []).map(normalizeSchedule))
        : (payload.schedules ?? []).map(normalizeSchedule),
      announcements: (payload.announcements ?? []).map(normalizeAnnouncement),
      revisions: (payload.revisions ?? []).map(normalizeRevision),
      completedScheduleIds: payload.completedScheduleIds ?? [],
      stats: payload.stats ?? {},
      serverTime: payload.serverTime,
      timetable: payload.timetable ?? null,
    }));
    // 用同步返回的 me 刷新会话（尤其是 adminReauthUntil），这样 15 分钟后
    // 界面会自己发现"验证已过期"，而不是等点了按钮才报错。
    if (payload.me) {
      setSession((current) => {
        if (!current) return current;
        const adminVerified = computeAdminVerified(payload.me);
        const nextReauthUntil = payload.me.adminReauthUntil ?? null;
        if (current.adminVerified === adminVerified && (current.adminReauthUntil ?? null) === nextReauthUntil) return current;
        return { ...current, ...payload.me, adminVerified };
      });
    }
    setLastSyncAt(payload.serverTime ?? new Date().toISOString());
    setSyncError("");
    return payload;
  }, []);

  const handleAuthLoss = useCallback(() => {
    sinceRef.current = null;
    setSession(null);
    setChallenge(null);
    setSnapshot(EMPTY_SNAPSHOT);
    setStatus("anonymous");
  }, []);

  const loadPublicResources = useCallback(async () => {
    const payload = await call("/public/resources");
    setResources((payload.resources ?? []).map(normalizeResource));
  }, []);

  const loadTutorial = useCallback(async () => {
    const payload = await call("/public/tutorial");
    setTutorial(payload.steps ?? []);
  }, []);

  const loadSession = useCallback(async () => {
    try {
      const me = await call("/me");
      setSession(me);
      setStatus("ready");
      return me;
    } catch (error) {
      if (error instanceof ApiClientError && error.status === 401) {
        setSession(null);
        setStatus("anonymous");
      } else {
        setSession(null);
        setStatus("offline");
      }
      return null;
    }
  }, []);

  // 启动：公共资料与教程始终可读，随后恢复会话。
  useEffect(() => {
    void loadPublicResources().catch(() => undefined);
    void loadTutorial().catch(() => undefined);
    void loadSession();
  }, [loadPublicResources, loadTutorial, loadSession]);

  // 登录后全量同步 + 15 秒轮询；页面隐藏时暂停，失败指数退避并保留旧数据。
  useEffect(() => {
    if (!session) return undefined;
    let stopped = false;
    let timer = null;
    let backoff = 0;
    sinceRef.current = null;

    const tick = async () => {
      if (stopped) return;
      if (document.visibilityState === "hidden") {
        timer = window.setTimeout(tick, 5000);
        return;
      }
      try {
        await applySync({});
        backoff = 0;
        timer = window.setTimeout(tick, POLL_MS);
      } catch (error) {
        if (error instanceof ApiClientError && error.status === 401) {
          handleAuthLoss();
          return;
        }
        backoff = Math.min(backoff + 1, 4);
        setSyncError(error?.message ?? "同步失败，正在重试");
        timer = window.setTimeout(tick, POLL_MS * 2 ** backoff);
      }
    };

    void tick();
    return () => {
      stopped = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [session, applySync, handleAuthLoss]);

  const login = useCallback(async ({ studentId, name }) => {
    const result = await call("/auth/login", { method: "POST", body: { studentId, name } });
    setChallenge({ token: result.challengeToken, displayName: result.displayName, systemOwner: result.systemOwner });
    return result;
  }, []);

  const activate = useCallback(async (activationCode) => {
    if (!challenge) throw new Error("请先输入学号和姓名");
    await call("/auth/activate", { method: "POST", body: { challengeToken: challenge.token, activationCode } });
    const me = await call("/me");
    setChallenge(null);
    setSession(me);
    setStatus("ready");
    return me;
  }, [challenge]);

  const logout = useCallback(async () => {
    try {
      await call("/auth/logout", { method: "POST", body: {} });
    } catch {
      // 退出失败也要清空本地状态
    }
    sinceRef.current = null;
    setSession(null);
    setChallenge(null);
    setSnapshot(EMPTY_SNAPSHOT);
    setStatus("anonymous");
  }, []);

  const markOnboardingSeen = useCallback(async () => {
    await call("/me/onboarding-seen", { method: "POST", body: {} });
  }, []);

  const mutate = useCallback(async (run) => {
    const result = await run();
    try {
      await applySync({});
    } catch {
      // 同步失败不回滚已成功的写操作，下一次轮询会补上
    }
    return result;
  }, [applySync]);

  const reauthAdmin = useCallback(async (payload) => {
    const result = await call("/auth/admin-reauth", { method: "POST", body: payload });
    const me = await call("/me");
    setSession(me);
    return result;
  }, []);

  const value = useMemo(() => ({
    status,
    session,
    challenge,
    snapshot,
    lastSyncAt,
    syncError,
    resources,
    tutorial,
    toast,
    notify,
    timetable: snapshot.timetable ?? null,
    isAdmin: session?.role === "owner" || session?.role === "admin",
    adminVerified: computeAdminVerified(session),
    reauthNeeded,
    clearReauthNeeded,
    login,
    activate,
    resetChallenge: () => setChallenge(null),
    logout,
    markOnboardingSeen,
    reauthAdmin,
    refresh: () => applySync({ full: true }),
    syncNow: () => applySync({}),
    loadPublicResources,
    loadTutorial,
    createSchedule: (draft) => mutate(() => httpScheduleRepository.create(draft)),
    updateSchedule: (id, draft, version) => mutate(() => httpScheduleRepository.update(id, draft, version)),
    softDeleteSchedule: (id, version) => mutate(() => httpScheduleRepository.softDelete(id, version)),
    restoreSchedule: (id) => mutate(() => httpScheduleRepository.restore(id)),
    completeSchedule: (id, completed) => mutate(() => httpScheduleRepository.complete(id, completed)),
    publishAnnouncement: async (input) => {
      const created = await call("/announcements", { method: "POST", body: input });
      await applySync({});
      return created;
    },
    deleteAnnouncement: async (id) => {
      await call(`/announcements/${id}`, { method: "DELETE" });
      await applySync({});
    },
    loadTrash: () => call("/schedules/trash").then((payload) => payload.schedules.map(normalizeSchedule)),
    loadTimetable: (from, to) => call(`/timetable?from=${from}&to=${to}`),
    previewTimetable: (input) => call("/admin/timetable/preview", { method: "POST", body: input }),
    loadTimetableAdmin: () => call("/admin/timetable/templates"),
    commitTimetable: async (input) => {
      const result = await call("/admin/timetable/commit", { method: "POST", body: input });
      await applySync({ full: true });
      return result;
    },
    updateSemester: async (patch) => {
      await call("/admin/timetable/semester", { method: "PATCH", body: patch });
      await applySync({ full: true });
    },
    createTimetableException: async (input) => {
      const result = await call("/admin/timetable/exceptions", { method: "POST", body: input });
      await applySync({ full: true });
      return result;
    },
    deleteTimetableException: async (id) => {
      await call(`/admin/timetable/exceptions/${id}`, { method: "DELETE" });
      await applySync({ full: true });
    },
    loadAudit: () => call("/audit").then((payload) => payload.revisions.map(normalizeRevision)),
    revertRevision: async (id) => {
      await call(`/audit/${id}/revert`, { method: "POST", body: {} });
      await applySync({ full: true });
    },
    loadMembers: () => call("/admin/members").then((payload) => payload.members),
    updateMember: async (id, patch) => {
      await call(`/admin/members/${id}`, { method: "PATCH", body: patch });
      notify("成员信息已更新");
    },
    previewRoster: (csv) => call("/admin/roster/preview", { method: "POST", body: { csv } }),
    commitRoster: (rows) => call("/admin/roster/commit", { method: "POST", body: { rows } }),
    reloadResources: loadPublicResources,
    createResource: async (input) => {
      await call("/resources", { method: "POST", body: input });
      await loadPublicResources();
    },
    updateResource: async (id, input) => {
      await call(`/resources/${id}`, { method: "PATCH", body: input });
      await loadPublicResources();
    },
    deleteResource: async (id) => {
      await call(`/resources/${id}`, { method: "DELETE" });
      await loadPublicResources();
    },
    submitFeedback: async (input) => call("/feedback", { method: "POST", body: input }),
    loadMyFeedback: () => call("/feedback/mine").then((payload) => payload.feedback.map(normalizeFeedback)),
    loadAllFeedback: () => call("/feedback").then((payload) => payload.feedback.map(normalizeFeedback)),
    resolveFeedback: async (id, input) => {
      await call(`/feedback/${id}`, { method: "PATCH", body: input });
      return call("/feedback").then((payload) => payload.feedback.map(normalizeFeedback));
    },
  }), [
    status, session, challenge, snapshot, lastSyncAt, syncError, resources, tutorial, toast, notify,
    login, activate, logout, markOnboardingSeen, reauthAdmin, applySync, mutate,
    loadPublicResources, loadTutorial, call, computeAdminVerified, reauthNeeded, clearReauthNeeded,
  ]);

  return <FormalContext.Provider value={value}>{children}</FormalContext.Provider>;
}

export function useFormal() {
  const context = useContext(FormalContext);
  if (!context) throw new Error("useFormal must be used inside FormalProvider");
  return context;
}