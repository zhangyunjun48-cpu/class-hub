import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import { siteConfig } from "./config/site.js";
import "./styles.css";

// 站点名来自配置（VITE_SITE_NAME），在运行时写标题，避免构建期占位符残留。
document.title = siteConfig.siteName;

// 早期版本曾把整站缓存进 Service Worker，导致改了代码仍显示旧页面。
// 启动时一次性注销 Worker 并清掉本项目的缓存（含你从旧版本迁移时的前缀）。
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.getRegistrations().then((registrations) => {
    registrations.forEach((registration) => void registration.unregister());
  });
}
if ("caches" in window) {
  caches.keys().then((keys) => {
    keys
      .filter((key) => siteConfig.cachePrefixes.some((prefix) => key.startsWith(prefix)))
      .forEach((key) => void caches.delete(key));
  });
}

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <App />
  </StrictMode>
);