import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, ".", "VITE_");
  return {
    plugins: [react()],
    server: {
      port: 5173,
      // Em desenvolvimento, o painel fala com a API local através deste proxy.
      proxy: { "/api": { target: env.VITE_API_PROXY ?? "http://localhost:4000", changeOrigin: true } },
    },
  };
});
