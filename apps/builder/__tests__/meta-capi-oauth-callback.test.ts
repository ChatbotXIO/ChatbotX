// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  assertWorkspaceSuperAdmin: vi.fn(),
  consumeOAuthNonce: vi.fn(),
  findMessenger: vi.fn(),
  findInstagram: vi.fn(),
  connectCapiWithToken: vi.fn(),
  auditRecord: vi.fn(),
  exchangeMessengerCode: vi.fn(),
  exchangeLongLivedToken: vi.fn(),
  getUserPages: vi.fn(),
  exchangeInstagramCode: vi.fn(),
  getUserInstagramAccounts: vi.fn(),
  provisioner: vi.fn(),
  getDataset: vi.fn(),
  capiDatasetProvisioner: vi.fn(),
  loggerWarn: vi.fn(),
  loggerInfo: vi.fn(),
  loggerError: vi.fn(),
}))

vi.mock("@/lib/auth/assert-workspace-super-admin", () => ({
  assertWorkspaceSuperAdmin: mocks.assertWorkspaceSuperAdmin,
}))
vi.mock("@/lib/oauth-state-nonce", () => ({
  consumeOAuthNonce: mocks.consumeOAuthNonce,
}))
vi.mock("@chatbotx.io/business", () => ({
  messengerIntegrationService: { findByIdForWorkspace: mocks.findMessenger },
  instagramIntegrationService: { findByIdForWorkspace: mocks.findInstagram },
  metaConversionsService: { connectCapiWithToken: mocks.connectCapiWithToken },
}))
vi.mock("@chatbotx.io/business/audit", () => ({
  auditService: { record: mocks.auditRecord },
}))
vi.mock("@chatbotx.io/integration-messenger", () => ({
  exchangeCodeForToken: mocks.exchangeMessengerCode,
  getUserPages: mocks.getUserPages,
}))
vi.mock("@chatbotx.io/integration-messenger/apis/page", () => ({
  exchangeLongLivedToken: mocks.exchangeLongLivedToken,
}))
vi.mock("@chatbotx.io/integration-instagram-facebook", () => ({
  exchangeCodeForToken: mocks.exchangeInstagramCode,
  getUserInstagramAccounts: mocks.getUserInstagramAccounts,
}))
vi.mock("@chatbotx.io/integration-meta-conversions", () => ({
  getDataset: mocks.getDataset,
}))
vi.mock("@/features/meta-conversions/lib/provision-capi-dataset", () => ({
  capiDatasetProvisioner: mocks.capiDatasetProvisioner,
}))
vi.mock("@/lib/log", () => ({
  logger: {
    warn: mocks.loggerWarn,
    info: mocks.loggerInfo,
    error: mocks.loggerError,
    debug: vi.fn(),
  },
}))

const { completeMetaCapiConnect } = await import(
  "@/app/integrations/[...integration]/callback-meta-capi"
)

const credentialConfig = {
  clientId: "app-1",
  clientSecret: "secret",
  version: "v25.0",
}
const request = { ipAddress: "203.0.113.7", userAgent: "vitest" }

const messengerIntegration = { id: "7", workspaceId: "ws-1", pageId: "page-1" }
const instagramIntegration = {
  id: "9",
  workspaceId: "ws-1",
  igId: "ig-1",
  type: "facebook",
}

const baseInput = {
  workspaceId: "ws-1",
  userId: "user-1",
  credentialConfig,
  callbackUrl: "https://builder.example.test/integrations/x/callback",
  code: "auth-code",
  request,
}

const messengerInput = {
  ...baseInput,
  channel: "messenger" as const,
  state: { capiChannel: "messenger", capiIntegrationId: "7", nonce: "n-1" },
}
const instagramInput = {
  ...baseInput,
  channel: "instagram" as const,
  state: { capiChannel: "instagram", capiIntegrationId: "9", nonce: "n-1" },
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.assertWorkspaceSuperAdmin.mockResolvedValue(undefined)
  mocks.consumeOAuthNonce.mockResolvedValue(true)
  mocks.capiDatasetProvisioner.mockReturnValue(mocks.provisioner)
  mocks.connectCapiWithToken.mockResolvedValue({})
  mocks.findMessenger.mockResolvedValue(messengerIntegration)
  mocks.findInstagram.mockResolvedValue(instagramIntegration)
  mocks.exchangeMessengerCode.mockResolvedValue("short-user-token")
  mocks.exchangeLongLivedToken.mockImplementation(
    async (_config: unknown, token: string) => `long:${token}`,
  )
  mocks.getUserPages.mockResolvedValue({
    pages: [
      { id: "other-page", access_token: "other-page-token" },
      { id: "page-1", access_token: "page-token" },
    ],
    bmLookupFailed: false,
  })
  mocks.exchangeInstagramCode.mockResolvedValue("long-user-token")
  mocks.getUserInstagramAccounts.mockResolvedValue([
    { id: "ig-other", pageAccessToken: "other-token" },
    { id: "ig-1", pageAccessToken: "ig-page-token" },
  ])
})

