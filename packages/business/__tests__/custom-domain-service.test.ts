import { beforeEach, describe, expect, test, vi } from "vitest"

const { mockFindFirst, mockWithCache } = vi.hoisted(() => ({
  mockFindFirst: vi.fn(),
  mockWithCache: vi.fn(
    async (
      _key: string,
      callback: () => Promise<unknown> | unknown,
      options: {
        tags?: string[]
        ttlFor?: (result: unknown) => number | undefined
        dynamicTags?: (result: unknown) => string[] | undefined
      },
    ) => {
      const result = await callback()
      // Exercise the same tag/TTL-derivation path the real withCache uses, so
      // a bug in either (e.g. throwing on a miss) surfaces in tests.
      options.dynamicTags?.(result)
      options.ttlFor?.(result)
      return result
    },
  ),
}))

vi.mock("@chatbotx.io/database/client", () => ({
  db: {
    query: {
      customDomainModel: {
        findFirst: mockFindFirst,
      },
    },
  },
}))

vi.mock("@chatbotx.io/redis", () => ({
  withCache: mockWithCache,
}))

async function loadModule() {
  vi.resetModules()
  return await import("../src/enterprise/custom-domain/service")
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe("customDomainService.findActiveByTenantId", () => {
  test("returns the active domain row for the tenant", async () => {
    const row = {
      id: "cd1",
      tenantId: "t1",
      domain: "chat.acme.com",
      status: "active",
    }
    mockFindFirst.mockResolvedValue(row)
    const { customDomainService } = await loadModule()

    expect(await customDomainService.findActiveByTenantId("t1")).toBe(row)
    expect(mockFindFirst).toHaveBeenCalledWith({
      where: { tenantId: "t1", status: "active" },
    })
  })

  test("returns undefined when the tenant has no active domain", async () => {
    mockFindFirst.mockResolvedValue(undefined)
    const { customDomainService } = await loadModule()

    expect(await customDomainService.findActiveByTenantId("t1")).toBeUndefined()
  })

  test("caches under a tenant-scoped key and tags", async () => {
    mockFindFirst.mockResolvedValue({
      id: "cd1",
      tenantId: "t1",
      domain: "chat.acme.com",
      status: "active",
    })
    const { customDomainService } = await loadModule()

    await customDomainService.findActiveByTenantId("t1")

    expect(mockWithCache).toHaveBeenCalledWith(
      "custom-domain:active-tenant:v2:t1",
      expect.any(Function),
      expect.objectContaining({ tags: ["cd:tenant:t1"] }),
    )
  })

  test("derives a domain-scoped dynamic tag only when a domain resolved", async () => {
    mockFindFirst.mockResolvedValue({
      id: "cd1",
      tenantId: "t1",
      domain: "chat.acme.com",
      status: "active",
    })
    const { customDomainService } = await loadModule()
    await customDomainService.findActiveByTenantId("t1")

    const dynamicTags = mockWithCache.mock.calls[0]?.[2]?.dynamicTags
    expect(dynamicTags?.({ domain: { domain: "chat.acme.com" } })).toEqual([
      "cd:domain:chat.acme.com",
    ])
    expect(dynamicTags?.({ domain: null })).toEqual([])
  })

  test("caches a miss as a wrapped null with a short TTL, so it is not re-queried per call", async () => {
    mockFindFirst.mockResolvedValue(undefined)
    const { customDomainService } = await loadModule()
    await customDomainService.findActiveByTenantId("t1")

    const callback = mockWithCache.mock.calls[0]?.[1]
    const ttlFor = mockWithCache.mock.calls[0]?.[2]?.ttlFor
    // withCache skips storing null/undefined — the callback must return an
    // object even when the tenant has no active domain.
    expect(await callback?.()).toEqual({ domain: null })
    expect(ttlFor?.({ domain: null })).toBe(60)
    expect(ttlFor?.({ domain: { domain: "chat.acme.com" } })).toBeUndefined()
  })
})
