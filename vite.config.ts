import path from "node:path";
import { crx } from "@crxjs/vite-plugin";
import zip from "vite-plugin-zip-pack";
import { defineConfig } from "vitest/config";
import manifest from "./manifest.config.js";
import { name, version } from "./package.json";

export default defineConfig({
  build: {
    rollupOptions: {
      input: [path.resolve(__dirname, "src/block/index.html")],
    },
  },
  test: {
    exclude: [".direnv/**"],
  },
  resolve: {
    alias: {
      "@": `${path.resolve(__dirname, "src")}`,
    },
  },
  plugins: [
    crx({ manifest }),
    zip({ outDir: "release", outFileName: `crx-${name}-${version}.zip` }),
  ],
  server: {
    cors: {
      origin: [/chrome-extension:\/\//],
    },
  },
});
