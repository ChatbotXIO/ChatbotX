// @vitest-environment node
import { beforeEach, describe, expect, test, vi } from "vitest"

const isSignUpDisabled = vi.fn()
const resolveGenericOAuthConfig = vi.fn()
const warnIfGenericOAuthUnlicensed = vi.fn()
vi.mock("@chatbotx.io/auth/server", () => ({
  isSignUpDisabled: () => isSignUpDisabled(),
  resolveGenericOAuthConfig: () => resolveGenericOAuthConfig(),
  warnIfGenericOAuthUnlicensed: (isLicensed: boolean) =>
    warnIfGenericOAuthUnlicensed(isLicensed),
  SOCIAL_PROVIDERS: ["google", "facebook"] as const,
}))

const resolveTenantByDomain = vi.fn()
vi.mock("@chatbotx.io/auth/tenant", () => ({ resolveTenantByDomain }))

const hasEnterpriseFeatures = vi.fn()
vi.mock("@chatbotx.io/business", () => ({
  hasEnterpriseFeatures: () => hasEnterpriseFeatures(),
}))

vi.mock("@/env", () => ({
  env: {
    NEXT_PUBLIC_AUTH_OAUTH_DISPLAY_NAME: undefined,
    NEXT_PUBLIC_AUTH_OAUTH_LOGO_URL: undefined,
  },
}))

const resolveInvitationFromCookie = vi.fn()
vi.mock("@/features/invitations/lib/invitation-cookie", () => ({
  resolveInvitationFromCookie: (tenantId: string) =>
    resolveInvitationFromCookie(tenantId),
}))

const resolveEnabledProvidersForDomain = vi.fn()
vi.mock("@/lib/auth/auth-instances", () => ({
  resolveEnabledProvidersForDomain: (
    domain: string,
    providers: readonly string[],
  ) => resolveEnabledProvidersForDomain(domain, providers),
}))

const getDomainFromHeader = vi.fn()
vi.mock("@/lib/domain", () => ({ getDomainFromHeader }))

const { resolveAuthPageOptions, resolveGenericOAuthButton } = await import(
  "../src/lib/auth/auth-page-options"
)

beforeEach(() => {
  vi.clearAllMocks()
  getDomainFromHeader.mockResolvedValue("chat.acme.com")
  resolveTenantByDomain.mockResolvedValue("tenant-acme")
  resolveEnabledProvidersForDomain.mockResolvedValue(["google"])
  resolveInvitationFromCookie.mockResolvedValue(null)
  isSignUpDisabled.mockReturnValue(false)
  resolveGenericOAuthConfig.mockReturnValue(null)
  hasEnterpriseFeatures.mockResolvedValue(true)
})

describe("resolveGenericOAuthButton", () => {
  test("is null when no OIDC provider is configured, even when licensed", async () => {
    resolveGenericOAuthConfig.mockReturnValue(null)
    hasEnterpriseFeatures.mockResolvedValue(true)

    await expect(resolveGenericOAuthButton()).resolves.toBeNull()
    expect(warnIfGenericOAuthUnlicensed).toHaveBeenCalledWith(true)
  })

  test("is null when configured but the enterprise license check fails", async () => {
    resolveGenericOAuthConfig.mockReturnValue({ providerId: "oidc" })
    hasEnterpriseFeatures.mockResolvedValue(false)

    await expect(resolveGenericOAuthButton()).resolves.toBeNull()
    expect(warnIfGenericOAuthUnlicensed).toHaveBeenCalledWith(false)
  })

  test("renders the button when configured and licensed", async () => {
    resolveGenericOAuthConfig.mockReturnValue({ providerId: "oidc" })
    hasEnterpriseFeatures.mockResolvedValue(true)

    await expect(resolveGenericOAuthButton()).resolves.toEqual({
      displayName: "SSO",
      logoUrl: undefined,
    })
  })
})

describe("resolveAuthPageOptions — signUpAllowed", () => {
  test("is true when signup is not disabled, regardless of any invitation", async () => {
    isSignUpDisabled.mockReturnValue(false)
    resolveInvitationFromCookie.mockResolvedValue(null)

    const options = await resolveAuthPageOptions()

    expect(options.signUpAllowed).toBe(true)
  })

  test("is false when signup is disabled and there is no live invitation cookie", async () => {
    isSignUpDisabled.mockReturnValue(true)
    resolveInvitationFromCookie.mockResolvedValue(null)

    const options = await resolveAuthPageOptions()

    expect(options.signUpAllowed).toBe(false)
  })

  test("is true when signup is disabled but a live invitation cookie is present", async () => {
    isSignUpDisabled.mockReturnValue(true)
    resolveInvitationFromCookie.mockResolvedValue({ id: "invite" })

    const options = await resolveAuthPageOptions()

    expect(options.signUpAllowed).toBe(true)
    expect(resolveInvitationFromCookie).toHaveBeenCalledWith("tenant-acme")
  })
})
