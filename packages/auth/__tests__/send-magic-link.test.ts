import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  betterAuth: vi.fn((config: Record<string, unknown>) => config),
  findDecryptedForUser: vi.fn(),
  findFirst: vi.fn(),
  getPublicOriginFromRequest: vi.fn(),
  resolvePlatformSmtpTransport: vi.fn(),
  resolveTenantSettingsByDomain: vi.fn(),
  sendMagicLink: vi.fn(),
  tenantFindById: vi.fn(),
}))

vi.mock("better-auth", async () => ({
  ...(await vi.importActual<typeof import("better-auth")>("better-auth")),
  betterAuth: mocks.betterAuth,
}))
vi.mock("better-auth/adapters/drizzle", () => ({ drizzleAdapter: () => ({}) }))
vi.mock("better-auth/next-js", () => ({ nextCookies: () => ({ id: "nc" }) }))
vi.mock("better-auth/plugins", () => ({
  anonymous: () => ({ id: "anonymous" }),
  bearer: () => ({ id: "bearer" }),
  genericOAuth: () => ({ id: "generic-oauth" }),
  jwt: () => ({ id: "jwt" }),
  magicLink: (options: unknown) => ({ id: "magic-link", options }),
  oneTimeToken: () => ({ id: "one-time-token" }),
}))
vi.mock("@better-auth/mcp", () => ({ mcp: () => ({ id: "mcp" }) }))
vi.mock("@chatbotx.io/database/client", () => ({
  db: { query: { userModel: { findFirst: mocks.findFirst } } },
}))
vi.mock("@chatbotx.io/database/schema", () => ({
  ROOT_TENANT_ID: "1",
  accountModel: {},
  jwkModel: {},
  oauthAccessTokenModel: {},
  oauthClientAssertionModel: {},
  oauthClientModel: {},
  oauthClientResourceModel: {},
  oauthConsentModel: {},
  oauthRefreshTokenModel: {},
  oauthResourceModel: {},
  sessionModel: {},
  userModel: {},
  verificationModel: {},
}))
vi.mock("@chatbotx.io/business", () => ({
  customDomainService: { listActiveDomains: vi.fn().mockResolvedValue([]) },
  invitationService: { findActiveByCode: vi.fn().mockResolvedValue(null) },
  platformCredentialService: {
    findDecryptedForUser: mocks.findDecryptedForUser,
    findDecryptedPlatform: vi.fn(),
    findPlatform: vi.fn(),
  },
  resolvePlatformSmtpTransport: mocks.resolvePlatformSmtpTransport,
  resolveTenantSettingsByDomain: mocks.resolveTenantSettingsByDomain,
  tenantService: { findById: mocks.tenantFindById },
  toSmtpTransport: (config: unknown) => ({ config }),
}))
vi.mock("@chatbotx.io/utils", async () => ({
  ...(await vi.importActual<typeof import("@chatbotx.io/utils")>(
    "@chatbotx.io/utils",
  )),
  getPublicOriginFromRequest: mocks.getPublicOriginFromRequest,
}))
vi.mock("@chatbotx.io/mail", () => ({
  DEFAULT_FORGOT_PASSWORD_SUBJECT: "reset",
  DEFAULT_MAGIC_LINK_SUBJECT: "magic",
  DEFAULT_SIGNUP_SUBJECT: "signup",
  sendMagicLink: mocks.sendMagicLink,
  sendResetPassword: vi.fn(),
  sendSignUpVerification: vi.fn(),
}))

type SendMagicLink = (
  data: { email: string; url: string },
  request?: Request,
) => Promise<void>

const loadSendMagicLink = async (): Promise<SendMagicLink> => {
  const { createAuth } = await import("../src/server")
  createAuth({})
  const config = mocks.betterAuth.mock.calls.at(-1)?.[0] as {
    plugins: { id: string; options?: { sendMagicLink: SendMagicLink } }[]
  }
  const plugin = config.plugins.find(({ id }) => id === "magic-link")
  return plugin?.options?.sendMagicLink as SendMagicLink
}

const request = () =>
  new Request("https://brand.example.com/api/auth/sign-in/magic-link", {
    headers: { "x-domain": "brand.example.com" },
  })

const link = "https://app.example.com/api/auth/magic-link/verify?token=t"

describe("magicLink.sendMagicLink", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getPublicOriginFromRequest.mockReturnValue(
      "https://brand.example.com",
    )
    mocks.resolveTenantSettingsByDomain.mockResolvedValue({
      name: "Brand",
      logoLightUrl: null,
      magicLinkEmailTemplate: null,
    })
    mocks.resolvePlatformSmtpTransport.mockResolvedValue(null)
    mocks.findFirst.mockResolvedValue({ name: "Sub", email: "a@b.test" })
  })

  test("rewrites the link hostname to the request's public host", async () => {
    const send = await loadSendMagicLink()

    await send({ email: "a@b.test", url: link }, request())

    expect(mocks.sendMagicLink).toHaveBeenCalledTimes(1)
    const props = mocks.sendMagicLink.mock.calls[0]?.[1] as { magicUrl: string }
    expect(new URL(props.magicUrl).hostname).toBe("brand.example.com")
    expect(new URL(props.magicUrl).searchParams.get("token")).toBe("t")
  })

  test("sends nothing to a placeholder address", async () => {
    const send = await loadSendMagicLink()

    await send(
      { email: "fb-123@facebook.placeholder.invalid", url: link },
      request(),
    )

    expect(mocks.findFirst).not.toHaveBeenCalled()
    expect(mocks.sendMagicLink).not.toHaveBeenCalled()
  })

  test("rejects an email that is not registered in the tenant", async () => {
    mocks.findFirst.mockResolvedValue(undefined)
    const send = await loadSendMagicLink()

    await expect(
      send({ email: "nobody@b.test", url: link }, request()),
    ).rejects.toMatchObject({
      body: { message: "Your email is not registered with Brand" },
    })
    expect(mocks.sendMagicLink).not.toHaveBeenCalled()
  })

  test("requires a request object", async () => {
    const send = await loadSendMagicLink()

    await expect(
      send({ email: "a@b.test", url: link }, undefined),
    ).rejects.toMatchObject({ body: { message: "Unknown request" } })
  })
})
