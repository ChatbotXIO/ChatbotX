import type { NextConfig } from "next"
import { env } from "@/env"

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
    remotePatterns: [new URL(env.NEXT_PUBLIC_ASSET_URL)],
  },
  experimental: {
    serverActions: {
      bodySizeLimit: "20mb",
    },
  },
  poweredByHeader: false,
  async rewrites() {
    return await [
      {
        source: "/assets/:path*",
        destination: `${env.NEXT_PUBLIC_ASSET_URL}/:path*`, // Proxy to Backend
      },
      ...(env.NEXT_PUBLIC_BILLING_URL
        ? [
            {
              source: "/pricing",
              destination: `${env.NEXT_PUBLIC_BILLING_URL}/pricing`,
            },
            {
              source: "/billing-static/:path+",
              destination: `${env.NEXT_PUBLIC_BILLING_URL}/billing-static/:path+`,
            },
          ]
        : []),
    ]
  },
}

export default nextConfig
