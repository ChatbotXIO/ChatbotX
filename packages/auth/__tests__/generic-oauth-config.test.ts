import type * as BetterAuth from "better-auth"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

const { betterAuthMock, genericOAuthMock } = vi.hoisted(() => ({
  betterAuthMock: vi.fn((config: Record<string, unknown>) => config),
  genericOAuthMock: vi.fn((options: Record<string, unknown>) => ({
    id: "generic-oauth",
    ...options,
  })),
}))

vi.mock("better-auth", async () => {
  const actual = await vi.importActual<BetterAuth>("better-auth")
  return { ...actual, betterAuth: betterAuthMock }
})

vi.mock("better-auth/adapters/drizzle", () => ({
  drizzleAdapter: () => ({}),
}))

vi.mock("better-auth/next-js", () => ({
  nextCookies: () => ({ id: "next-cookies" }),
}))

vi.mock("better-auth/plugins", () => ({
  anonymous: () => ({ id: "anonymous" }),
  bearer: () => ({ id: "bearer" }),
  genericOAuth: genericOAuthMock,
  magicLink: () => ({ id: "magic-link" }),
  jwt: () => ({ id: "jwt" }),
  oneTimeToken: () => ({ id: "one-time-token" }),
}))

vi.mock("@better-auth/mcp", () => ({
  mcp: () => ({ id: "mcp" }),
}))

vi.mock("@chatbotx.io/database/client", () => ({ db: {} }))

vi.mock("@chatbotx.io/database/schema", () => ({
  accountModel: {},
  oauthAccessTokenModel: {},
  jwkModel: {},
  oauthClientModel: {},
  oauthClientAssertionModel: {},
  oauthClientResourceModel: {},
  oauthRefreshTokenModel: {},
  oauthResourceModel: {},
  oauthConsentModel: {},
  sessionModel: {},
  userModel: {},
  verificationModel: {},
}))

vi.mock("@chatbotx.io/business", () => ({
  customDomainService: { listActiveDomains: vi.fn().mockResolvedValue([]) },
  invitationService: { findActiveByCode: vi.fn().mockResolvedValue(null) },
  platformCredentialService: {
    findDecryptedPlatform: vi.fn(),
    findPlatform: vi.fn(),
  },
  resolveTenantSettingsByDomain: vi.fn(),
}))

vi.mock("@chatbotx.io/utils", () => ({
  createId: () => "test-id",
  getPublicOriginFromRequest: vi.fn(),
  parseEnvBool: (value: unknown) => value === true || value === "true",
}))

vi.mock("@chatbotx.io/mail", () => ({
  DEFAULT_FORGOT_PASSWORD_SUBJECT: "reset",
  DEFAULT_MAGIC_LINK_SUBJECT: "magic",
  DEFAULT_SIGNUP_SUBJECT: "signup",
  sendMagicLink: vi.fn(),
  sendResetPassword: vi.fn(),
  sendSignUpVerification: vi.fn(),
}))

type GenericOAuthPlugin = {
  id: string
  config: Array<{
    discoveryUrl?: string
    pkce: boolean
    redirectURI: string
    scopes: string[]
  }>
}

type AuthConfig = {
  account: { accountLinking: { trustedProviders: string[] } }
  plugins: Array<{ id: string }>
}

const getAuthConfig = async (): Promise<AuthConfig> => {
  // Environment modules are reset between cases, so createAuth must be imported
  // after each case's variables are installed.
  const { createAuth } = await import("../src/server")
  createAuth({})
  return betterAuthMock.mock.calls.at(-1)?.[0] as AuthConfig
}

const getGenericOAuthPlugin = (
  config: AuthConfig,
): GenericOAuthPlugin | undefined =>
  config.plugins.find((plugin) => plugin.id === "generic-oauth") as
    | GenericOAuthPlugin
    | undefined

