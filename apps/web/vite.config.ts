import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

export default defineConfig({
  plugins: [react()],
  // Cursor Publish / Vercel expect a top-level `public` output directory.
  build: {
    outDir: path.join(rootDir, "public"),
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:4000",
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api/, ""),
      },
      "/uploads": {
        target: "http://localhost:4000",
        changeOrigin: true,
      },
    },
  },
});

