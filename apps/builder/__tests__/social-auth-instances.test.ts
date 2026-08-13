// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"

const ROOT_TENANT_ID = "1"
const SOCIAL_PROVIDERS = ["google", "facebook"] as const

const FACEBOOK_SSO_SCOPES = ["email", "public_profile", "pages_messaging"]

const {
  mockCreateAuth,
  mockFindDecryptedPlatform,
  mockResolveForOwner,
  mockResolveTenantByDomain,
  mockResolveTenantOwnerId,
  mockUpgradeFacebookAccount,
} = vi.hoisted(() => ({
  // createAuth is mocked to a cheap stub tagged by the (provider, clientId) it
  // was built with, so we can assert which app an instance signs in with and
  // that instances are reused per credential rather than rebuilt.
  mockCreateAuth: vi.fn(
    (config: {
      socialCredentials?: Record<string, { clientId: string } | null>
    }) => {
      const [provider, credential] = Object.entries(
        config.socialCredentials ?? {},
      )[0] ?? [null, null]
      return { provider, clientId: credential?.clientId ?? null }
    },
  ),
  mockFindDecryptedPlatform: vi.fn(),
  mockResolveForOwner: vi.fn(),
  mockResolveTenantByDomain: vi.fn(),
  mockResolveTenantOwnerId: vi.fn(),
  // upgradeFacebookAccount(credential) returns a hook function; the mock
  // returns a stub function so we can assert the credential it was built with.
  mockUpgradeFacebookAccount: vi.fn(() => vi.fn()),
}))

vi.mock("@chatbotx.io/auth/server", () => ({
  createAuth: mockCreateAuth,
  SOCIAL_PROVIDERS,
}))

vi.mock("@chatbotx.io/auth/tenant", () => ({
  resolveTenantByDomain: mockResolveTenantByDomain,
  resolveTenantOwnerId: mockResolveTenantOwnerId,
}))

