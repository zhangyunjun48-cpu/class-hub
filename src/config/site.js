// 站点身份与备案信息的唯一来源。
// 所有值都可通过环境变量覆盖（见 .env.example）；留空时使用中性默认值，
// 因此这个仓库可以直接被别人拿去给自己的班级用。

const read = (value) => (typeof value === "string" ? value.trim() : "");
const pick = (value, fallback) => read(value) || fallback;
const readList = (value, fallback) =>
  pick(value, fallback)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

const schoolName = read(import.meta.env.VITE_SCHOOL_NAME);
const className = read(import.meta.env.VITE_CLASS_NAME);

export const siteConfig = {
  /** 站点名：浏览器标题、页头、首页大标题 */
  siteName: pick(import.meta.env.VITE_SITE_NAME, "班级共享站"),
  /** 页头圆形徽标里的字（1-2 个字） */
  brandMark: pick(import.meta.env.VITE_BRAND_MARK, "班"),
  schoolName,
  className,
  /** 页头副标题：学校 + 班级 */
  subtitle: [schoolName, className].filter(Boolean).join(" ") || "班级自建工具",
  /** 登录页大字标题下的一行小字 */
  latinEyebrow: pick(import.meta.env.VITE_LATIN_EYEBROW, "CLASS SHARED HUB"),
  /** 登录页与首页的一句话说明 */
  tagline: pick(import.meta.env.VITE_SITE_TAGLINE, "全班共享同一份日程，改动自动同步"),

  /** 主题偏好的存储键 */
  themeKey: pick(import.meta.env.VITE_THEME_STORAGE_KEY, "classhub-theme"),
  /** 一次性 Service Worker 自愈标记 */
  swResetKey: "classhub-sw-reset",
  /** 需要清理的历史缓存前缀（本项目的 + 你从旧版本迁移时留下的） */
  cachePrefixes: readList(import.meta.env.VITE_LEGACY_CACHE_PREFIXES, "classhub"),

  /** 备案信息：留空则页脚不显示对应条目 */
  icp: read(import.meta.env.VITE_ICP_LICENSE),
  police: read(import.meta.env.VITE_PUBLIC_SECURITY_LICENSE),
  policeCode: read(import.meta.env.VITE_PUBLIC_SECURITY_CODE),
};

export const ICP_LINK = "https://beian.miit.gov.cn/";
export const policeLink = (code) =>
  code ? `https://beian.mps.gov.cn/#/query/webSearch?code=${encodeURIComponent(code)}` : "https://beian.mps.gov.cn/";

export const hasFilingInfo = () => Boolean(siteConfig.icp || siteConfig.police || siteConfig.policeCode);

/** 页脚展示用：公安备案号缺失时退回显示查询码，避免法定信息缺失 */
export const policeDisplayText = () => siteConfig.police || siteConfig.policeCode;