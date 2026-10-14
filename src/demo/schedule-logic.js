import { dateKeyShanghai } from "./time.js";

export const categories = [
  { id: "course", label: "课程", tone: "red" },
  { id: "task", label: "作业", tone: "gold" },
  { id: "exam", label: "考试", tone: "ink" },
  { id: "activity", label: "活动", tone: "green" },
  { id: "meeting", label: "会议", tone: "blue" },
  { id: "class", label: "班级事务", tone: "coral" }
];

export function categoryLabel(id) {
  return categories.find((item) => item.id === id)?.label ?? "其他";
}

export function effectiveAt(schedule) {
  return schedule.dueAt ?? schedule.startAt ?? schedule.endAt;
}

export function timelineAt(schedule) {
  return schedule.startAt ?? schedule.dueAt ?? schedule.endAt;
}

export function compareSchedules(left, right) {
  const leftTime = effectiveAt(left);
  const rightTime = effectiveAt(right);
  const leftValue = leftTime ? new Date(leftTime).getTime() : Number.MAX_SAFE_INTEGER;
  const rightValue = rightTime ? new Date(rightTime).getTime() : Number.MAX_SAFE_INTEGER;
  return leftValue - rightValue;
}

export function isOverdue(schedule, now = new Date()) {
  return Boolean(schedule.dueAt) && new Date(schedule.dueAt).getTime() < now.getTime() && !schedule.deletedAt;
}

export function isDueSoon(schedule, now = new Date(), days = 7) {
  if (!schedule.dueAt || schedule.deletedAt) return false;
  const difference = new Date(schedule.dueAt).getTime() - now.getTime();
  return difference >= 0 && difference <= days * 86400000;
}

export function isToday(schedule, now = new Date()) {
  const value = timelineAt(schedule);
  return Boolean(value) && dateKeyShanghai(value) === dateKeyShanghai(now.toISOString());
}

export function validateScheduleDraft(draft) {
  const errors = {};
  const title = draft.title?.trim() ?? "";
  if (!title) errors.title = "请填写日程标题";
  if (title.length > 80) errors.title = "标题不能超过80个字";

  if (!draft.startAt && !draft.dueAt) {
    errors.startAt = "开始时间和截止时间至少填写一个";
  }

  if (draft.endAt && !draft.startAt) {
    errors.endAt = "填写结束时间前需要先填写开始时间";
  }

  if (draft.startAt && draft.endAt && new Date(draft.endAt) < new Date(draft.startAt)) {
    errors.endAt = "结束时间不能早于开始时间";
  }

  if (draft.startAt && draft.dueAt && new Date(draft.dueAt) < new Date(draft.startAt)) {
    errors.dueAt = "截止时间不能早于开始时间";
  }

  return errors;
}

export function searchSchedules(schedules, keyword) {
  const query = keyword.trim().toLowerCase();
  if (!query) return schedules;
  return schedules.filter((schedule) =>
    [schedule.title, schedule.location, schedule.note]
      .join(" ")
      .toLowerCase()
      .includes(query)
  );
}

export function countCompleted(scheduleId, memberId, completions) {
  return (completions[scheduleId] ?? []).includes(memberId);
}
