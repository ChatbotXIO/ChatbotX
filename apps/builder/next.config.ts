import type { NextConfig } from "next"
import createNextIntlPlugin from "next-intl/plugin"
import { env } from "@/env"

const withNextIntl = createNextIntlPlugin()
const nextConfig: NextConfig = {
  reactStrictMode: true,
  eslint: {
    ignoreDuringBuilds: true,
  },
  output: "standalone",
  serverExternalPackages: [
    "@aws-sdk/client-s3",
    "@aws-sdk/s3-presigned-post",
    "@prisma/client",
  ],
  images: {
    remotePatterns: [
      new URL("**", env.NEXT_PUBLIC_ASSET_URL),
      {
        protocol: "https",
        hostname: "*.picsum.photos",
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
    return await [
      {
        source: "/assets/:path*",
        destination: `${env.NEXT_PUBLIC_ASSET_URL}/:path*`, // Proxy to Backend
      },
      // Zalo verifier
      {
        source: "/zalo_verifier:verifier.html",
        destination: "/api/zalo-verifier/:verifier",
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

export default withNextIntl(nextConfig)
