import { apiRequest } from "../lib/apiClient.ts";

export class RepositoryError extends Error {
  constructor(code, message, current = null) {
    super(message);
    this.name = "RepositoryError";
    this.code = code;
    this.current = current;
  }
}

const toRepositoryError = (error) => {
  if (error instanceof RepositoryError) return error;
  if (error && typeof error === "object" && "code" in error) {
    return new RepositoryError(String(error.code), error.message ?? "操作失败", error.details ?? null);
  }
  return new RepositoryError("REQUEST_FAILED", error?.message ?? "操作失败");
};

const guard = async (run) => {
  try {
    return await run();
  } catch (error) {
    throw toRepositoryError(error);
  }
};

/**
 * 正式版数据仓库：全部通过同源 /api 访问 Fastify + PostgreSQL。
 * 与 MockScheduleRepository 保持相同方法签名，便于替换。
 */
export const httpScheduleRepository = {
  sync: (since) => guard(() => apiRequest(since ? `/sync?since=${encodeURIComponent(since)}` : "/sync")),

  create: (draft) => guard(() => apiRequest("/schedules", { method: "POST", body: normalizeDraft(draft) })),

  update: (id, draft, version) => guard(() => apiRequest(`/schedules/${id}`, { method: "PATCH", body: { ...normalizeDraft(draft), version } })),

  softDelete: (id, version) => guard(() => apiRequest(`/schedules/${id}`, { method: "DELETE", body: { version } })),

  restore: (id) => guard(() => apiRequest(`/schedules/${id}/restore`, { method: "POST", body: {} })),

  complete: (id, completed) => guard(() => apiRequest(`/schedules/${id}/completion`, { method: "PUT", body: { completed } })),

  trash: () => guard(() => apiRequest("/schedules/trash")),
};

function normalizeDraft(draft) {
  return {
    title: draft.title,
    category: draft.category,
    importance: draft.importance ?? (draft.important ? "important" : "normal"),
    startAt: draft.startAt ?? null,
    dueAt: draft.dueAt ?? null,
    endAt: draft.endAt ?? null,
    location: draft.location ?? "",
    note: draft.note ?? "",
    relatedLink: draft.relatedLink ?? "",
  };
}