import { createHash } from "node:crypto"
import { getPublicOriginFromRequest } from "@chatbotx.io/utils"
import { OpenAPIGenerator } from "@orpc/openapi"
import { ZodToJsonSchemaConverter } from "@orpc/zod/zod4"
import "@/polyfill"
import { getTenantSettings } from "@/features/tenant/utils"
import {
  publicSpecGenerateOptions,
  withChannelApiTokenSecurity,
} from "@/lib/orpc/public-spec"
import { publicRouter } from "@/routers/public"

const openAPIGenerator = new OpenAPIGenerator({
  schemaConverters: [new ZodToJsonSchemaConverter()],
})

// The generated document only depends on (tenant name, origin, filter) — the
// router itself never changes at runtime — so it's safe to cache in-process
// keyed by those three. Regenerating on every request cost a full OpenAPI
// walk of ~60 feature routers plus a tenant-settings resolution on every MCP
// tool-list refresh; this keeps that off the hot path for TTL_SECONDS.
const TTL_SECONDS = 300
type CachedSpec = { body: string; etag: string; cachedAtMs: number }
const specCache = new Map<string, CachedSpec>()

function buildCacheKey(props: {
  tenantName: string
  origin: string
  filter: string | null
}): string {
  return `${props.tenantName}::${props.origin}::${props.filter ?? ""}`
}

function computeEtag(body: string): string {
  return `"${createHash("sha1").update(body).digest("hex")}"`
}

async function buildSpecDocument(props: {
  origin: string
  filter: string | null
  tenantName: string
}): Promise<string | null> {
  const spec = await openAPIGenerator.generate(publicRouter, {
    ...publicSpecGenerateOptions(props.tenantName),
    servers: [{ url: new URL("/api", props.origin).toString() }],
    filter: ({ contract }) => {
      if (props.filter && contract["~orpc"].route.path) {
        return contract["~orpc"].route.path.startsWith(`/v1/${props.filter}`)
      }
      return true
    },
  })

  const document = spec ? withChannelApiTokenSecurity(spec) : spec
  return document ? JSON.stringify(document) : null
}

async function resolveCachedSpec(props: {
  origin: string
  filter: string | null
}): Promise<CachedSpec | null> {
  const { name: tenantName } = await getTenantSettings()
  const cacheKey = buildCacheKey({
    tenantName,
    origin: props.origin,
    filter: props.filter,
  })

  const cached = specCache.get(cacheKey)
  const now = Date.now()
  if (cached && now - cached.cachedAtMs < TTL_SECONDS * 1000) {
    return cached
  }

  const body = await buildSpecDocument({
    origin: props.origin,
    filter: props.filter,
    tenantName,
  })
  if (!body) {
    specCache.delete(cacheKey)
    return null
  }

  const entry: CachedSpec = { body, etag: computeEtag(body), cachedAtMs: now }
  specCache.set(cacheKey, entry)
  return entry
}

async function handleRequest(request: Request) {
  const origin = getPublicOriginFromRequest(request)
  const filter = new URL(request.url).searchParams.get("filter")

  const cached = await resolveCachedSpec({ origin, filter })
  if (!cached) {
    return new Response("Not found", { status: 404 })
  }

  const ifNoneMatch = request.headers.get("If-None-Match")
  if (ifNoneMatch === cached.etag) {
    return new Response(null, {
      status: 304,
      headers: {
        ETag: cached.etag,
        "Cache-Control": `public, max-age=${TTL_SECONDS}, stale-while-revalidate=3600`,
      },
    })
  }

  return new Response(cached.body, {
    headers: {
      "Content-Type": "application/json",
      ETag: cached.etag,
      "Cache-Control": `public, max-age=${TTL_SECONDS}, stale-while-revalidate=3600`,
    },
  })
}

export const HEAD = handleRequest
export const GET = handleRequest
