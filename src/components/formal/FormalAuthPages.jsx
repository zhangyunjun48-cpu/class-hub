import { useState } from "react";
import { AlertTriangle, ArrowRight, BookOpen, Library, ShieldCheck } from "lucide-react";
import { useFormal } from "../../formal/FormalContext.jsx";
import { SiteFooter } from "./SiteFooter.jsx";
import { siteConfig } from "../../config/site.js";

const guidance = [
  ["先看今天", "首页直接显示今日、未来 7 天和已经逾期的事项。"],
  ["发现变化直接改", "普通日程全班都能修改，保存后其他在线同学立即看到。"],
  ["重要事项由班委锁定", "公告和重要日程只有管理员能改，所有变更都可以追溯。"]
];

function GuestNav({ route, navigate }) {
  return (
    <nav className="demo-nav" aria-label="公共导航">
      <button type="button" className={route === "resources" ? "is-active" : ""} onClick={() => navigate("resources")}><Library size={16} />公共资料</button>
      <button type="button" className={route === "tutorial" ? "is-active" : ""} onClick={() => navigate("tutorial")}><BookOpen size={16} />图文教程</button>
      <button type="button" className={route === "login" ? "is-active" : ""} onClick={() => navigate("login")}><ShieldCheck size={16} />成员登录</button>
    </nav>
  );
}

export function FormalPublicShell({ children, route, navigate }) {
  return (
    <div className="demo-shell">
      <a className="skip-link" href="#main-content">跳到主要内容</a>
      <header className="demo-header">
        <div className="demo-header__inner">
          <button className="demo-brand" type="button" onClick={() => navigate("login")}>
            <span>{siteConfig.brandMark}</span><strong>{siteConfig.siteName}</strong><small>{siteConfig.subtitle}</small>
          </button>
          <GuestNav route={route} navigate={navigate} />
          <div className="demo-header__actions">
            <button className="demo-button demo-button--primary demo-button--small" type="button" onClick={() => navigate("login")}>成员登录</button>
          </div>
        </div>
      </header>
      <main id="main-content">{children}</main>
      <SiteFooter />
    </div>
  );
}

export function FormalLoginPage({ navigate }) {
  const { status, challenge, login, activate, resetChallenge } = useFormal();
  const [studentId, setStudentId] = useState("");
  const [name, setName] = useState("");
  const [activationCode, setActivationCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submitIdentity = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await login({ studentId: studentId.trim(), name: name.trim() });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "验证失败");
    } finally {
      setBusy(false);
    }
  };

  const submitActivation = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await activate(activationCode.trim());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "激活失败");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="demo-join-page">
      <section className="demo-join-intro">
        <span className="demo-join-mark">11</span>
        <p>{siteConfig.latinEyebrow}</p>
        <h1>打开就能看到，<br />今天别漏掉什么。</h1>
        <span>全班共享同一份日程。谁发现变化都可以直接修正，保存后其他在线同学立即看到；重要事项和公告由班委锁定。</span>
        <ul>
          {guidance.map(([title, body]) => <li key={title}><strong>{title}</strong>：{body}</li>)}
        </ul>
        <nav className="formal-guest-links" aria-label="无需登录即可查看">
          <button type="button" className="demo-text-link" onClick={() => navigate("resources")}><Library size={15} />先看看公共资料</button>
          <button type="button" className="demo-text-link" onClick={() => navigate("tutorial")}><BookOpen size={15} />查看图文教程</button>
        </nav>
      </section>
      <section className="demo-join-panel">
        <div className="demo-join-card">
          <div className="demo-join-card__head">
            <strong>{challenge ? "输入班级激活码" : "成员登录"}</strong>
            <small>{challenge ? `已匹配白名单：${challenge.displayName}` : "使用班委导入名单中的学号与姓名"}</small>
          </div>
          {status === "offline" && <div className="demo-alert"><AlertTriangle size={16} />暂时连接不上服务器，请稍后重试。</div>}
          {error && <div className="demo-alert"><AlertTriangle size={16} />{error}</div>}
          {challenge ? (
            <form className="demo-form" onSubmit={submitActivation}>
              <label className="demo-field demo-field--full">
                <span>班级激活码</span>
                <input type="password" value={activationCode} onChange={(event) => setActivationCode(event.target.value)} autoFocus autoComplete="one-time-code" />
                <small>首次登录需要激活码；验证成功后同一浏览器 30 天内免验证。</small>
              </label>
              <div className="demo-form__footer demo-field--full">
                <button className="demo-button demo-button--ghost" type="button" onClick={() => { resetChallenge(); setError(""); setActivationCode(""); }}>返回上一步</button>
                <button className="demo-button demo-button--primary" type="submit" disabled={busy}>{busy ? "验证中" : `进入${siteConfig.siteName}`}<ArrowRight size={16} /></button>
              </div>
            </form>
          ) : (
            <form className="demo-form" onSubmit={submitIdentity}>
              <label className="demo-field demo-field--full"><span>学号</span><input value={studentId} onChange={(event) => setStudentId(event.target.value)} autoFocus autoComplete="username" inputMode="numeric" /></label>
              <label className="demo-field demo-field--full"><span>姓名</span><input value={name} onChange={(event) => setName(event.target.value)} autoComplete="name" /></label>
              <p className="demo-field demo-field--full formal-hint">学号只用于比对白名单，服务端保存的是 HMAC 值和末四位掩码，不保存明文。</p>
              <button className="demo-button demo-button--primary demo-field--full" type="submit" disabled={busy}>{busy ? "验证中" : "下一步"}<ArrowRight size={16} /></button>
            </form>
          )}
          <p className="demo-join-note">没有账号？请联系班委把学号加入白名单。未登录不能查看日程、公告和成员信息。</p>
        </div>
        <SiteFooter compact />
      </section>
    </main>
  );
}