import { beforeEach, describe, expect, test, vi } from "vitest"
import { connectSelfServeChannel } from "../src/self-serve"

const mocks = vi.hoisted(() => ({
  apiConfigParse: vi.fn(),
  createApiChannel: vi.fn(),
  createWebchat: vi.fn(),
  resolveAdapter: vi.fn(),
  resolveOwnerId: vi.fn(),
  webchatConfigParse: vi.fn(),
}))

vi.mock("@chatbotx.io/business", () => ({
  apiConnectConfigSchema: { parse: mocks.apiConfigParse },
  integrationApiService: { createWithToken: mocks.createApiChannel },
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
  notFoundException: (message: string) =>
    Object.assign(new Error(message), { code: "notFound" }),
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
    mocks.createWebchat.mockResolvedValue({
      connection,
      webchatId: "webchat-1",
    })

    const result = await connectSelfServeChannel({
      workspaceId: "workspace-1",
      provider: "webchat",
      config: { name: "Support" },
    })

    expect(result).toEqual({ connection, secret: null })
    expect(mocks.resolveOwnerId).toHaveBeenCalledWith({
      kind: "channel",
      workspaceId: "workspace-1",
    })
    expect(mocks.createWebchat).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      ownerId: "owner-1",
      createdBy: "owner-1",
      workspaceName: "Support",
      data: { ...webchatData, auth: {}, customCss: null },
    })
  })

  test("returns an API token once and never forwards caller token fields", async () => {
    const token = "cbx_api_generated-token"
    const connection = { id: "conn-2", sourceId: "api-1" }
    mocks.apiConfigParse.mockReturnValue({
      callbackUrl: null,
      name: "Orders",
    })
    mocks.createApiChannel.mockResolvedValue({ connection, token })

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
      callbackUrl: null,
    })
  })

  test("uses the workspace owner for quota and persistence", async () => {
    mocks.resolveOwnerId.mockResolvedValue("workspace-owner")
    mocks.apiConfigParse.mockReturnValue({
      callbackUrl: null,
      name: "Orders",
    })
    mocks.createApiChannel.mockResolvedValue({
      connection: { id: "conn-2", sourceId: "api-1" },
      token: "cbx_api_generated-token",
    })

    await connectSelfServeChannel({
      workspaceId: "workspace-1",
      provider: "api",
      actorUserId: "workspace-member",
      config: { name: "Orders" },
    })

    expect(mocks.createApiChannel).toHaveBeenCalledWith({
      ownerId: "workspace-owner",
      actorUserId: "workspace-member",
      workspaceId: "workspace-1",
      name: "Orders",
      callbackUrl: null,
    })
  })

  test("returns a mapped notFound exception before calling a connector without an owner", async () => {
    mocks.resolveOwnerId.mockResolvedValue(undefined)

    await expect(
      connectSelfServeChannel({
        workspaceId: "workspace-1",
        provider: "webchat",
        config: { name: "Support" },
      }),
    ).rejects.toMatchObject({ code: "notFound" })

    expect(mocks.createWebchat).not.toHaveBeenCalled()
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