describe("completeMetaCapiConnect — request binding", () => {
  test.each([
    ["no integration id", { capiChannel: "messenger", nonce: "n-1" }],
    ["no nonce", { capiChannel: "messenger", capiIntegrationId: "7" }],
    [
      "a channel other than the one this callback serves",
      { capiChannel: "instagram", capiIntegrationId: "7", nonce: "n-1" },
    ],
    ["no channel", { capiIntegrationId: "7", nonce: "n-1" }],
  ])("refuses a state with %s before any provider call", async (_name, state) => {
    await expect(
      completeMetaCapiConnect({ ...messengerInput, state }),
    ).resolves.toBe("notFound")

    expect(mocks.exchangeMessengerCode).not.toHaveBeenCalled()
    expect(mocks.connectCapiWithToken).not.toHaveBeenCalled()
  })

  test("sends the admin back with sessionExpired when the nonce does not match the browser's cookie", async () => {
    mocks.consumeOAuthNonce.mockResolvedValueOnce(false)

    await expect(completeMetaCapiConnect(messengerInput)).resolves.toEqual({
      status: "error",
      reason: "sessionExpired",
    })

    expect(mocks.consumeOAuthNonce).toHaveBeenCalledWith("n-1")
    expect(mocks.exchangeMessengerCode).not.toHaveBeenCalled()
    expect(mocks.connectCapiWithToken).not.toHaveBeenCalled()
  })

  test("refuses a caller who is not a super admin of the workspace", async () => {
    mocks.assertWorkspaceSuperAdmin.mockRejectedValueOnce(new Error("nope"))

    await expect(completeMetaCapiConnect(messengerInput)).resolves.toBe(
      "notFound",
    )

    expect(mocks.assertWorkspaceSuperAdmin).toHaveBeenCalledWith("ws-1")
    expect(mocks.exchangeMessengerCode).not.toHaveBeenCalled()
    expect(mocks.connectCapiWithToken).not.toHaveBeenCalled()
  })

  test("refuses an integration that does not belong to the workspace", async () => {
    mocks.findMessenger.mockResolvedValueOnce(null)

    await expect(completeMetaCapiConnect(messengerInput)).resolves.toEqual({
      status: "error",
      reason: "notFound",
    })

    expect(mocks.findMessenger).toHaveBeenCalledWith({
      id: "7",
      workspaceId: "ws-1",
    })
    expect(mocks.exchangeMessengerCode).not.toHaveBeenCalled()
    expect(mocks.connectCapiWithToken).not.toHaveBeenCalled()
  })
})

