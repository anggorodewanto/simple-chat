import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Only the Docker image needs the standalone bundle; a plain `next start`
  // locally warns about it, so the Dockerfile opts in via this env var.
  output: process.env.NEXT_OUTPUT === "standalone" ? "standalone" : undefined,
  poweredByHeader: false,
  async headers() {
    return [
      {
        // The service worker must never be served from a stale cache, or
        // clients get pinned to an old app shell.
        source: "/sw.js",
        headers: [{ key: "Cache-Control", value: "no-cache, no-store, must-revalidate" }],
      },
    ];
  },
};

export default nextConfig;
