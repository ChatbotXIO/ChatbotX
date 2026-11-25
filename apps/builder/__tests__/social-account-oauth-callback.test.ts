// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  assertWorkspaceSuperAdmin: vi.fn(),
  auditRecord: vi.fn(),
  connect: vi.fn(),
  connectAccount: vi.fn(),
  consumeOAuthNonce: vi.fn(),
  loggerDebug: vi.fn(),
  matchesOAuthNonce: vi.fn(),
  loggerError: vi.fn(),
  loggerInfo: vi.fn(),
  requiresReconnect: vi.fn(),
}))

vi.mock("@/lib/auth/assert-workspace-super-admin", () => ({
  assertWorkspaceSuperAdmin: mocks.assertWorkspaceSuperAdmin,
}))
vi.mock("@/lib/oauth-state-nonce", () => ({
  consumeOAuthNonce: mocks.consumeOAuthNonce,
  matchesOAuthNonce: mocks.matchesOAuthNonce,
}))
vi.mock("@chatbotx.io/business", () => ({
  socialAccountService: { connect: mocks.connect },
}))
vi.mock("@chatbotx.io/business/audit", () => ({
  auditService: { record: mocks.auditRecord },
}))
vi.mock("@chatbotx.io/channel-registry/social-account", () => ({
  socialAccountProviders: {
    facebook: {
      connect: mocks.connectAccount,
      requiresReconnect: mocks.requiresReconnect,
    },
    instagram: {
      connect: mocks.connectAccount,
      requiresReconnect: mocks.requiresReconnect,
    },
    threads: {
      connect: mocks.connectAccount,
      requiresReconnect: mocks.requiresReconnect,
    },
    tiktok: {
      connect: mocks.connectAccount,
      requiresReconnect: mocks.requiresReconnect,
    },
  },
}))
vi.mock("@/lib/log", () => ({
  logger: {
    debug: mocks.loggerDebug,
    error: mocks.loggerError,
    info: mocks.loggerInfo,
  },
}))
vi.mock("@/features/social-accounts/lib/start-social-account-oauth", () => ({
  SOCIAL_ACCOUNT_OAUTH_FLOW: "socialAccount",
}))

const {
  cancelSocialAccountConnect,
  completeSocialAccountConnect,
  isOwnSocialAccountCallback,
} = await import("@/app/integrations/[...integration]/callback-social-account")
const { ChatbotXException } = await import("@chatbotx.io/business/errors")

const input = {
  callbackUrl: "https://builder.example.test/integrations/tiktok/callback",
  code: "auth-code",
  credentialConfig: {
    clientId: "app",
    clientSecret: "secret",
    version: "v23.0",
  },
  provider: "tiktok" as const,
  request: { ipAddress: "203.0.113.7", userAgent: "vitest" },
  state: { flow: "socialAccount", nonce: "n-1", socialProvider: "tiktok" },
  userId: "user-1",
  workspaceId: "ws-1",
}

const account = { externalAccountId: "tt-1", provider: "tiktok" }

beforeEach(() => {
  vi.clearAllMocks()
  mocks.assertWorkspaceSuperAdmin.mockResolvedValue(undefined)
  mocks.consumeOAuthNonce.mockResolvedValue(true)
  mocks.connectAccount.mockResolvedValue(account)
  mocks.connect.mockResolvedValue({})
  mocks.requiresReconnect.mockReturnValue(false)
})

