import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // The API consumes @aurevo/shared from its CJS build (dist). The browser
  // needs ESM, so alias the workspace package to its TypeScript source —
  // same source-first model as @aurevo/design-system.
  resolve: {
    alias: {
      '@aurevo/shared': fileURLToPath(
        new URL('../../packages/shared/src/index.ts', import.meta.url)
      ),
    },
  },
  server: {
    port: 3000,
    proxy: {
      // Forward API calls to the NestJS backend during local development.
      '/api': process.env.VITE_DEV_API_TARGET ?? 'http://localhost:4000',
    },
  },
  build: {
    sourcemap: true,
  },
});
