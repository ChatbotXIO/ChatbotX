import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  reactStrictMode: true,
  experimental: {
    serverActions: {
      bodySizeLimit: "20mb",
    },
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  serverExternalPackages: ["@aws-sdk/client-s3", "@aws-sdk/s3-presigned-post"],
}

export default nextConfig
