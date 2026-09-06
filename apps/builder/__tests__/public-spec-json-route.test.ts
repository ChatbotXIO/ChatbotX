// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"

// Same rationale as public-spec-operations.test.ts: importing the real
// `@/routers/public` transitively opens a real `pg.Pool` and boots the full
// better-auth stack. Neither is reachable from this route (it only
// generates route metadata), so both are stubbed.
vi.mock("@/middlewares/auth", () => ({
  authMiddleware: vi.fn(),
  workspaceAuthorizedMidddleware: vi.fn(),
}))

vi.mock("@chatbotx.io/database/client", () => {
  const proxy: unknown = new Proxy(() => proxy, { get: () => proxy })
  return { db: proxy }
})

const getTenantSettings = vi.fn()
vi.mock("@/features/tenant/utils", () => ({ getTenantSettings }))

const { GET } = await import("@/app/api/public-spec.json/route")

const SHA1_ETAG_PATTERN = /^"[0-9a-f]{40}"$/

beforeEach(() => {
  vi.clearAllMocks()
  getTenantSettings.mockResolvedValue({ name: "ChatbotX" })
})

// The route caches by (tenant name, origin, filter) in a module-level Map
// that outlives each test — every test uses its own unique host so cache
// entries can never leak between tests regardless of execution order.
const makeRequest = (
  host: string,
  path = "/public-spec.json",
  headers?: Record<string, string>,
) => new Request(`https://${host}${path}`, { headers })

describe("GET /public-spec.json", () => {
  test("returns the generated OpenAPI document with an ETag and Cache-Control", async () => {
    const response = await GET(makeRequest("host-basic.example.com"))

    expect(response.status).toBe(200)
    expect(response.headers.get("Content-Type")).toBe("application/json")
    expect(response.headers.get("ETag")).toMatch(SHA1_ETAG_PATTERN)
    expect(response.headers.get("Cache-Control")).toBe(
      "public, max-age=300, stale-while-revalidate=3600",
    )

    const body = await response.json()
    expect(body).toHaveProperty("openapi")
  })

  test("getTenantSettings is called once per request regardless of cache state (cheap; resolves the cache key)", async () => {
    const host = "host-repeat.example.com"

    await GET(makeRequest(host))
    await GET(makeRequest(host))

    expect(getTenantSettings).toHaveBeenCalledTimes(2)
  })

  test("a cache hit reuses the same document (identical ETag) within the TTL window", async () => {
    const host = "host-ttl-hit.example.com"
    vi.useFakeTimers()
    try {
      const first = await GET(makeRequest(host))
      vi.advanceTimersByTime(299_000) // just under the 300s TTL
      const second = await GET(makeRequest(host))

      expect(second.headers.get("ETag")).toBe(first.headers.get("ETag"))
    } finally {
      vi.useRealTimers()
    }
  })

  test("returns 304 with no body when If-None-Match matches the current ETag", async () => {
    const host = "host-304.example.com"
    const first = await GET(makeRequest(host))
    const etag = first.headers.get("ETag")
    expect(etag).toBeTruthy()

    const second = await GET(
      makeRequest(host, "/public-spec.json", {
        "If-None-Match": etag as string,
      }),
    )

    expect(second.status).toBe(304)
    expect(await second.text()).toBe("")
    expect(second.headers.get("ETag")).toBe(etag)
  })

  test("a different tenant name gets its own cache entry and ETag", async () => {
    const host = "host-tenant.example.com"
    const first = await GET(makeRequest(host))

    getTenantSettings.mockResolvedValue({ name: "OtherTenant" })
    const second = await GET(makeRequest(host))

    expect(first.headers.get("ETag")).not.toBe(second.headers.get("ETag"))
  })

  test("the ?filter= query param scopes the cache key separately from the unfiltered spec", async () => {
    const host = "host-filter.example.com"
    const unfiltered = await GET(makeRequest(host))
    const filtered = await GET(
      makeRequest(host, "/public-spec.json?filter=contacts"),
    )

    expect(unfiltered.headers.get("ETag")).not.toBe(
      filtered.headers.get("ETag"),
    )
  })
})
