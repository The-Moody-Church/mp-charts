import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone", // Required for Docker deployment
  cacheComponents: true, // Enables Cache Components (PPR + 'use cache' directive)
};

export default nextConfig;
