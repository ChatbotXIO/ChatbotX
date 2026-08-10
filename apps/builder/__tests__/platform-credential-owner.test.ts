// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"

// ---------------------------------------------------------------------------
// `resolvePlatformOwnerId` decides whose OAuth app credentials a channel
// connect uses. `platformCredentialService.resolveForOwner` and
// `tenantService.resolveVisibleChannels` both key on `Tenant.ownerId`, so
// passing anything else silently falls back to the platform-global
// credential — the bug this helper exists to fix. These tests pin the
// resolution order: host wins over an explicit workspace, and the OAuth
// completion leg (which runs after the white-label relay restores the
// branded host) must never disagree with the start leg.
// ---------------------------------------------------------------------------

const {
  mockFindWorkspace,
  mockGetDomainFromHeader,
  mockIsCloud,
  mockResolveTenantByDomain,
  mockResolveTenantOwnerId,
} = vi.hoisted(() => ({
  mockFindWorkspace: vi.fn(),
  mockGetDomainFromHeader: vi.fn(async () => ""),
  mockIsCloud: vi.fn(() => true),
  mockResolveTenantByDomain: vi.fn(async () => "1"),
  mockResolveTenantOwnerId: vi.fn(async (): Promise<string | null> => null),
}))

vi.mock("@/env", () => ({
  isCloud: mockIsCloud,
}))

vi.mock("@/lib/domain", () => ({
  getDomainFromHeader: mockGetDomainFromHeader,
}))

vi.mock("@chatbotx.io/auth/tenant", () => ({
  resolveTenantByDomain: mockResolveTenantByDomain,
  resolveTenantOwnerId: mockResolveTenantOwnerId,
}))

vi.mock("@chatbotx.io/business", () => ({
  workspaceService: {
    find: mockFindWorkspace,
  },
}))

vi.mock("@chatbotx.io/database/partials", () => ({
  ROOT_TENANT_ID: "1",
}))

const { resolveOwnerForWorkspace, resolvePlatformOwnerId } = await import(
  "../src/lib/platform-credential-owner"
)

