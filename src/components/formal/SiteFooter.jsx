import { ICP_LINK, hasFilingInfo, policeDisplayText, policeLink, siteMeta } from "../../formal/site-meta.js";

export function SiteFooter({ compact = false }) {
  if (!hasFilingInfo()) return null;
  const policeText = policeDisplayText();
  return (
    <footer className={`site-footer ${compact ? "site-footer--compact" : ""}`}>
      <p className="site-footer__name">{siteMeta.siteName} · 班级自建站，非学校官方网站</p>
      <p className="site-footer__records">
        {siteMeta.icp && (
          <a href={ICP_LINK} target="_blank" rel="noreferrer noopener">{siteMeta.icp}</a>
        )}
        {siteMeta.icp && policeText && <span aria-hidden="true">·</span>}
        {policeText && (
          <a href={policeLink(siteMeta.policeCode)} target="_blank" rel="noreferrer noopener">{policeText}</a>
        )}
      </p>
    </footer>
  );
}