import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { viteSingleFile } from "vite-plugin-singlefile";

/**
 * RF-03 exige que la interfaz web se sirva como "todo en un solo HTML con
 * inline CSS/JS" y "sin build process" para quien consuma el paquete ya
 * publicado. Vite + vite-plugin-singlefile resuelven eso: el build process
 * corre aca, en desarrollo del paquete, y lo que sale es un unico
 * index.html autocontenido (JS y CSS inline, sin <script src> externos)
 * que el backend sirve tal cual desde `backend/dashboard/index.html` (ver
 * `backend/src/monitoring/router.ts`).
 */
export default defineConfig({
  base: "./",
  plugins: [react(), viteSingleFile()],
  build: {
    outDir: "../backend/dashboard",
    emptyOutDir: true,
    cssCodeSplit: false,
    assetsInlineLimit: 100_000_000,
    chunkSizeWarningLimit: 2000,
  },
});
