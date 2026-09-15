// @ts-check
import { defineConfig } from "astro/config";
import project from "./project.config.json" with { type: "json" };

const base = project?.deployment?.basePath || "/";

export default defineConfig({
  output: "static",
  base,
  devToolbar: {
    enabled: false,
  },
});