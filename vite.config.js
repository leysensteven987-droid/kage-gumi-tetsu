import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Dev: Vite serves the React UI on 5173 and proxies /api to the standalone
// Express server (default 5274), so `npm run dev` works against `npm run start`.
// Build: emits a static bundle to dist/, which the Express server then serves.
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/api": {
        target: `http://localhost:${process.env.TETSU_PORT || 5274}`,
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
});
