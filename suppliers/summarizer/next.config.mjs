/** @type {import('next').NextConfig} */
const nextConfig = {
  // Pin Turbopack root to this supplier (Next 16 inference is wrong in pnpm workspaces).
  turbopack: { root: process.cwd() },
  // Same for the file tracer used by `next build`.
  outputFileTracingRoot: process.cwd(),
};

export default nextConfig;
