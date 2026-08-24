import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  async rewrites() {
    // Proxy API calls to the FastAPI backend (server-side at runtime)
    const api = process.env.API_INTERNAL_URL || "http://localhost:8300";
    return [{ source: "/api/:path*", destination: `${api}/:path*` }];
  },
};

export default nextConfig;
