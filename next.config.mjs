/** @type {import('next').NextConfig} */
const nextConfig = {
  // There's a stray package-lock.json in the home directory above this one, and
  // turbopack picks the outermost lockfile it finds as the workspace root -
  // which points it at all of C:\Users\patri. It then tries to scan that whole
  // tree on the first request, and dev serves nothing at all while it does.
  turbopack: { root: import.meta.dirname },
  images: {
    // OpenNext's separate optimizer is unreliable when bundled on Windows.
    // Serve these already-small assets directly and avoid an extra Lambda call.
    unoptimized: true,
    remotePatterns: [{ protocol: "https", hostname: "assets.parqet.com", pathname: "/logos/symbol/**" }],
  },
  // The Prisma CLI (via prisma.config.mjs) pulls in @prisma/dev, which ships
  // PGlite - a whole Postgres compiled to ~17MB of wasm. None of it runs in the
  // deployed app: queries go to Aurora DSQL through the generated client. Left
  // in, it is 17MB of dead weight in every Lambda cold start.
  outputFileTracingExcludes: {
    "*": [
      "**/node_modules/@prisma/dev/**",
      "**/node_modules/@electric-sql/**",
      "**/node_modules/prisma/**",
    ],
  },
  // Legacy market-sentiment pages and the public API were the site's own SEO
  // entry points before it became a research terminal, so their URLs are still
  // in search results, bookmarks and other people's links. 301 rather than 404
  // so that traffic lands on the site instead of a dead end.
  async redirects() {
    return [
      { source: "/fear-and-greed-index-today", destination: "/", permanent: true },
      { source: "/fear-and-greed-history", destination: "/", permanent: true },
      { source: "/fear-and-greed-vs/:ticker", destination: "/", permanent: true },
      { source: "/data", destination: "/", permanent: true },
      { source: "/api-access", destination: "/", permanent: true },
      { source: "/api-access/:path*", destination: "/", permanent: true },
      { source: "/openapi.json", destination: "/", permanent: true },
    ];
  },
};

export default nextConfig;
