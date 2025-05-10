import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  reactStrictMode: true,
  eslint: {
    ignoreDuringBuilds: true,
  },
  serverExternalPackages: [
    "@aws-sdk/client-s3",
    "@aws-sdk/s3-presigned-post",
    "@prisma/client",
  ],
  images: {
    remotePatterns: [
      {
        protocol: "http",
        hostname: "localhost",
        port: "9000",
        // pathname: "ahachat.ai/**",
      },
      {
        protocol: "https",
        hostname: "supposedly-driven-cheetah.ngrok-free.app",
        // pathname: "assets/**",
      },
    ],
  },
  experimental: {
    serverActions: {
      bodySizeLimit: "20mb",
    },
  },
  poweredByHeader: false,
  async rewrites() {
    return [
      {
        source: "/assets/:path*",
        destination: "http://localhost:9000/ahachatai/:path*", // Proxy to Backend
      },
    ]
  },
}

export default nextConfig
