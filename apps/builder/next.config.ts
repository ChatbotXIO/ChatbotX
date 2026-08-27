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
  // These `@chatbotx.io/*` workspace packages are consumed as SOURCE (their
  // `exports` point at `./src/*.ts`). pnpm symlinks them under node_modules, so
  // without this Next/Turbopack treats them as vendored externals and does NOT
  // recompile them on edit during `next dev` — server-side changes to them
  // silently keep running the previously-compiled copy. Listing them here puts
  // them through the compile+watch pipeline so edits actually take effect.
  transpilePackages: [
    "@chatbotx.io/integration-facebook-ads",
    "@chatbotx.io/business",
  ],
  images: {
    remotePatterns: [{ protocol: "https", hostname: "**" }],
  },
  // Type-checking is NOT part of `next build`: the in-build tsc pass duplicated
  // `check-types` and OOMs a default 4GB heap. The type gate lives in
  // .github/workflows/ci.yml (`turbo run check-types lint test`) — keep that
  // workflow green before trusting a build.
  typescript: {
    ignoreBuildErrors: true,
  },
  experimental: {
    serverActions: {
      bodySizeLimit: "20mb",
    },
    // Additive to Next's built-in default list, which already covers
    // lucide-react. `@chatbotx.io/ui` doesn't belong here: it's imported via
    // per-file subpaths and its root export is not a re-export barrel, so
    // there is nothing for this optimization to rewrite.
    optimizePackageImports: ["@icons-pack/react-simple-icons"],
    // turbopackServerFastRefresh: false,
    // The Docker build starts from a clean layer and `.next/cache` is not
    // persisted across CI runs, so this cache is written and never read.
    turbopackFileSystemCacheForBuild: false,
  },
  poweredByHeader: false,
  async rewrites() {
    const wsUrl = env.NEXT_PUBLIC_INTERNAL_WS_URL
    const alwaysRewrites = [
      {
        source: "/assets/:path*",
        destination: `${storageUrl}/:path*`,
      },
      {
        source: "/zalo_verifier:verifier.html",
        destination: "/api/zalo-verifier/:verifier",
      },
      { source: "/ws/:path*", destination: `${wsUrl}/:path*` },
    ]

    if (process.env.NODE_ENV !== "development") {
      return alwaysRewrites
    }

    // Local dev: production routes /ws, /storage, /manage/*, and /portal/*
    // via load balancer / Caddy
    const s3Bucket = process.env.S3_BUCKET ?? "chatbotx"
    const s3Endpoint = process.env.S3_ENDPOINT ?? "http://localhost:9000"
    const portalUrl = process.env.PORTAL_INTERNAL_URL ?? "http://localhost:3201"

    // afterFiles: checked after filesystem routes, so builder's own /manage/* pages
    // (platform-credentials, branding, email-templates) are served first;
    // unmatched /portal/* paths fall through to the portal proxy below.
    return {
      afterFiles: [
        ...alwaysRewrites,
        {
          source: "/storage/:path*",
          destination: `${s3Endpoint}/${s3Bucket}/:path*`,
        },
        { source: "/portal/:path*", destination: `${portalUrl}/portal/:path*` },
        // { source: "/pricing", destination: `${portalUrl}/portal/pricing` },
        // {
        //   source: "/checkout/:path*",
        //   destination: `${portalUrl}/portal/checkout/:path*`,
        // },
        {
          source: "/api/checkout/:path*",
          destination: `${portalUrl}/portal/api/checkout/:path*`,
        },
        {
          // Top-up-pack checkout (buy more botMessages credit) — same public
          // authenticated-buyer surface as /api/checkout/*, kept as its own
          // path so it isn't mistaken for a plan checkout by anything reading
          // the URL (the request body/session metadata is what actually
          // disambiguates server-side, but the path stays self-describing).
          source: "/api/top-ups/:path*",
          destination: `${portalUrl}/portal/api/top-ups/:path*`,
        },
        {
          source: "/api/billing/webhook",
          destination: `${portalUrl}/portal/api/billing/webhook`,
        },
        {
          // Stripe Connect OAuth redirects the reseller's browser back to this
          // builder-origin path (see portal connect/authorize redirect_uri);
          // forward it to the portal handler so the token exchange can run.
          source: "/api/billing/connect/:path*",
          destination: `${portalUrl}/portal/api/billing/connect/:path*`,
        },
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
            value: "*", // Static widget assets only; guest API CORS is dynamic.
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
  allowedDevOrigins: [
    new URL(env.NEXT_PUBLIC_BUILDER_URL).host,
    ...(env.NEXT_PUBLIC_ALLOWED_DEV_ORIGINS ?? []),
  ],

  // Resolve bull-board and bullmq from node_modules at runtime, not from the bundle.
  // @napi-rs/canvas ships a native .node addon (per-platform binary) that the
  // bundler can't inline — it must stay a runtime require() too.
  serverExternalPackages: [
    "@bull-board/api",
    "@bull-board/ui",
    "@bull-board/hono",
    "bullmq",
    "@napi-rs/canvas",
  ],

  outputFileTracingRoot: require("path").join(import.meta.dirname, "../../"),

  // Force the compiled UI into the serverless function (the tracer can't see the eval).
  outputFileTracingIncludes: {
    "/developer/queues/*": ["./node_modules/@bull-board/ui/dist/**/*"],
  },
}

export default withNextIntl(nextConfig)
