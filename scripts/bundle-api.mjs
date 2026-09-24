// Bundles api/index.ts into a single self-contained api/index.mjs for
// Vercel deployment, then removes the .ts source so only one file maps to
// the /api route. Uses esbuild's JS API with absolute paths (not the CLI
// with a shell-interpolated relative path) to avoid ambiguity between
// esbuild's "bare specifier" heuristic (used by --packages=external) and
// plain file-not-found resolution.
//
// Confirmed via Vercel build logs: Vercel runs the "Build Command" (this
// script, through `vercel-build`) MORE THAN ONCE per deployment (once per
// build target - static output and the Node.js Function both trigger it).
// The first run bundles + deletes api/index.ts; a naive second run then
// can't find that file and errors. This must be idempotent: if the source
// is already gone but the bundle already exists, a later invocation is a
// no-op success, not a failure.
import { build } from 'esbuild';
import { existsSync, rmSync, readdirSync } from 'fs';
import path from 'path';

const root = process.cwd();
const entry = path.join(root, 'api', 'index.ts');
const outfile = path.join(root, 'api', 'index.mjs');

console.log('[bundle-api] cwd:', root);
console.log('[bundle-api] entry:', entry, '- exists:', existsSync(entry));

if (!existsSync(entry)) {
  if (existsSync(outfile)) {
    console.log('[bundle-api] Source already bundled by an earlier invocation in this same build - nothing to do.');
    process.exit(0);
  }
  const apiDir = path.join(root, 'api');
  console.log('[bundle-api] api/ dir exists:', existsSync(apiDir));
  if (existsSync(apiDir)) {
    console.log('[bundle-api] api/ contents:', readdirSync(apiDir));
  }
  console.log('[bundle-api] root contents:', readdirSync(root));
  throw new Error(`[bundle-api] Entry point not found at ${entry}, and no existing bundle at ${outfile} either.`);
}

await build({
  entryPoints: [entry],
  bundle: true,
  platform: 'node',
  format: 'esm',
  packages: 'external',
  outfile,
});

console.log('[bundle-api] Bundled to', outfile);
rmSync(entry);
console.log('[bundle-api] Removed original', entry);
