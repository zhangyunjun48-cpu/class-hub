/*
 * 一次性“自毁” Service Worker。
 *
 * 早期原型在 `src/main.jsx` 里注册过 `/sw.js`，并且把整站缓存了下来，
 * 导致之后即使换了代码，浏览器仍然一直显示旧页面（`/sw.js` 一度被删除，
 * 浏览器只有在更新检查时才会发现它不见了）。
 *
 * 把这个文件放回同一路径，可以让还在被旧 Worker 控制的浏览器在更新检查时
 * 拉到这个自毁版本：注销注册、清掉旧缓存，并让所有窗口重新加载一次。
 *
 * 当前代码不会再注册任何 Service Worker，所以这个文件永远不会被主动安装。
 * 等所有同学的浏览器都清理干净后，可以安全删除。
 */

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    try {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((key) => key.indexOf("classhub") === 0 || key.indexOf("workbox") === 0)
          .map((key) => caches.delete(key)),
      );
    } catch (error) {
      // 清缓存失败也要继续注销
    }
    try {
      await self.registration.unregister();
    } catch (error) {
      // 忽略
    }
    const clients = await self.clients.matchAll({ type: "window" });
    clients.forEach((client) => {
      try {
        client.navigate(client.url);
      } catch (error) {
        // 忽略
      }
    });
  })());
});