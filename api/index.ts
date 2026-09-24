import { createApp } from '../server/app.ts';

/**
 * Vercel serverless entry point for every /api/** request. A previous
 * version of this file was named api/[...path].ts, relying on filesystem
 * catch-all routing to match multi-segment paths like /api/shopify/connect -
 * that catch-all convention is a Next.js feature and is NOT reliably
 * supported for generic (non-Next.js) Vercel Functions, which is why every
 * API call 404'd on Vercel while working fine locally. Routing is now done
 * explicitly via the `rewrites` rule in vercel.json instead, which forwards
 * every /api/* request to this one fixed file - unambiguous and
 * framework-agnostic. Everything under public/** (the vite build output) is
 * served directly by Vercel's CDN and never touches this function.
 *
 * Exporting the Express app directly (no app.listen()) is Vercel's
 * documented pattern for Express on its Node.js runtime: an Express app is
 * callable as (req, res), matching the signature Vercel invokes per request.
 */
export default createApp();
