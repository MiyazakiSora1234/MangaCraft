import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// 画面（src/client）のビルド設定。開発時は API と画像を Express（:3000）に中継する
export default defineConfig({
  root: "src/client",
  plugins: [react()],
  build: {
    outDir: "../../dist/client",
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    proxy: {
      "/api": "http://localhost:3000",
      "/images": "http://localhost:3000",
    },
  },
});