vi.mock("@/lib/auth/on-user-created", () => ({
  onUserCreated: vi.fn(),
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

vi.mock("@/lib/auth/upgrade-facebook-account", () => ({
  FACEBOOK_SSO_SCOPES,
  upgradeFacebookAccount: mockUpgradeFacebookAccount,
}))

const mockIsCommunity = vi.fn(() => false)
vi.mock("@/env", () => ({
  isCommunity: mockIsCommunity,
  isCloud: vi.fn(() => false),
}))

const credential = (clientId: string, clientSecret = "secret") => ({
  config: { clientId, clientSecret, verifyToken: "token", version: "v1" },
})

// Fresh module (and thus a fresh instance cache) per test.
async function loadModule() {
  vi.resetModules()
  return await import("@/lib/auth/auth-instances")
}

beforeEach(() => {
  vi.clearAllMocks()
  mockIsCommunity.mockReturnValue(false)
})

describe("isSocialLoginEnabledForTenant — google", () => {
  test("root tenant resolves the platform google credential", async () => {
    mockFindDecryptedPlatform.mockResolvedValue(credential("platform-client"))
    const { isSocialLoginEnabledForTenant } = await loadModule()

    expect(await isSocialLoginEnabledForTenant(ROOT_TENANT_ID, "google")).toBe(
      true,
    )
    expect(mockFindDecryptedPlatform).toHaveBeenCalledWith({ type: "google" })
    expect(mockResolveForOwner).not.toHaveBeenCalled()
  })

  test("reseller tenant resolves the owner google credential", async () => {
    mockResolveTenantOwnerId.mockResolvedValue("owner-1")
    mockResolveForOwner.mockResolvedValue(credential("reseller-client"))
    const { isSocialLoginEnabledForTenant } = await loadModule()

    expect(await isSocialLoginEnabledForTenant("42", "google")).toBe(true)
    expect(mockResolveForOwner).toHaveBeenCalledWith({
      ownerId: "owner-1",
      type: "google",
    })
  })

  test("an incomplete credential (missing secret) is disabled", async () => {
    mockFindDecryptedPlatform.mockResolvedValue({
      config: {
        clientId: "platform-client",
        clientSecret: "",
        verifyToken: "t",
      },
    })
    const { isSocialLoginEnabledForTenant } = await loadModule()

    expect(await isSocialLoginEnabledForTenant(ROOT_TENANT_ID, "google")).toBe(
      false,
    )
  })
})

describe("isSocialLoginEnabledForTenant — facebook reuses the messenger app", () => {
  test("root tenant resolves the platform messenger credential", async () => {
    mockFindDecryptedPlatform.mockResolvedValue(credential("meta-app"))
    const { isSocialLoginEnabledForTenant } = await loadModule()

    expect(
      await isSocialLoginEnabledForTenant(ROOT_TENANT_ID, "facebook"),
    ).toBe(true)
    expect(mockFindDecryptedPlatform).toHaveBeenCalledWith({
      type: "messenger",
    })
  })

  test("reseller tenant resolves the owner messenger credential", async () => {
    mockResolveTenantOwnerId.mockResolvedValue("owner-9")
    mockResolveForOwner.mockResolvedValue(credential("reseller-meta-app"))
    const { isSocialLoginEnabledForTenant } = await loadModule()

    expect(await isSocialLoginEnabledForTenant("77", "facebook")).toBe(true)
    expect(mockResolveForOwner).toHaveBeenCalledWith({
      ownerId: "owner-9",
      type: "messenger",
    })
  })
})

describe("resolveEnabledProvidersForDomain", () => {
  test("maps the domain to a tenant and returns only the enabled providers", async () => {
    mockResolveTenantByDomain.mockResolvedValue("42")
    mockResolveTenantOwnerId.mockResolvedValue("owner-1")
    // Google resolves (messenger does not) for this reseller owner.
    mockResolveForOwner.mockImplementation(({ type }: { type: string }) =>
      Promise.resolve(type === "google" ? credential("g-client") : undefined),
    )
    const { resolveEnabledProvidersForDomain } = await loadModule()

    expect(
      await resolveEnabledProvidersForDomain(
        "brand.example.com",
        SOCIAL_PROVIDERS,
      ),
    ).toEqual(["google"])
    expect(mockResolveTenantByDomain).toHaveBeenCalledWith("brand.example.com")
  })
})

describe("getSocialAuthForTenant", () => {
  test("reuses one instance per clientId and builds the provider config", async () => {
    mockFindDecryptedPlatform.mockResolvedValue(credential("platform-client"))
    const { getSocialAuthForTenant } = await loadModule()

    const first = await getSocialAuthForTenant(ROOT_TENANT_ID, "google")
    const second = await getSocialAuthForTenant(ROOT_TENANT_ID, "google")

    expect(first).toBe(second)
    expect(mockCreateAuth).toHaveBeenCalledTimes(1)
    expect(mockCreateAuth).toHaveBeenCalledWith(
      expect.objectContaining({
        socialCredentials: {
          google: { clientId: "platform-client", clientSecret: "secret" },
        },
      }),
    )
  })

  test("keeps separate caches per provider for the same clientId", async () => {
    // Same Meta-style clientId resolves for both providers, but each provider
    // must get its own instance (its own socialProviders config).
    mockFindDecryptedPlatform.mockResolvedValue(credential("shared-id"))
    const { getSocialAuthForTenant } = await loadModule()

    const google = await getSocialAuthForTenant(ROOT_TENANT_ID, "google")
    const facebook = await getSocialAuthForTenant(ROOT_TENANT_ID, "facebook")

    expect(google).not.toBe(facebook)
    expect(mockCreateAuth).toHaveBeenCalledTimes(2)
  })

  test("builds a single disabled instance when no credential resolves", async () => {
    mockFindDecryptedPlatform.mockResolvedValue(undefined)
    const { getSocialAuthForTenant } = await loadModule()

    const a = await getSocialAuthForTenant(ROOT_TENANT_ID, "google")
    const b = await getSocialAuthForTenant(ROOT_TENANT_ID, "google")

    expect(a).toBe(b)
    expect(mockCreateAuth).toHaveBeenCalledWith(
      expect.objectContaining({
        socialCredentials: { google: null },
      }),
    )
  })

  test("facebook requests Messenger-grade scopes and upgrades the token, keyed to the resolved credential", async () => {
    mockFindDecryptedPlatform.mockResolvedValue(credential("meta-app"))
    const { getSocialAuthForTenant } = await loadModule()

    await getSocialAuthForTenant(ROOT_TENANT_ID, "facebook")

    expect(mockCreateAuth).toHaveBeenCalledWith(
      expect.objectContaining({
        socialCredentials: {
          facebook: expect.objectContaining({
            clientId: "meta-app",
            clientSecret: "secret",
          }),
        },
        socialScopes: { facebook: FACEBOOK_SSO_SCOPES },
        upgradeOAuthAccount: expect.any(Function),
      }),
    )
    expect(mockUpgradeFacebookAccount).toHaveBeenCalledWith({
      clientId: "meta-app",
      clientSecret: "secret",
      version: "v1",
    })
  })

  test("google does not get facebook-only scope/upgrade wiring", async () => {
    mockFindDecryptedPlatform.mockResolvedValue(credential("platform-client"))
    const { getSocialAuthForTenant } = await loadModule()

    await getSocialAuthForTenant(ROOT_TENANT_ID, "google")

    const call = mockCreateAuth.mock.calls[0]?.[0]
    expect(call).not.toHaveProperty("socialScopes")
    expect(call).not.toHaveProperty("upgradeOAuthAccount")
  })

  test("disabled facebook (no credential) skips scope/upgrade wiring", async () => {
    mockFindDecryptedPlatform.mockResolvedValue(undefined)
    const { getSocialAuthForTenant } = await loadModule()

    await getSocialAuthForTenant(ROOT_TENANT_ID, "facebook")

    const call = mockCreateAuth.mock.calls[0]?.[0]
    expect(call).not.toHaveProperty("socialScopes")
    expect(call).not.toHaveProperty("upgradeOAuthAccount")
    expect(mockUpgradeFacebookAccount).not.toHaveBeenCalled()
  })

  test("a version-only credential change (same clientId/secret) busts the cache", async () => {
    mockFindDecryptedPlatform.mockResolvedValueOnce({
      config: {
        clientId: "meta-app",
        clientSecret: "secret",
        verifyToken: "token",
        version: "v22.0",
      },
    })
    const { getSocialAuthForTenant } = await loadModule()

    const first = await getSocialAuthForTenant(ROOT_TENANT_ID, "facebook")

    mockFindDecryptedPlatform.mockResolvedValueOnce({
      config: {
        clientId: "meta-app",
        clientSecret: "secret",
        verifyToken: "token",
        version: "v23.0",
      },
    })
    const second = await getSocialAuthForTenant(ROOT_TENANT_ID, "facebook")

    expect(first).not.toBe(second)
    expect(mockCreateAuth).toHaveBeenCalledTimes(2)
    expect(mockUpgradeFacebookAccount).toHaveBeenNthCalledWith(1, {
      clientId: "meta-app",
      clientSecret: "secret",
      version: "v22.0",
    })
    expect(mockUpgradeFacebookAccount).toHaveBeenNthCalledWith(2, {
      clientId: "meta-app",
      clientSecret: "secret",
      version: "v23.0",
    })
  })
})
