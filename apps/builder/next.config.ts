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
  // Desliga o popup "Route/Bundler/Turbopack" do Next.js que aparece em dev.
  // Pedro reclamou 2026-05-24 que o popup atrapalha. Não afeta o app.
  devIndicators: false,
  images: {
    // dangerouslyAllowLocalIP: true,
    remotePatterns: [
      new URL("**", env.NEXT_PUBLIC_ASSET_URL),
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
    ]
  },
  async redirects() {
    return [
      // Camada 2 — Dados Mestres movidos pra /settings/* (Respond.io match).
      // Mantém redirects pras URLs antigas pra não quebrar bookmarks.
      {
        source: "/space/:workspaceId/tags",
        destination: "/space/:workspaceId/settings/tags",
        permanent: true,
      },
      {
        source: "/space/:workspaceId/custom-fields",
        destination: "/space/:workspaceId/settings/contact-fields",
        permanent: true,
      },
      {
        source: "/space/:workspaceId/bot-fields",
        destination: "/space/:workspaceId/settings/bot-fields",
        permanent: true,
      },
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
  allowedDevOrigins: [env.NEXT_PUBLIC_BUILDER_URL.replace(/https?:\/\//g, "")],
}

export default withNextIntl(nextConfig)
