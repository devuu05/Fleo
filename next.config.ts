import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  // PGlite is a WASM package with its own files; keep it out of the bundle.
  serverExternalPackages: ["@electric-sql/pglite"],
  // migrations are read from ./drizzle at runtime
  outputFileTracingIncludes: { "/**": ["./drizzle/**/*"] },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
