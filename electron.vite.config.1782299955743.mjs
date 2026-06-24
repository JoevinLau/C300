// electron.vite.config.ts
import path from "node:path";
import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
var electron_vite_config_default = defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      outDir: "out/main"
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      outDir: "out/preload"
    }
  },
  renderer: {
    root: "src/renderer",
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        "@": path.resolve("src/renderer")
      }
    },
    build: {
      outDir: path.resolve("out/renderer")
    }
  }
});
export {
  electron_vite_config_default as default
};
