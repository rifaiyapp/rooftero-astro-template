// @ts-check
import { defineConfig } from "astro/config";
import project from "./project.config.json" with { type: "json" };

const base = project?.deployment?.basePath || "/";

export default defineConfig({
  server: {
    host: "0.0.0.0",
    port: 3000,
  },
  vite: {
    server: {
      allowedHosts: true,
    },
  },
  output: "static",
  base,
  devToolbar: {
    enabled: false,
  },
});