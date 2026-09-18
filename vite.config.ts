import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    // Vercel only serves static assets from `public/**` (it ignores
    // express.static() entirely), so the frontend build output is pointed
    // there instead of the Vite default `dist/`. `publicDir: false` turns
    // off Vite's separate "copy public/ as-is" behavior, since here
    // `public/` IS the build output, not a source of raw assets to copy.
    publicDir: false as const,
    build: {
      outDir: 'public',
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
