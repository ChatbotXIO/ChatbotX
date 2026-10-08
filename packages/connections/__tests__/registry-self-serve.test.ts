import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  createWithWorkspace: vi.fn(),
  createWithToken: vi.fn(),
}))

vi.mock("@chatbotx.io/business", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@chatbotx.io/business")>()),
  integrationWebchatService: { createWithWorkspace: mocks.createWithWorkspace },
  integrationApiService: { createWithToken: mocks.createWithToken },
}))

const { CONNECTION_REGISTRY } = await import("../src/registry")

const connectWebchat = CONNECTION_REGISTRY.webchat?.connect
const connectApi = CONNECTION_REGISTRY.api?.connect
const connection = { id: "conn-1", sourceId: "src-1" }

beforeEach(() => {
  vi.clearAllMocks()
  mocks.createWithWorkspace.mockResolvedValue({ connection })
  mocks.createWithToken.mockResolvedValue({ connection, token: "cbx_tok" })
})

describe("self-serve registry handlers", () => {
  it("webchat parses config defaults and attributes a token caller to the owner", async () => {
    const result = await connectWebchat?.({
      workspaceId: "ws-1",
      ownerId: "owner-1",
      actor: { actorTokenId: "token-1" },
      config: { name: "Support" },
    })

    expect(result).toEqual({ connection })
    expect(mocks.createWithWorkspace).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "ws-1",
        ownerId: "owner-1",
        createdBy: "owner-1",
        actorUserId: undefined,
        data: expect.objectContaining({
          name: "Support",
          enable: true,
          auth: {},
          customCss: null,
        }),
      }),
    )
  })

  it("webchat rejects invalid config before touching the service", async () => {
    await expect(
      connectWebchat?.({
        workspaceId: "ws-1",
        ownerId: "owner-1",
        actor: { actorUserId: "user-1" },
        config: { name: "" },
      }),
    ).rejects.toThrow()
    expect(mocks.createWithWorkspace).not.toHaveBeenCalled()
  })

  it("api returns the minted token as a one-time secret", async () => {
    const result = await connectApi?.({
      workspaceId: "ws-1",
      ownerId: "owner-1",
      actor: { actorUserId: "user-1" },
      config: { name: "Bot API", callbackUrl: "https://example.com/hook" },
    })

    expect(result).toEqual({
      connection,
      secret: { kind: "api_channel_token", token: "cbx_tok" },
    })
    expect(mocks.createWithToken).toHaveBeenCalledWith({
      ownerId: "owner-1",
      actorUserId: "user-1",
      workspaceId: "ws-1",
      name: "Bot API",
      callbackUrl: "https://example.com/hook",
    })
  })
})
