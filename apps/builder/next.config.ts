import type { NextConfig } from "next"
import createNextIntlPlugin from "next-intl/plugin"
import { env } from "@/env"

const withNextIntl = createNextIntlPlugin({
  experimental: {
    createMessagesDeclaration: "./messages/en.json",
  },
})

const appUrl = env.NEXT_PUBLIC_BUILDER_URL.replace(/\/$/, "")
const storageUrl = `${appUrl}/storage`

const nextConfig: NextConfig = {
  reactStrictMode: true,
  output: "standalone",
  images: {
    // dangerouslyAllowLocalIP: true,
    remotePatterns: [
      new URL("**", storageUrl),
      {
        protocol: "https",
        hostname: "storage.googleapis.com",
      },
      {
        protocol: "https",
        hostname: "(.*.)?picsum.photos",
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
    const existingRewrites = [
      {
        source: "/assets/:path*",
        destination: `${storageUrl}/:path*`, // Proxy to Backend
      },
      // Zalo verifier
      {
        source: "/zalo_verifier:verifier.html",
        destination: "/api/zalo-verifier/:verifier",
      },
    ]

    if (process.env.NODE_ENV !== "development") {
      return existingRewrites
    }

    // Local dev internal routing (production routes /ws and /storage via load balancer / Caddy)
    const wsUrl = env.NEXT_PUBLIC_INTERNAL_WS_URL
    const s3Bucket = process.env.S3_BUCKET ?? "chatbotx"
    const s3Endpoint = process.env.S3_ENDPOINT ?? "http://localhost:9000"

    const devRewrites = [
      {
        source: "/ws/:path*",
        destination: `${wsUrl}/:path*`,
      },
      {
        source: "/storage/:path*",
        destination: `${s3Endpoint}/${s3Bucket}/:path*`,
      },
    ]

    return [...existingRewrites, ...devRewrites]
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
  allowedDevOrigins: [env.NEXT_PUBLIC_BUILDER_URL.replace(/https?:\/\//, "")],
}

export default withNextIntl(nextConfig)
