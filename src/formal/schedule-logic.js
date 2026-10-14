import { compareSchedules, effectiveAt, isDueSoon, isOverdue, isToday, timelineAt } from "../demo/schedule-logic.js";

export { compareSchedules, effectiveAt, isDueSoon, isOverdue, isToday, timelineAt };

export const importanceLabel = (importance) => (importance === "important" ? "重要" : "普通");

export function isImportant(schedule) {
  return schedule?.importance === "important";
}

export function validateScheduleDraft(draft) {
  const errors = {};
  const title = draft.title?.trim() ?? "";
  if (!title) errors.title = "请填写日程标题";
  if (title.length > 80) errors.title = "标题不能超过 80 个字";

  if (!draft.startAt && !draft.dueAt) errors.startAt = "开始时间和截止时间至少填写一个";
  if (draft.endAt && !draft.startAt) errors.endAt = "填写结束时间前需要先填写开始时间";
  if (draft.startAt && draft.endAt && new Date(draft.endAt) < new Date(draft.startAt)) errors.endAt = "结束时间不能早于开始时间";
  if (draft.startAt && draft.dueAt && new Date(draft.dueAt) < new Date(draft.startAt)) errors.dueAt = "截止时间不能早于开始时间";

  const link = draft.relatedLink?.trim() ?? "";
  if (link) {
    try {
      const parsed = new URL(link);
      if (!["http:", "https:"].includes(parsed.protocol)) errors.relatedLink = "相关链接需要是 http(s) 地址";
    } catch {
      errors.relatedLink = "相关链接格式不正确";
    }
  }
  return errors;
}

export function searchSchedules(schedules, keyword) {
  const query = keyword.trim().toLowerCase();
  if (!query) return schedules;
  return schedules.filter((schedule) =>
    [schedule.title, schedule.location, schedule.note, schedule.relatedLink]
      .join(" ")
      .toLowerCase()
      .includes(query),
  );
}

export function countCompleted(completedIds, scheduleId) {
  return (completedIds ?? []).includes(scheduleId);
}