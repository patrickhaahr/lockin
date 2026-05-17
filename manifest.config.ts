import { defineManifest } from "@crxjs/vite-plugin";
import pkg from "./package.json";

export default defineManifest({
  manifest_version: 3,
  name: pkg.name,
  version: pkg.version,
  description: "Block configured distracting sites until the daily solve gate is satisfied.",
  icons: {
    48: "public/logo.png",
  },
  background: {
    service_worker: "src/background/main.ts",
    type: "module",
  },
  action: {
    default_icon: {
      48: "public/logo.png",
    },
    default_popup: "src/popup/index.html",
  },
  content_scripts: [
    {
      js: ["src/content/main.ts"],
      matches: ["http://*/*", "https://*/*"],
      run_at: "document_start",
    },
  ],
  permissions: ["storage", "sidePanel"],
  host_permissions: ["https://leetcode.com/*"],
  side_panel: {
    default_path: "src/sidepanel/index.html",
  },
  web_accessible_resources: [
    {
      resources: ["src/block/index.html"],
      matches: ["<all_urls>"],
    },
  ],
});
