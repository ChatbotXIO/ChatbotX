import { beforeEach, describe, expect, test, vi } from "vitest"

const { mockFindFirst, mockWithCache } = vi.hoisted(() => ({
  mockFindFirst: vi.fn(),
  mockWithCache: vi.fn(
    async (
      _key: string,
      callback: () => Promise<unknown> | unknown,
      options: {
        tags?: string[]
        dynamicTags?: (result: unknown) => string[] | undefined
      },
    ) => {
      const result = await callback()
      // Exercise the same tag-derivation path the real withCache uses, so a
      // dynamicTags bug (e.g. throwing on `undefined`) surfaces in tests.
      options.dynamicTags?.(result)
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
      "custom-domain:active-tenant:t1",
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
    expect(dynamicTags?.({ domain: "chat.acme.com" })).toEqual([
      "cd:domain:chat.acme.com",
    ])
    expect(dynamicTags?.(undefined)).toEqual([])
  })
})
