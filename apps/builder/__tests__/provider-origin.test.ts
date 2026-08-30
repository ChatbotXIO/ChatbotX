// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"

const BROKER_ORIGIN = "https://broker.test"

const { mockFindActiveByTenantId, mockFindByOwner } = vi.hoisted(() => ({
  mockFindActiveByTenantId: vi.fn(),
  mockFindByOwner: vi.fn(),
}))

vi.mock("@chatbotx.io/business", () => ({
  customDomainService: {
    findActiveByTenantId: mockFindActiveByTenantId,
  },
  tenantService: {
    findByOwner: mockFindByOwner,
  },
}))

const mockIsCloud = vi.fn(() => true)
vi.mock("@/env", () => ({
  isCloud: mockIsCloud,
}))

vi.mock("@/lib/oauth-broker", () => ({
  getBrokerOrigin: () => BROKER_ORIGIN,
}))

async function loadModule() {
  vi.resetModules()
  return await import("@/lib/provider-origin")
}

beforeEach(() => {
  vi.clearAllMocks()
  mockIsCloud.mockReturnValue(true)
})

describe("resolveTenantCustomDomainOrigin", () => {
  test("returns null on non-cloud editions without looking up the tenant", async () => {
    mockIsCloud.mockReturnValue(false)
    const { resolveTenantCustomDomainOrigin } = await loadModule()

    expect(await resolveTenantCustomDomainOrigin("owner-1")).toBeNull()
    expect(mockFindByOwner).not.toHaveBeenCalled()
  })

  test("returns null when the owner has no tenant", async () => {
    mockFindByOwner.mockResolvedValue(undefined)
    const { resolveTenantCustomDomainOrigin } = await loadModule()

    expect(await resolveTenantCustomDomainOrigin("owner-1")).toBeNull()
    expect(mockFindActiveByTenantId).not.toHaveBeenCalled()
  })

  test("returns null when the tenant is suspended", async () => {
    mockFindByOwner.mockResolvedValue({ id: "t1", status: "suspended" })
    const { resolveTenantCustomDomainOrigin } = await loadModule()

    expect(await resolveTenantCustomDomainOrigin("owner-1")).toBeNull()
    expect(mockFindActiveByTenantId).not.toHaveBeenCalled()
  })

  test("returns null when the tenant has no active custom domain", async () => {
    mockFindByOwner.mockResolvedValue({ id: "t1", status: "active" })
    mockFindActiveByTenantId.mockResolvedValue(undefined)
    const { resolveTenantCustomDomainOrigin } = await loadModule()

    expect(await resolveTenantCustomDomainOrigin("owner-1")).toBeNull()
    expect(mockFindActiveByTenantId).toHaveBeenCalledWith("t1")
  })

  test("returns the https origin of the active custom domain", async () => {
    mockFindByOwner.mockResolvedValue({ id: "t1", status: "active" })
    mockFindActiveByTenantId.mockResolvedValue({ domain: "chat.acme.com" })
    const { resolveTenantCustomDomainOrigin } = await loadModule()

    expect(await resolveTenantCustomDomainOrigin("owner-1")).toBe(
      "https://chat.acme.com",
    )
  })
})

describe("resolveTenantProviderOrigin", () => {
  test("falls back to the broker origin when there is no active custom domain", async () => {
    mockFindByOwner.mockResolvedValue(undefined)
    const { resolveTenantProviderOrigin } = await loadModule()

    expect(await resolveTenantProviderOrigin("owner-1")).toBe(BROKER_ORIGIN)
  })

  test("returns the tenant's custom domain origin when active", async () => {
    mockFindByOwner.mockResolvedValue({ id: "t1", status: "active" })
    mockFindActiveByTenantId.mockResolvedValue({ domain: "chat.acme.com" })
    const { resolveTenantProviderOrigin } = await loadModule()

    expect(await resolveTenantProviderOrigin("owner-1")).toBe(
      "https://chat.acme.com",
    )
  })
})

describe("resolveProviderOriginForCredential", () => {
  test("returns the broker origin for a platform credential (userId null)", async () => {
    const { resolveProviderOriginForCredential } = await loadModule()

    expect(await resolveProviderOriginForCredential({ userId: null })).toBe(
      BROKER_ORIGIN,
    )
    expect(mockFindByOwner).not.toHaveBeenCalled()
  })

  test("returns the broker origin when no credential is passed", async () => {
    const { resolveProviderOriginForCredential } = await loadModule()

    expect(await resolveProviderOriginForCredential(undefined)).toBe(
      BROKER_ORIGIN,
    )
  })

  test("resolves the tenant origin for a tenant-owned credential (userId set)", async () => {
    mockFindByOwner.mockResolvedValue({ id: "t1", status: "active" })
    mockFindActiveByTenantId.mockResolvedValue({ domain: "chat.acme.com" })
    const { resolveProviderOriginForCredential } = await loadModule()

    expect(
      await resolveProviderOriginForCredential({ userId: "owner-1" }),
    ).toBe("https://chat.acme.com")
    expect(mockFindByOwner).toHaveBeenCalledWith("owner-1")
  })
})

describe("buildProviderCallbackUrl", () => {
  test("joins the path onto the broker origin for a platform credential", async () => {
    const { buildProviderCallbackUrl } = await loadModule()

    expect(
      await buildProviderCallbackUrl(
        { userId: null },
        "/integrations/messenger/callback",
      ),
    ).toBe(`${BROKER_ORIGIN}/integrations/messenger/callback`)
  })

  test("joins the path onto the tenant's custom domain for a tenant-owned credential", async () => {
    mockFindByOwner.mockResolvedValue({ id: "t1", status: "active" })
    mockFindActiveByTenantId.mockResolvedValue({ domain: "chat.acme.com" })
    const { buildProviderCallbackUrl } = await loadModule()

    expect(
      await buildProviderCallbackUrl(
        { userId: "owner-1" },
        "/integrations/messenger/callback",
      ),
    ).toBe("https://chat.acme.com/integrations/messenger/callback")
  })
})

describe("PLACEHOLDER_DOMAIN_ORIGIN", () => {
  test("is a literal, non-resolvable placeholder for display only", async () => {
    const { PLACEHOLDER_DOMAIN_ORIGIN } = await loadModule()

    expect(PLACEHOLDER_DOMAIN_ORIGIN).toBe("https://<your-domain.com>")
  })
})
