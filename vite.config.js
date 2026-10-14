import { defineConfig, loadEnv } from "vite";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const apiTarget = env.VITE_API_TARGET?.trim();
  const proxy = apiTarget
    ? {
        "/api": {
          target: apiTarget,
          changeOrigin: true,
          secure: true,
        },
      }
    : undefined;

  return {
    server: {
      host: "0.0.0.0",
      port: 5173,
      proxy,
    },
    build: {
      target: "es2022",
    },
  };
});