describe("completeSocialAccountConnect", () => {
  test.each([
    ["no flow marker", { ...input.state, flow: undefined }],
    ["a different network", { ...input.state, socialProvider: "threads" }],
    ["no network", { ...input.state, socialProvider: undefined }],
    ["no nonce", { ...input.state, nonce: undefined }],
  ])("a state with %s is a 404 and nothing is called", async (_name, state) => {
    const outcome = await completeSocialAccountConnect({ ...input, state })

    expect(outcome.notFound).toBe(true)
    expect(mocks.consumeOAuthNonce).not.toHaveBeenCalled()
    expect(mocks.connectAccount).not.toHaveBeenCalled()
    expect(mocks.connect).not.toHaveBeenCalled()
  })

  test("a missing nonce cookie is a session-expired result, before any provider call", async () => {
    mocks.consumeOAuthNonce.mockResolvedValue(false)

    const outcome = await completeSocialAccountConnect(input)

    expect(outcome.notFound).toBe(false)
    expect(outcome.result).toMatchObject({
      ok: false,
      reason: "sessionExpired",
    })
    expect(mocks.assertWorkspaceSuperAdmin).not.toHaveBeenCalled()
    expect(mocks.connectAccount).not.toHaveBeenCalled()
  })

  test("the nonce is single use: it is consumed once, with the state's value", async () => {
    await completeSocialAccountConnect(input)

    expect(mocks.consumeOAuthNonce).toHaveBeenCalledTimes(1)
    expect(mocks.consumeOAuthNonce).toHaveBeenCalledWith("n-1")
  })

  test("a non-super-admin is a 404 and the code is never exchanged", async () => {
    mocks.assertWorkspaceSuperAdmin.mockRejectedValue(new Error("forbidden"))

    const outcome = await completeSocialAccountConnect(input)

    expect(outcome.notFound).toBe(true)
    expect(mocks.connectAccount).not.toHaveBeenCalled()
    expect(mocks.connect).not.toHaveBeenCalled()
  })

  test("the account is read from the platform and stored for the workspace and member", async () => {
    const outcome = await completeSocialAccountConnect(input)

    expect(mocks.connectAccount).toHaveBeenCalledWith({
      callbackUrl: input.callbackUrl,
      code: "auth-code",
      settings: input.credentialConfig,
    })
    expect(mocks.connect).toHaveBeenCalledWith({
      account,
      connectedById: "user-1",
      workspaceId: "ws-1",
    })
    expect(outcome).toEqual({
      notFound: false,
      result: { missingPermissions: [], ok: true, reason: null },
    })
  })

  test("a TikTok connect reports the withheld scope by name", async () => {
    const exception = new ChatbotXException(
      "denied",
      "permissionNotGranted",
      422,
    )
    exception.data = { permissions: "video.publish" }
    mocks.connect.mockRejectedValue(exception)
    expect((await completeSocialAccountConnect(input)).result).toEqual({
      missingPermissions: ["video.publish"],
      ok: false,
      reason: "permissionNotGranted",
    })
  })

  test("a successful connect is audited with the request origin", async () => {
    await completeSocialAccountConnect(input)

    expect(mocks.auditRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        ipAddress: "203.0.113.7",
        userAgent: "vitest",
        userId: "user-1",
        workspaceId: "ws-1",
      }),
    )
  })

  test("missing permissions are reported verbatim and nothing is audited", async () => {
    const exception = new ChatbotXException(
      "denied",
      "permissionNotGranted",
      422,
    )
    exception.data = {
      permissions: "video.publish, video.upload",
    }
    mocks.connect.mockRejectedValue(exception)

    const outcome = await completeSocialAccountConnect(input)

    expect(outcome.result).toEqual({
      missingPermissions: ["video.publish", "video.upload"],
      ok: false,
      reason: "permissionNotGranted",
    })
    expect(mocks.auditRecord).not.toHaveBeenCalled()
  })

  test("a platform failure is a failed result and is not audited", async () => {
    mocks.connectAccount.mockRejectedValue(new Error("graph down"))

    const outcome = await completeSocialAccountConnect(input)

    expect(outcome.result).toMatchObject({ ok: false, reason: "failed" })
    expect(mocks.loggerError).toHaveBeenCalled()
    expect(mocks.auditRecord).not.toHaveBeenCalled()
  })

  test("a rejected token during the exchange asks the person to sign in again", async () => {
    mocks.connectAccount.mockRejectedValue(new Error("bad code"))
    mocks.requiresReconnect.mockReturnValue(true)

    const outcome = await completeSocialAccountConnect(input)

    expect(outcome.result).toMatchObject({
      ok: false,
      reason: "sessionExpired",
    })
  })
})

describe("cancelSocialAccountConnect", () => {
  test("a forged cancel (nonce differs from the cookie) leaves the nonce alone", async () => {
    mocks.matchesOAuthNonce.mockResolvedValue(false)

    const result = await cancelSocialAccountConnect({ nonce: "forged" })

    expect(result).toMatchObject({ ok: false, reason: "sessionExpired" })
    expect(mocks.consumeOAuthNonce).not.toHaveBeenCalled()
  })

  test("a genuine cancel consumes the nonce and reports a cancellation", async () => {
    mocks.matchesOAuthNonce.mockResolvedValue(true)

    const result = await cancelSocialAccountConnect({ nonce: "n-1" })

    expect(result).toMatchObject({ ok: false, reason: "cancelled" })
    expect(mocks.consumeOAuthNonce).toHaveBeenCalledTimes(1)
    expect(mocks.consumeOAuthNonce).toHaveBeenCalledWith("n-1")
  })
})

describe("isOwnSocialAccountCallback", () => {
  test("the TikTok callback accepts a TikTok state", () => {
    expect(
      isOwnSocialAccountCallback("tiktok", { socialProvider: "tiktok" }),
    ).toBe(true)
  })

  test.each([
    ["tiktok", "facebook"],
    ["tiktok", undefined],
    ["messenger", "facebook"],
    ["messenger", "tiktok"],
    ["instagram", "instagram"],
    ["threads", "threads"],
    ["instagramFacebook", "instagram"],
    ["zalo", "tiktok"],
    ["facebookAds", "tiktok"],
    ["googleSheets", "tiktok"],
    ["whatsapp", "tiktok"],
    ["constructor", "tiktok"],
  ])("a %s callback refuses a %s state (Meta networks publish with the inbox token)", (integrationType, socialProvider) => {
    expect(
      isOwnSocialAccountCallback(integrationType, { socialProvider }),
    ).toBe(false)
  })
})