describe("completeMetaCapiConnect — messenger", () => {
  test("stores the long-lived page token of the connected page, never the user token", async () => {
    await expect(completeMetaCapiConnect(messengerInput)).resolves.toEqual({
      status: "success",
    })

    expect(mocks.exchangeMessengerCode).toHaveBeenCalledWith(
      credentialConfig,
      "auth-code",
      baseInput.callbackUrl,
    )
    expect(mocks.getUserPages).toHaveBeenCalledWith(
      "long:short-user-token",
      "v25.0",
    )
    expect(mocks.capiDatasetProvisioner).toHaveBeenCalledWith("messenger")
    expect(mocks.connectCapiWithToken).toHaveBeenCalledWith({
      channel: "messenger",
      integration: messengerIntegration,
      accessToken: "long:page-token",
      provisionDataset: mocks.provisioner,
      validate: mocks.getDataset,
    })
  })

  test("records the connect in the audit log", async () => {
    await completeMetaCapiConnect(messengerInput)

    expect(mocks.auditRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-1",
        workspaceId: "ws-1",
        action: "update",
        ipAddress: "203.0.113.7",
        userAgent: "vitest",
      }),
    )
  })

  test("falls back to the short-lived user token when the long-lived exchange fails", async () => {
    mocks.exchangeLongLivedToken.mockRejectedValueOnce(new Error("graph down"))

    await expect(completeMetaCapiConnect(messengerInput)).resolves.toEqual({
      status: "success",
    })

    expect(mocks.getUserPages).toHaveBeenCalledWith("short-user-token", "v25.0")
  })

  test("reports pageNotFound when the user did not grant the connected page", async () => {
    mocks.getUserPages.mockResolvedValueOnce({
      pages: [{ id: "other-page", access_token: "t" }],
      bmLookupFailed: false,
    })

    await expect(completeMetaCapiConnect(messengerInput)).resolves.toEqual({
      status: "error",
      reason: "pageNotFound",
    })

    expect(mocks.connectCapiWithToken).not.toHaveBeenCalled()
    expect(mocks.auditRecord).not.toHaveBeenCalled()
  })

  test("reports datasetFailed, and stores nothing, when Meta refuses the dataset", async () => {
    mocks.connectCapiWithToken.mockRejectedValueOnce(new Error("(#200)"))

    await expect(completeMetaCapiConnect(messengerInput)).resolves.toEqual({
      status: "error",
      reason: "datasetFailed",
    })

    expect(mocks.auditRecord).not.toHaveBeenCalled()
    expect(mocks.loggerWarn).toHaveBeenCalled()
  })

  test("reports notFound, and no audit entry, when the integration vanished before the write", async () => {
    mocks.connectCapiWithToken.mockResolvedValueOnce(null)

    await expect(completeMetaCapiConnect(messengerInput)).resolves.toEqual({
      status: "error",
      reason: "notFound",
    })

    expect(mocks.auditRecord).not.toHaveBeenCalled()
  })

  test("reports a generic failure when the code exchange throws", async () => {
    mocks.exchangeMessengerCode.mockRejectedValueOnce(new Error("bad code"))

    await expect(completeMetaCapiConnect(messengerInput)).resolves.toEqual({
      status: "error",
      reason: "failed",
    })

    expect(mocks.connectCapiWithToken).not.toHaveBeenCalled()
    expect(mocks.loggerError).toHaveBeenCalled()
  })
})

describe("completeMetaCapiConnect — instagram", () => {
  test("stores the page token of the connected Instagram account", async () => {
    await expect(completeMetaCapiConnect(instagramInput)).resolves.toEqual({
      status: "success",
    })

    expect(mocks.exchangeInstagramCode).toHaveBeenCalledWith(
      credentialConfig,
      "auth-code",
      baseInput.callbackUrl,
    )
    expect(mocks.getUserInstagramAccounts).toHaveBeenCalledWith(
      "long-user-token",
      "v25.0",
    )
    expect(mocks.capiDatasetProvisioner).toHaveBeenCalledWith("instagram")
    expect(mocks.connectCapiWithToken).toHaveBeenCalledWith({
      channel: "instagram",
      integration: instagramIntegration,
      accessToken: "ig-page-token",
      provisionDataset: mocks.provisioner,
      validate: mocks.getDataset,
    })
  })

  test("reports accountNotFound when the user did not grant the connected account", async () => {
    mocks.getUserInstagramAccounts.mockResolvedValueOnce([
      { id: "ig-other", pageAccessToken: "t" },
    ])

    await expect(completeMetaCapiConnect(instagramInput)).resolves.toEqual({
      status: "error",
      reason: "accountNotFound",
    })

    expect(mocks.connectCapiWithToken).not.toHaveBeenCalled()
  })

  test("refuses an Instagram Business Login integration, which has no Conversions API", async () => {
    mocks.findInstagram.mockResolvedValueOnce({
      ...instagramIntegration,
      type: "instagram",
    })

    await expect(completeMetaCapiConnect(instagramInput)).resolves.toEqual({
      status: "error",
      reason: "notFound",
    })

    expect(mocks.exchangeInstagramCode).not.toHaveBeenCalled()
    expect(mocks.connectCapiWithToken).not.toHaveBeenCalled()
  })
})
