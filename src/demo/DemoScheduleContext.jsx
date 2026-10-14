import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import {
  DEMO_ADMIN_CODE,
  DEMO_INVITE_CODE,
  DEMO_SESSION_KEY,
  RepositoryError,
  mockScheduleRepository
} from "./MockScheduleRepository.js";

const DemoScheduleContext = createContext(null);
const OLD_BUSINESS_KEYS = [
  "classhub-demo-user",
  "classhub-schedules",
  "classhub-notices",
  "classhub-completed"
];

function readSession() {
  try {
    const value = window.sessionStorage.getItem(DEMO_SESSION_KEY);
    return value ? JSON.parse(value) : null;
  } catch {
    return null;
  }
}

export function DemoScheduleProvider({ children }) {
  const [session, setSession] = useState(readSession);
  const [snapshot, setSnapshot] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [channelAvailable] = useState(() => typeof BroadcastChannel !== "undefined");

  useEffect(() => {
    OLD_BUSINESS_KEYS.forEach((key) => window.localStorage.removeItem(key));
    return mockScheduleRepository.subscribe((nextSnapshot) => {
      setSnapshot(nextSnapshot);
      setLastUpdated(new Date().toISOString());
    });
  }, []);

  const refresh = useCallback(async () => {
    const next = await mockScheduleRepository.getSnapshot();
    setSnapshot(next);
    setLastUpdated(new Date().toISOString());
    return next;
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const join = useCallback(({ nickname, inviteCode, adminCode, adminMode }) => {
    const normalizedNickname = nickname.trim();
    if (normalizedNickname.length < 2 || normalizedNickname.length > 16) {
      throw new RepositoryError("VALIDATION_ERROR", "昵称需要 2–16 个字符");
    }
    if (inviteCode.trim() !== DEMO_INVITE_CODE) {
      throw new RepositoryError("FORBIDDEN", "邀请码不正确");
    }
    if (adminMode && adminCode.trim() !== DEMO_ADMIN_CODE) {
      throw new RepositoryError("FORBIDDEN", "班委演示码不正确");
    }
    const nextSession = {
      memberId: globalThis.crypto?.randomUUID?.() ?? `member-${Date.now()}`,
      nickname: normalizedNickname,
      role: adminMode ? "admin" : "member"
    };
    window.sessionStorage.setItem(DEMO_SESSION_KEY, JSON.stringify(nextSession));
    setSession(nextSession);
    return nextSession;
  }, []);

  const logout = useCallback(() => {
    window.sessionStorage.removeItem(DEMO_SESSION_KEY);
    setSession(null);
  }, []);

  const value = useMemo(() => ({
    session,
    snapshot,
    lastUpdated,
    channelAvailable,
    inviteCode: DEMO_INVITE_CODE,
    refresh,
    join,
    logout,
    createSchedule: (draft) => mockScheduleRepository.create(draft, session),
    updateSchedule: (id, draft, version) => mockScheduleRepository.update(id, draft, version, session),
    softDeleteSchedule: (id, version) => mockScheduleRepository.softDelete(id, version, session),
    restoreSchedule: (id) => mockScheduleRepository.restore(id, session),
    completeSchedule: (id, completed) => mockScheduleRepository.complete(id, session, completed),
    publishAnnouncement: (input) => mockScheduleRepository.publishAnnouncement(input, session),
    resetDemo: async () => {
      const next = await mockScheduleRepository.resetDemo();
      setSnapshot(next);
      setLastUpdated(new Date().toISOString());
    }
  }), [session, snapshot, lastUpdated, channelAvailable, refresh, join, logout]);

  return <DemoScheduleContext.Provider value={value}>{children}</DemoScheduleContext.Provider>;
}

export function useDemoSchedule() {
  const context = useContext(DemoScheduleContext);
  if (!context) throw new Error("useDemoSchedule must be used inside DemoScheduleProvider");
  return context;
}

export { RepositoryError };
