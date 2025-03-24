import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  reactStrictMode: true,
  eslint: {
    ignoreDuringBuilds: true,
  },
  serverExternalPackages: ["@aws-sdk/client-s3", "@aws-sdk/s3-presigned-post"],
}

export default nextConfig
