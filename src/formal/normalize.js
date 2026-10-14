/** 服务端返回的公告、变更、资料使用数据库列名，这里统一转成前端驼峰结构。 */
export function normalizeAnnouncement(row) {
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    pinned: row.pinned,
    createdBy: row.created_by ?? row.createdBy ?? "",
    createdAt: row.created_at ?? row.createdAt ?? "",
    updatedAt: row.updated_at ?? row.updatedAt ?? "",
    deletedAt: row.deleted_at ?? row.deletedAt ?? null,
  };
}

export function normalizeRevision(row) {
  return {
    id: row.id,
    action: row.action,
    entityType: row.entity_type ?? row.entityType ?? "",
    entityId: row.entity_id ?? row.entityId ?? "",
    summary: row.summary,
    actorId: row.actor_id ?? row.actorId ?? "",
    actor: row.actor_nickname ?? row.actor ?? "",
    before: row.before_json ?? row.before ?? null,
    after: row.after_json ?? row.after ?? null,
    createdAt: row.created_at ?? row.createdAt ?? "",
  };
}

export function normalizeResource(row) {
  return {
    id: row.id,
    title: row.title,
    description: row.description ?? "",
    category: row.category ?? "其他",
    url: row.url,
    ownerName: row.owner_name ?? row.ownerName ?? "",
    official: Boolean(row.official),
    updatedAt: row.updated_at ?? row.updatedAt ?? "",
  };
}

export function normalizeSchedule(row) {
  return {
    id: row.id,
    title: row.title,
    category: row.category,
    importance: row.importance ?? (row.important ? "important" : "normal"),
    startAt: row.startAt ?? row.start_at ?? null,
    dueAt: row.dueAt ?? row.due_at ?? null,
    endAt: row.endAt ?? row.end_at ?? null,
    location: row.location ?? "",
    note: row.note ?? "",
    relatedLink: row.relatedLink ?? row.related_link ?? "",
    createdBy: row.createdBy ?? row.created_by ?? "",
    updatedBy: row.updatedBy ?? row.updated_by ?? "",
    version: row.version ?? 1,
    deletedAt: row.deletedAt ?? row.deleted_at ?? null,
    createdAt: row.createdAt ?? row.created_at ?? "",
    updatedAt: row.updatedAt ?? row.updated_at ?? "",
  };
}

export function normalizeFeedback(row) {
  return {
    id: row.id,
    category: row.category ?? "其他",
    content: row.content,
    status: row.status ?? "pending",
    adminReply: row.admin_reply ?? row.adminReply ?? "",
    memberName: row.member_name ?? row.memberName ?? "",
    studentIdLast4: row.student_id_last4 ?? row.studentIdLast4 ?? "",
    createdAt: row.created_at ?? row.createdAt ?? "",
    updatedAt: row.updated_at ?? row.updatedAt ?? "",
  };
}