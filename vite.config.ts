import { defineConfig } from 'vite';
import path from 'node:path';

export default defineConfig({
  root: '.',
  // Use relative base so built assets resolve under file:// in Electron
  base: './',
  server: {
    port: 5173,
    strictPort: true,
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
  resolve: {
    alias: {
      '@components': path.resolve(__dirname, 'src/components'),
    },
  },
});
