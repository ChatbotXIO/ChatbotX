import { beforeEach, describe, expect, test, vi } from "vitest"
import { connectSelfServeChannel } from "../src/self-serve"

const mocks = vi.hoisted(() => ({
  connect: vi.fn(),
  resolveAdapter: vi.fn(),
  workspaceFindOrFail: vi.fn(),
}))

vi.mock("@chatbotx.io/business", () => ({
  workspaceService: { findOrFail: mocks.workspaceFindOrFail },
}))

vi.mock("@chatbotx.io/business/errors", () => ({
  ChatbotXException: class ChatbotXException extends Error {},
  connectionWrongStrategyException: (provider: string) =>
    Object.assign(
      new Error(`${provider} cannot use this connection strategy`),
      {
        code: "connectionWrongStrategy",
      },
    ),
}))

vi.mock("../src/internal", () => ({
  resolveAdapter: mocks.resolveAdapter,
}))

beforeEach(() => {
  vi.clearAllMocks()
  mocks.workspaceFindOrFail.mockResolvedValue({
    id: "workspace-1",
    ownerId: "owner-1",
  })
  mocks.resolveAdapter.mockReturnValue({
    provider: { strategy: "self_serve" },
    connect: mocks.connect,
  })
})

describe("connectSelfServeChannel", () => {
  test("uses the workspace row owner when no owner member exists", async () => {
    const connection = { id: "conn-1", sourceId: "webchat-1" }
    mocks.connect.mockResolvedValue({ connection })

    const result = await connectSelfServeChannel({
      workspaceId: "workspace-1",
      provider: "webchat",
      config: { name: "Support" },
      actor: { actorTokenId: "token-1" },
    })

    expect(result).toEqual({ connection, secret: null })
    expect(mocks.workspaceFindOrFail).toHaveBeenCalledWith({
      where: { id: "workspace-1" },
    })
    expect(mocks.connect).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      ownerId: "owner-1",
      actor: { actorTokenId: "token-1" },
      config: { name: "Support" },
    })
  })

  test("returns a self-serve secret unchanged", async () => {
    const connection = { id: "conn-2", sourceId: "api-1" }
    mocks.connect.mockResolvedValue({
      connection,
      secret: { kind: "api_channel_token", token: "cbx_api_generated-token" },
    })

    await expect(
      connectSelfServeChannel({
        workspaceId: "workspace-1",
        provider: "api",
        config: { name: "Orders" },
        actor: { actorUserId: "workspace-member" },
      }),
    ).resolves.toEqual({
      connection,
      secret: { kind: "api_channel_token", token: "cbx_api_generated-token" },
    })
  })

  test("rejects an adapter without a self-serve handler", async () => {
    mocks.resolveAdapter.mockReturnValue({
      provider: { strategy: "self_serve" },
    })

    await expect(
      connectSelfServeChannel({
        workspaceId: "workspace-1",
        provider: "smtp",
        config: {},
        actor: { actorUserId: "user-1" },
      }),
    ).rejects.toMatchObject({ code: "connectionWrongStrategy" })
  })
})
