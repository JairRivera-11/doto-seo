import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { createApp } from './server/app.ts';

/**
 * Local dev / traditional persistent-host entry point (Railway/Render/VPS
 * via `npm run build && npm start`). Vercel does NOT use this file - it
 * builds the frontend from `vercel-build` (vite build -> public/, served by
 * Vercel's own CDN) and runs the API through api/[...path].ts instead,
 * which calls the same `createApp()` but skips everything below.
 */
async function startServer() {
  const app = createApp();
  const PORT = 3000;

  // ==========================================
  // VITE MIDDLEWARE SETUP
  // ==========================================
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    // Only reached on a traditional persistent-Node host, never on Vercel
    // (which serves public/** via its own CDN and never invokes this file).
    const publicPath = path.join(process.cwd(), 'public');
    app.use(express.static(publicPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(publicPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Doto SEO server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