describe("generic OAuth configuration", () => {
  beforeEach(() => {
    vi.resetModules()
    betterAuthMock.mockClear()
    genericOAuthMock.mockClear()
    vi.stubEnv("SKIP_ENV_CHECK", "true")
    vi.stubEnv("NEXT_PUBLIC_BUILDER_URL", "https://app.example.com")
    vi.stubEnv("NEXT_PUBLIC_BROKER_URL", "https://broker.example.com")
    vi.stubEnv("BETTER_AUTH_SECRET", "test-secret")
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  test("does not register the plugin when OAuth is disabled", async () => {
    vi.stubEnv("AUTH_OAUTH_ENABLED", "false")

    expect(getGenericOAuthPlugin(await getAuthConfig())).toBeUndefined()
  })

  test("registers an enabled provider with parsed scopes, PKCE, and broker callback", async () => {
    vi.stubEnv("AUTH_OAUTH_ENABLED", "true")
    vi.stubEnv("AUTH_OAUTH_CLIENT_ID", "test-client")
    vi.stubEnv("AUTH_OAUTH_CLIENT_SECRET", "test-secret")
    vi.stubEnv("AUTH_OAUTH_AUTH_URL", "https://idp.example.com/authorize")
    vi.stubEnv("AUTH_OAUTH_TOKEN_URL", "https://idp.example.com/token")
    vi.stubEnv("AUTH_OAUTH_SCOPES", "openid, email, profile")

    const plugin = getGenericOAuthPlugin(await getAuthConfig())

    expect(plugin?.config[0]).toMatchObject({
      pkce: true,
      redirectURI: "https://broker.example.com/api/auth/callback/oidc",
      scopes: ["openid", "email", "profile"],
    })
  })

  test("registers an enabled provider configured with OIDC discovery", async () => {
    vi.stubEnv("AUTH_OAUTH_ENABLED", "true")
    vi.stubEnv("AUTH_OAUTH_CLIENT_ID", "test-client")
    vi.stubEnv("AUTH_OAUTH_CLIENT_SECRET", "test-secret")
    vi.stubEnv(
      "AUTH_OAUTH_DISCOVERY_URL",
      "https://idp.example.com/.well-known/openid-configuration",
    )

    expect(
      getGenericOAuthPlugin(await getAuthConfig())?.config[0],
    ).toMatchObject({
      discoveryUrl: "https://idp.example.com/.well-known/openid-configuration",
      pkce: true,
      redirectURI: "https://broker.example.com/api/auth/callback/oidc",
    })
  })

  test("uses default scopes when scopes are omitted", async () => {
    vi.stubEnv("AUTH_OAUTH_ENABLED", "true")
    vi.stubEnv("AUTH_OAUTH_CLIENT_ID", "test-client")
    vi.stubEnv("AUTH_OAUTH_CLIENT_SECRET", "test-secret")
    vi.stubEnv("AUTH_OAUTH_AUTH_URL", "https://idp.example.com/authorize")
    vi.stubEnv("AUTH_OAUTH_TOKEN_URL", "https://idp.example.com/token")

    expect(
      getGenericOAuthPlugin(await getAuthConfig())?.config[0].scopes,
    ).toEqual(["openid", "email", "profile"])
  })

  test("does not register an incomplete provider", async () => {
    vi.stubEnv("AUTH_OAUTH_ENABLED", "true")
    vi.stubEnv("AUTH_OAUTH_CLIENT_SECRET", "test-secret")
    vi.stubEnv("AUTH_OAUTH_AUTH_URL", "https://idp.example.com/authorize")
    vi.stubEnv("AUTH_OAUTH_TOKEN_URL", "https://idp.example.com/token")

    expect(getGenericOAuthPlugin(await getAuthConfig())).toBeUndefined()
  })

  test("trusts the provider email only when explicitly configured", async () => {
    vi.stubEnv("AUTH_OAUTH_TRUST_EMAIL", "true")
    expect(
      (await getAuthConfig()).account.accountLinking.trustedProviders,
    ).toContain("oidc")

    vi.resetModules()
    betterAuthMock.mockClear()
    vi.stubEnv("AUTH_OAUTH_TRUST_EMAIL", "")
    expect(
      (await getAuthConfig()).account.accountLinking.trustedProviders,
    ).not.toContain("oidc")
  })

  test("does not trust the provider email when email trust is disabled", async () => {
    vi.stubEnv("AUTH_OAUTH_TRUST_EMAIL", "false")

    expect(
      (await getAuthConfig()).account.accountLinking.trustedProviders,
    ).not.toContain("oidc")
  })
})
