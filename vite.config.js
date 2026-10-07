import { defineConfig } from "vite";

export default defineConfig({
  server: { port: 4200, host: true },
  preview: { port: 4200, host: true },
  build: {
    target: "es2022",
    // The HDRI is the only large asset; keep it as a file rather than inlining.
    assetsInlineLimit: 4096,
  },
});
