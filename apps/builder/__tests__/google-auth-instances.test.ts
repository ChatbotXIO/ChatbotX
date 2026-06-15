// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"

const ROOT_TENANT_ID = "1"

const {
  mockCreateAuth,
  mockFindDecryptedPlatform,
  mockResolveForOwner,
  mockResolveTenantByDomain,
  mockResolveTenantOwnerId,
} = vi.hoisted(() => ({
  // createAuth is mocked to a cheap stub tagged by the clientId it was built
  // with, so we can assert which Google app an instance signs in with and that
  // instances are reused per clientId rather than rebuilt.
  mockCreateAuth: vi.fn(
    (config: { googleCredential?: { clientId: string } | null }) => ({
      clientId: config.googleCredential?.clientId ?? null,
    }),
  ),
  mockFindDecryptedPlatform: vi.fn(),
  mockResolveForOwner: vi.fn(),
  mockResolveTenantByDomain: vi.fn(),
  mockResolveTenantOwnerId: vi.fn(),
}))

vi.mock("@chatbotx.io/auth/server", () => ({
  createAuth: mockCreateAuth,
}))

vi.mock("@chatbotx.io/auth/tenant", () => ({
  resolveTenantByDomain: mockResolveTenantByDomain,
  resolveTenantOwnerId: mockResolveTenantOwnerId,
}))

vi.mock("@chatbotx.io/business", () => ({
  platformCredentialService: {
    findDecryptedPlatform: mockFindDecryptedPlatform,
    resolveForOwner: mockResolveForOwner,
  },
}))

vi.mock("@chatbotx.io/database/schema", () => ({
  ROOT_TENANT_ID,
}))

const credential = (clientId: string, clientSecret = "secret") => ({
  config: { clientId, clientSecret, verifyToken: "token" },
})

// Fresh module (and thus a fresh instance cache) per test.
async function loadModule() {
  vi.resetModules()
  return await import("@/lib/auth/auth-instances")
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe("isGoogleLoginEnabledForTenant", () => {
  test("root tenant resolves the platform credential", async () => {
    mockFindDecryptedPlatform.mockResolvedValue(credential("platform-client"))
    const { isGoogleLoginEnabledForTenant } = await loadModule()

    expect(await isGoogleLoginEnabledForTenant(ROOT_TENANT_ID)).toBe(true)
    expect(mockFindDecryptedPlatform).toHaveBeenCalledWith({ type: "google" })
    expect(mockResolveForOwner).not.toHaveBeenCalled()
  })

  test("root tenant with no platform credential is disabled", async () => {
    mockFindDecryptedPlatform.mockResolvedValue(undefined)
    const { isGoogleLoginEnabledForTenant } = await loadModule()

    expect(await isGoogleLoginEnabledForTenant(ROOT_TENANT_ID)).toBe(false)
  })

  test("reseller tenant resolves the owner credential (own app or platform fallback)", async () => {
    mockResolveTenantOwnerId.mockResolvedValue("owner-1")
    mockResolveForOwner.mockResolvedValue(credential("reseller-client"))
    const { isGoogleLoginEnabledForTenant } = await loadModule()

    expect(await isGoogleLoginEnabledForTenant("42")).toBe(true)
    expect(mockResolveTenantOwnerId).toHaveBeenCalledWith("42")
    expect(mockResolveForOwner).toHaveBeenCalledWith({
      ownerId: "owner-1",
      type: "google",
    })
  })

  test("reseller tenant with no owner falls back to the platform credential", async () => {
    mockResolveTenantOwnerId.mockResolvedValue(null)
    mockFindDecryptedPlatform.mockResolvedValue(credential("platform-client"))
    const { isGoogleLoginEnabledForTenant } = await loadModule()

    expect(await isGoogleLoginEnabledForTenant("42")).toBe(true)
    expect(mockResolveForOwner).not.toHaveBeenCalled()
    expect(mockFindDecryptedPlatform).toHaveBeenCalledWith({ type: "google" })
  })

  test("an incomplete credential (missing secret) is disabled", async () => {
    mockFindDecryptedPlatform.mockResolvedValue({
      config: {
        clientId: "platform-client",
        clientSecret: "",
        verifyToken: "t",
      },
    })
    const { isGoogleLoginEnabledForTenant } = await loadModule()

    expect(await isGoogleLoginEnabledForTenant(ROOT_TENANT_ID)).toBe(false)
  })
})

describe("isGoogleLoginEnabledForDomain", () => {
  test("maps the domain to a tenant before resolving", async () => {
    mockResolveTenantByDomain.mockResolvedValue("42")
    mockResolveTenantOwnerId.mockResolvedValue("owner-1")
    mockResolveForOwner.mockResolvedValue(credential("reseller-client"))
    const { isGoogleLoginEnabledForDomain } = await loadModule()

    expect(await isGoogleLoginEnabledForDomain("brand.example.com")).toBe(true)
    expect(mockResolveTenantByDomain).toHaveBeenCalledWith("brand.example.com")
  })
})

describe("getGoogleAuthForTenant", () => {
  test("reuses one instance per Google clientId", async () => {
    mockFindDecryptedPlatform.mockResolvedValue(credential("platform-client"))
    const { getGoogleAuthForTenant } = await loadModule()

    const first = await getGoogleAuthForTenant(ROOT_TENANT_ID)
    const second = await getGoogleAuthForTenant(ROOT_TENANT_ID)

    expect(first).toBe(second)
    expect(mockCreateAuth).toHaveBeenCalledTimes(1)
    expect(mockCreateAuth).toHaveBeenCalledWith({
      googleCredential: { clientId: "platform-client", clientSecret: "secret" },
    })
  })

  test("builds distinct instances for distinct Google apps", async () => {
    mockResolveTenantOwnerId.mockImplementation((tenantId: string) =>
      Promise.resolve(`owner-${tenantId}`),
    )
    mockResolveForOwner.mockImplementation(({ ownerId }: { ownerId: string }) =>
      Promise.resolve(credential(`client-${ownerId}`)),
    )
    const { getGoogleAuthForTenant } = await loadModule()

    const reseller1 = await getGoogleAuthForTenant("1001")
    const reseller2 = await getGoogleAuthForTenant("1002")

    expect(reseller1).not.toBe(reseller2)
    expect(mockCreateAuth).toHaveBeenCalledTimes(2)
  })

  test("builds a single disabled instance when no credential resolves", async () => {
    mockFindDecryptedPlatform.mockResolvedValue(undefined)
    const { getGoogleAuthForTenant } = await loadModule()

    const a = await getGoogleAuthForTenant(ROOT_TENANT_ID)
    const b = await getGoogleAuthForTenant(ROOT_TENANT_ID)

    expect(a).toBe(b)
    expect(mockCreateAuth).toHaveBeenCalledWith({ googleCredential: null })
  })
})
