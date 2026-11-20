import { defineConfig } from "vite";

// GitHub Pages ではサブパス（/world-history-atlas/）で配信されるので相対パスにする
export default defineConfig({
  base: "./",
  optimizeDeps: { exclude: ["maplibre-gl"] },
});
