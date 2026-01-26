import type { NextConfig } from "next"
import createNextIntlPlugin from "next-intl/plugin"
import { env } from "@/env"

const withNextIntl = createNextIntlPlugin({
  experimental: {
    createMessagesDeclaration: "./messages/en.json",
  },
})

const nextConfig: NextConfig = {
  reactStrictMode: true,
  output: "standalone",
  images: {
    // dangerouslyAllowLocalIP: true,
    remotePatterns: [
      new URL("**", env.NEXT_PUBLIC_ASSET_URL),
      {
        protocol: "https",
        hostname: "*.picsum.photos",
      },
      {
        protocol: "https",
        hostname: "*.giphy.com",
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

      ...(env.NEXT_PUBLIC_MANAGE_URL
        ? [
            {
              source: "/manage",
              destination: `${env.NEXT_PUBLIC_MANAGE_URL}/manage`,
            },
            {
              source: "/manage/:path+",
              destination: `${env.NEXT_PUBLIC_MANAGE_URL}/manage/:path+`,
            },
            {
              source: "/manage-static/:path+",
              destination: `${env.NEXT_PUBLIC_MANAGE_URL}/manage-static/:path+`,
            },
          ]
        : []),
    ]
  },
  headers() {
    return [
      {
        source: "/chat-widget/:path*",
        headers: [
          {
            key: "Access-Control-Allow-Origin",
            value: "*", // Set your origin
          },
          {
            key: "Access-Control-Allow-Methods",
            value: "GET, POST, PUT, DELETE, OPTIONS",
          },
          {
            key: "Access-Control-Allow-Headers",
            value: "Content-Type, Authorization",
          },
        ],
      },
    ]
  },
}

export default withNextIntl(nextConfig)
