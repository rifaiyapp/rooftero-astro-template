// @ts-check
import { defineConfig } from 'astro/config';
import project from './project.config.json' with { type: 'json' };

// https://astro.build/config
export default defineConfig({
  output: 'static',
  base: project.deployment.basePath,
  devToolbar: { enabled: false },
  server: { host: true, port: 3000 },
  build: { inlineStylesheets: 'never' },
  vite: { build: { assetsInlineLimit: 0 } },
});
