import { defineConfig } from "wxt";
export default defineConfig({
  modules: ["@wxt-dev/module-vue"],
  manifest: {
    browser_specific_settings: {
      gecko: {
        id: "nukoblock@nukoblock.local",
        data_collection_permissions: { required: ["none"] },
      },
    },
    name: "Nukoblock",
    description: "A small cat-shaped pause for distracting websites.",
    permissions: [
      "storage",
      "tabs",
      "webNavigation",
      "alarms",
      "idle",
      "declarativeNetRequestWithHostAccess",
    ],
    optional_host_permissions: ["http://*/*", "https://*/*"],
    web_accessible_resources: [{ resources: ["gate.html"], matches: ["<all_urls>"] }],
    action: { default_title: "Nukoblock" },
  },
});
