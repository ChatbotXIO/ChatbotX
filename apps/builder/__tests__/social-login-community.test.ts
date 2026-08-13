// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"

const ROOT_TENANT_ID = "1"
const SOCIAL_PROVIDERS = ["google", "facebook"] as const

const {
  mockCreateAuth,
  mockFindDecryptedPlatform,
  mockResolveForOwner,
  mockResolveTenantByDomain,
  mockResolveTenantOwnerId,
} = vi.hoisted(() => ({
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
  FACEBOOK_SSO_SCOPES: ["email", "public_profile"],
  upgradeFacebookAccount: vi.fn(() => vi.fn()),
}))

vi.mock("@/env", () => ({
  isCommunity: vi.fn(() => true),
  isCloud: vi.fn(() => false),
}))

const credential = (clientId: string) => ({
  config: { clientId, clientSecret: "secret", verifyToken: "t", version: "v1" },
})

async function loadModule() {
  vi.resetModules()
  return await import("@/lib/auth/auth-instances")
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe("community edition blocks social login server-side", () => {
  test("social login is disabled even when platform credentials exist", async () => {
    mockFindDecryptedPlatform.mockResolvedValue(credential("platform-client"))
    const { isSocialLoginEnabledForTenant } = await loadModule()

    expect(await isSocialLoginEnabledForTenant(ROOT_TENANT_ID, "google")).toBe(
      false,
    )
    // The credential is never even looked up.
    expect(mockFindDecryptedPlatform).not.toHaveBeenCalled()
  })

  test("the auth instance is built with no social provider", async () => {
    mockFindDecryptedPlatform.mockResolvedValue(credential("platform-client"))
    const { getSocialAuthForTenant } = await loadModule()

    const auth = (await getSocialAuthForTenant(
      ROOT_TENANT_ID,
      "google",
    )) as unknown as { clientId: string | null }

    expect(auth.clientId).toBeNull()
  })

  test("no provider resolves for any tenant or provider", async () => {
    mockResolveTenantOwnerId.mockResolvedValue("owner-1")
    mockResolveForOwner.mockResolvedValue(credential("reseller-client"))
    const { isSocialLoginEnabledForTenant } = await loadModule()

    expect(await isSocialLoginEnabledForTenant("42", "facebook")).toBe(false)
    expect(mockResolveForOwner).not.toHaveBeenCalled()
  })
})
