import type { NextConfig } from "next"
import createNextIntlPlugin from "next-intl/plugin"
import { env } from "@/env"

const withNextIntl = createNextIntlPlugin({
  experimental: {
    createMessagesDeclaration: "./messages/en.json",
  },
})

const appUrl = env.NEXT_PUBLIC_BUILDER_URL.replace(/\/$/, "")
const storageUrl = env.NEXT_PUBLIC_STORAGE_URL ?? `${appUrl}/storage`

const nextConfig: NextConfig = {
  reactStrictMode: true,
  output: "standalone",
  images: {
    remotePatterns: [{ protocol: "https", hostname: "**" }],
  },
  experimental: {
    serverActions: {
      bodySizeLimit: "20mb",
    },
  },
  poweredByHeader: false,
  async rewrites() {
    const alwaysRewrites = [
      {
        source: "/assets/:path*",
        destination: `${storageUrl}/:path*`,
      },
      {
        source: "/zalo_verifier:verifier.html",
        destination: "/api/zalo-verifier/:verifier",
      },
    ]

    if (process.env.NODE_ENV !== "development") {
      return alwaysRewrites
    }

    // Local dev: production routes /ws, /storage, and /manage/* via load balancer / Caddy
    const wsUrl = env.NEXT_PUBLIC_INTERNAL_WS_URL
    const s3Bucket = process.env.S3_BUCKET ?? "chatbotx"
    const s3Endpoint = process.env.S3_ENDPOINT ?? "http://localhost:9000"
    const portalUrl = process.env.PORTAL_INTERNAL_URL ?? "http://localhost:3201"

    // afterFiles: checked after filesystem routes, so builder's own /manage/* pages
    // (platform-credentials, branding, email-templates) are served first;
    // unmatched /manage/* paths fall through to the portal proxy below.
    return {
      afterFiles: [
        ...alwaysRewrites,
        { source: "/ws/:path*", destination: `${wsUrl}/:path*` },
        {
          source: "/storage/:path*",
          destination: `${s3Endpoint}/${s3Bucket}/:path*`,
        },
        { source: "/manage/:path*", destination: `${portalUrl}/manage/:path*` },
      ],
    }
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
