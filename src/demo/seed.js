import { addShanghaiDaysToIso } from "./time.js";

const nowIso = () => new Date().toISOString();

export function createDemoStore() {
  const now = new Date();
  const createdAt = nowIso();

  const schedules = [
    {
      id: "course-chip-lab",
      title: "芯片设计与仿真实验",
      category: "course",
      startAt: addShanghaiDaysToIso(0, 8, 0, now),
      dueAt: addShanghaiDaysToIso(0, 9, 40, now),
      endAt: addShanghaiDaysToIso(0, 9, 40, now),
      location: "软件园校区 · 实验楼 A304",
      note: "携带电脑，提前安装 EDA 环境。",
      important: true,
      createdBy: "演示班委",
      updatedBy: "演示班委",
      version: 1,
      deletedAt: null,
      createdAt,
      updatedAt: createdAt
    },
    {
      id: "task-data-structure",
      title: "数据结构第三次作业",
      category: "task",
      startAt: null,
      dueAt: addShanghaiDaysToIso(0, 20, 0, now),
      endAt: null,
      location: "线上提交",
      note: "提交 PDF 与源文件，文件名：学号-姓名。",
      important: true,
      createdBy: "演示班委",
      updatedBy: "演示班委",
      version: 1,
      deletedAt: null,
      createdAt,
      updatedAt: createdAt
    },
    {
      id: "activity-badminton",
      title: "班级羽毛球友谊赛",
      category: "activity",
      startAt: addShanghaiDaysToIso(1, 15, 0, now),
      dueAt: null,
      endAt: addShanghaiDaysToIso(1, 17, 0, now),
      location: "体育馆",
      note: "自愿报名，欢迎观赛。",
      important: false,
      createdBy: "文体委员",
      updatedBy: "文体委员",
      version: 1,
      deletedAt: null,
      createdAt,
      updatedAt: createdAt
    },
    {
      id: "exam-math",
      title: "高等数学阶段测验",
      category: "exam",
      startAt: addShanghaiDaysToIso(3, 14, 0, now),
      dueAt: addShanghaiDaysToIso(3, 15, 40, now),
      endAt: addShanghaiDaysToIso(3, 15, 40, now),
      location: "教学楼 3 区 108",
      note: "范围：第一至三章。",
      important: true,
      createdBy: "学习委员",
      updatedBy: "学习委员",
      version: 1,
      deletedAt: null,
      createdAt,
      updatedAt: createdAt
    },
    {
      id: "task-safety-overdue",
      title: "实验室安全准入考试",
      category: "task",
      startAt: null,
      dueAt: addShanghaiDaysToIso(-1, 19, 0, now),
      endAt: null,
      location: "线上",
      note: "未通过将无法进入后续实验课程。",
      important: true,
      createdBy: "演示班委",
      updatedBy: "演示班委",
      version: 1,
      deletedAt: null,
      createdAt,
      updatedAt: createdAt
    },
    {
      id: "class-onboarding-done",
      title: "新生入学材料复核",
      category: "class",
      startAt: addShanghaiDaysToIso(-4, 17, 0, now),
      dueAt: addShanghaiDaysToIso(-4, 17, 0, now),
      endAt: addShanghaiDaysToIso(-4, 17, 30, now),
      location: "线上",
      note: "已完成核验。",
      important: false,
      createdBy: "班长",
      updatedBy: "班长",
      version: 1,
      deletedAt: null,
      createdAt,
      updatedAt: createdAt
    }
  ];

  return {
    schemaVersion: 2,
    storeVersion: 1,
    schedules,
    announcements: [
      {
        id: "notice-demo-1",
        title: "本周三晚班会改为线上",
        body: "受场地安排影响，本周三 18:30 班会改为腾讯会议，链接将在开始前半小时发布。",
        pinned: true,
        createdBy: "演示班委",
        createdAt,
        updatedAt: createdAt,
        deletedAt: null
      },
      {
        id: "notice-demo-2",
        title: "课程资料统一只存链接",
        body: "涉及教师版权的课件和往年题不直接上传，只在信息流中记录获取方式。",
        pinned: false,
        createdBy: "学习委员",
        createdAt,
        updatedAt: createdAt,
        deletedAt: null
      }
    ],
    completions: {
      "class-onboarding-done": ["member-demo"]
    },
    members: [
      { id: "member-demo", nickname: "演示同学", role: "member", joinedAt: createdAt },
      { id: "admin-demo", nickname: "演示班委", role: "admin", joinedAt: createdAt }
    ],
    revisions: [
      {
        id: "revision-seed-1",
        action: "create",
        entityId: "task-data-structure",
        summary: "新增「数据结构第三次作业」",
        actor: "演示班委",
        createdAt
      },
      {
        id: "revision-seed-2",
        action: "create",
        entityId: "activity-badminton",
        summary: "新增「班级羽毛球友谊赛」",
        actor: "文体委员",
        createdAt
      }
    ],
    updatedAt: createdAt
  };
}
