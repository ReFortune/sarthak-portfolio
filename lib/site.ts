/**
 * Canonical origin for absolute URLs (Open Graph, sitemap, robots).
 *
 * Resolution order:
 *   1. NEXT_PUBLIC_SITE_URL                 — set this to your real domain (e.g. https://yourname.com)
 *   2. VERCEL_PROJECT_PRODUCTION_URL        — provided automatically by Vercel
 *   3. http://localhost:3000                — local development
 */
export const siteUrl = (
  process.env.NEXT_PUBLIC_SITE_URL ??
  (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "http://localhost:3000")
).replace(/\/$/, "");