describe("resolvePlatformOwnerId", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockIsCloud.mockReturnValue(true)
    mockGetDomainFromHeader.mockResolvedValue("")
    mockResolveTenantByDomain.mockResolvedValue("1")
    mockResolveTenantOwnerId.mockResolvedValue(null)
  })

  test("non-cloud editions always use the current user, without consulting the host", async () => {
    mockIsCloud.mockReturnValue(false)

    const result = await resolvePlatformOwnerId({
      userId: "user-1",
      workspaceId: "ws-1",
    })

    expect(result).toBe("user-1")
    expect(mockResolveTenantByDomain).not.toHaveBeenCalled()
    expect(mockFindWorkspace).not.toHaveBeenCalled()
  })

  test("an active white-label domain resolves to that tenant's owner (case 1)", async () => {
    mockGetDomainFromHeader.mockResolvedValue("reseller.example.com")
    mockResolveTenantByDomain.mockResolvedValue("42")
    mockResolveTenantOwnerId.mockResolvedValue("reseller-1")

    const result = await resolvePlatformOwnerId({ userId: "user-1" })

    expect(result).toBe("reseller-1")
    expect(mockResolveTenantByDomain).toHaveBeenCalledWith(
      "reseller.example.com",
    )
    expect(mockResolveTenantOwnerId).toHaveBeenCalledWith("42")
  })

  test("the white-label host wins even when workspaceId resolves to a different owner", async () => {
    mockGetDomainFromHeader.mockResolvedValue("reseller.example.com")
    mockResolveTenantByDomain.mockResolvedValue("42")
    mockResolveTenantOwnerId.mockResolvedValue("reseller-1")

    const result = await resolvePlatformOwnerId({
      userId: "user-1",
      workspaceId: "ws-1",
    })

    expect(result).toBe("reseller-1")
    // The precedence is load-bearing: a future "workspace should win" change
    // must not silently reorder this. See the helper's doc comment on why
    // host-first is safe across the OAuth broker hop.
    expect(mockFindWorkspace).not.toHaveBeenCalled()
  })

  test("falls back to the current user when the resolved tenant has no owner (suspended tenant)", async () => {
    mockGetDomainFromHeader.mockResolvedValue("reseller.example.com")
    mockResolveTenantByDomain.mockResolvedValue("42")
    mockResolveTenantOwnerId.mockResolvedValue(null)

    const result = await resolvePlatformOwnerId({ userId: "user-1" })

    expect(result).toBe("user-1")
  })

  test("platform host with a known workspace resolves via the workspace's tenant-aware owner", async () => {
    mockFindWorkspace.mockResolvedValue({
      ownerId: "sub-account-1",
      tenantId: "42",
    })
    mockResolveTenantOwnerId.mockResolvedValue("reseller-1")

    const result = await resolvePlatformOwnerId({
      userId: "sub-account-1",
      workspaceId: "ws-1",
    })

    expect(result).toBe("reseller-1")
    expect(mockResolveTenantOwnerId).toHaveBeenCalledWith("42")
  })

  test("platform host, workspace not found, falls back to the current user (cases 2 and 3)", async () => {
    mockFindWorkspace.mockResolvedValue(undefined)

    const result = await resolvePlatformOwnerId({
      userId: "user-1",
      workspaceId: "ws-missing",
    })

    expect(result).toBe("user-1")
    // `resolveForOwner`/`resolveVisibleChannels` already split "owns an
    // active tenant" (case 2) from "plain platform user" (case 3) via their
    // own `findByOwner` call — this helper must not duplicate that check.
    expect(mockResolveTenantOwnerId).not.toHaveBeenCalled()
  })

  test("platform host, no workspaceId, falls back to the current user (cases 2 and 3)", async () => {
    const result = await resolvePlatformOwnerId({ userId: "user-1" })

    expect(result).toBe("user-1")
    expect(mockFindWorkspace).not.toHaveBeenCalled()
    expect(mockResolveTenantOwnerId).not.toHaveBeenCalled()
  })

  test("an empty-string workspaceId is treated as absent", async () => {
    const result = await resolvePlatformOwnerId({
      userId: "user-1",
      workspaceId: "",
    })

    expect(result).toBe("user-1")
    expect(mockFindWorkspace).not.toHaveBeenCalled()
  })

  test("a missing x-domain header resolves to the root tenant", async () => {
    mockGetDomainFromHeader.mockResolvedValue("")

    const result = await resolvePlatformOwnerId({ userId: "user-1" })

    expect(result).toBe("user-1")
    expect(mockResolveTenantByDomain).toHaveBeenCalledWith("")
  })
})

describe("resolveOwnerForWorkspace", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockResolveTenantOwnerId.mockResolvedValue(null)
  })

  test("a workspace on a reseller's tenant resolves to that tenant's owner", async () => {
    mockResolveTenantOwnerId.mockResolvedValue("reseller-1")

    const result = await resolveOwnerForWorkspace({
      ownerId: "sub-account-1",
      tenantId: "42",
    } as never)

    expect(result).toBe("reseller-1")
    expect(mockResolveTenantOwnerId).toHaveBeenCalledWith("42")
  })

  test("a legacy workspace stamped with the root tenant falls back to its own owner", async () => {
    const result = await resolveOwnerForWorkspace({
      ownerId: "reseller-1",
      tenantId: "1",
    } as never)

    expect(result).toBe("reseller-1")
    expect(mockResolveTenantOwnerId).not.toHaveBeenCalled()
  })

  test("falls back to the workspace owner when the tenant has no resolvable owner", async () => {
    mockResolveTenantOwnerId.mockResolvedValue(null)

    const result = await resolveOwnerForWorkspace({
      ownerId: "workspace-owner-1",
      tenantId: "42",
    } as never)

    expect(result).toBe("workspace-owner-1")
  })
})
