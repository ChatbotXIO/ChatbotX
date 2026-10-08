import { beforeEach, describe, expect, test, vi } from "vitest"
import { connectSelfServeChannel } from "../src/self-serve"

const mocks = vi.hoisted(() => ({
  assertPublicUrl: vi.fn(),
  createApiChannel: vi.fn(),
  createWebchat: vi.fn(),
  findByProviderSourceId: vi.fn(),
  generateApiChannelToken: vi.fn(),
  generateSigningSecret: vi.fn(),
  resolveAdapter: vi.fn(),
  resolveOwnerId: vi.fn(),
  webchatConfigParse: vi.fn(),
}))

vi.mock("@chatbotx.io/business", () => ({
  assertPublicUrl: mocks.assertPublicUrl,
  integrationApiService: { connect: mocks.createApiChannel },
  integrationWebchatService: { createWithWorkspace: mocks.createWebchat },
  webchatConnectConfigSchema: { parse: mocks.webchatConfigParse },
}))

vi.mock("@chatbotx.io/business/connection", () => ({
  resolveOwnerId: mocks.resolveOwnerId,
}))

vi.mock("@chatbotx.io/business/errors", () => ({
  connectionWrongStrategyException: (provider: string) =>
    Object.assign(
      new Error(`${provider} cannot use this connection strategy`),
      {
        code: "connectionWrongStrategy",
      },
    ),
}))

vi.mock("@chatbotx.io/business/workspace-api-token/credentials", () => ({
  generateApiChannelToken: mocks.generateApiChannelToken,
  generateSigningSecret: mocks.generateSigningSecret,
}))

vi.mock("@chatbotx.io/database/repositories", () => ({
  connectionRepository: {
    findByProviderSourceId: mocks.findByProviderSourceId,
  },
}))

vi.mock("../src/internal", () => ({
  resolveAdapter: mocks.resolveAdapter,
}))

const webchatData = {
  name: "Support",
  welcomeFlowId: undefined,
  authorizedDomains: [],
  conversationStarters: [],
  persistentMenus: [],
  brandColor: "#007bff",
  hideHeader: false,
  showLogo: true,
  hideMessageInput: false,
  customCss: undefined,
  enable: true,
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.resolveAdapter.mockImplementation((provider: string) => ({
    provider: { kind: "channel", name: provider },
  }))
  mocks.resolveOwnerId.mockResolvedValue("owner-1")
})

describe("connectSelfServeChannel", () => {
  test("creates a webchat and returns its matching Connection row", async () => {
    const connection = { id: "conn-1", sourceId: "webchat-1" }
    mocks.webchatConfigParse.mockReturnValue(webchatData)
    mocks.createWebchat.mockResolvedValue({ webchatId: "webchat-1" })
    mocks.findByProviderSourceId.mockResolvedValue(connection)

    const result = await connectSelfServeChannel({
      workspaceId: "workspace-1",
      provider: "webchat",
      config: { name: "Support" },
    })

    expect(result).toEqual({ connection, secret: null })
    expect(mocks.createWebchat).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      createdBy: "owner-1",
      workspaceName: "Support",
      data: { ...webchatData, auth: {}, customCss: null },
    })
    expect(mocks.findByProviderSourceId).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      provider: "webchat",
      sourceId: "webchat-1",
    })
  })

  test("returns an API token once and never forwards caller token fields", async () => {
    const token = "cbx_api_generated-token"
    const connection = { id: "conn-2", sourceId: "api-1" }
    mocks.generateApiChannelToken.mockResolvedValue({
      token,
      tokenHash: "server-hash",
      tokenPrefix: "cbx_api_gene",
    })
    mocks.generateSigningSecret.mockReturnValue("signing-secret")
    mocks.createApiChannel.mockResolvedValue({ inbox: { id: "api-1" } })
    mocks.findByProviderSourceId.mockResolvedValue(connection)

    const result = await connectSelfServeChannel({
      workspaceId: "workspace-1",
      provider: "api",
      config: { name: "Orders", tokenHash: "attacker" },
    })

    expect(result).toEqual({
      connection,
      secret: { kind: "api_channel_token", token },
    })
    expect(mocks.createApiChannel).toHaveBeenCalledWith({
      ownerId: "owner-1",
      actorUserId: "owner-1",
      workspaceId: "workspace-1",
      name: "Orders",
      auth: {
        authType: "custom",
        callbackUrl: null,
        signingSecret: "signing-secret",
      },
      tokenHash: "server-hash",
      tokenPrefix: "cbx_api_gene",
      callbackUrl: null,
    })
  })

  test("rejects a provider without a self-serve connector", async () => {
    await expect(
      connectSelfServeChannel({
        workspaceId: "workspace-1",
        provider: "smtp",
        config: {},
      }),
    ).rejects.toMatchObject({ code: "connectionWrongStrategy" })
  })
})
