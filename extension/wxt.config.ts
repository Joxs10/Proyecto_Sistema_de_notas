import { defineConfig } from 'wxt';

// See https://wxt.dev/api/config.html
export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: {
   permissions: ['tabCapture', 'offscreen', 'storage', 'sidePanel', 'tabs'],
  host_permissions: ['http://localhost:8787/*'],
  },
});
