import { createApp } from '../server/app.ts';

/**
 * Vercel serverless entry point. The catch-all filename ([...path]) makes
 * Vercel route every /api/* request here automatically - no vercel.json
 * rewrite needed. Everything under public/** (the vite build output) is
 * served directly by Vercel's CDN and never touches this function.
 *
 * Exporting the Express app directly (no app.listen()) is Vercel's
 * documented pattern for Express on its Node.js runtime: an Express app is
 * callable as (req, res), matching the signature Vercel invokes per request.
 */
export default createApp();
