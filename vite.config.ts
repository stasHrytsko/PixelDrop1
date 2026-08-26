import { defineConfig } from 'vite';

export default defineConfig({
  // Capacitor serves the bundle from the filesystem, so every asset URL must be relative.
  base: './',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'es2022',
    sourcemap: true,
    // Phaser is ~370 kB gzipped in a single chunk. Inside an APK the bundle is
    // read from the local filesystem, so splitting it buys almost nothing and
    // costs a lazy-loading seam in the Shell/Mechanic contract. Revisit only if
    // cold start on a cheap phone actually becomes a problem.
    chunkSizeWarningLimit: 1600,
  },
  server: {
    port: 5173,
    host: true,
  },
  preview: {
    port: 4173,
  },
});
