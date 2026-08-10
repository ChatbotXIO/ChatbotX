// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"

type ReconnectActionArgs = {
  bindArgsParsedInputs: [string, string]
  ctx: { workspace: { id: string; ownerId: string } }
}

type ReconnectActionHandler = (args: ReconnectActionArgs) => Promise<unknown>

const capturedActionHandlers: ReconnectActionHandler[] = []

const mockActionChain = {
  bindArgsSchemas: vi.fn(),
  action: vi.fn(),
}
mockActionChain.bindArgsSchemas.mockReturnValue(mockActionChain)
mockActionChain.action.mockImplementation((handler: ReconnectActionHandler) => {
  capturedActionHandlers.push(handler)
  return handler
})

const {
  mockFindMessengerIntegration,
  mockFindInstagramIntegration,
  mockResolveForOwner,
  mockRedirect,
  mockGenerateMessengerAuthUrl,
  mockGenerateInstagramAuthUrl,
  mockGenerateInstagramFacebookAuthUrl,
} = vi.hoisted(() => ({
  mockFindMessengerIntegration: vi.fn(),
  mockFindInstagramIntegration: vi.fn(),
  mockResolveForOwner: vi.fn(),
  mockRedirect: vi.fn(),
  mockGenerateMessengerAuthUrl: vi.fn(() => "https://facebook.example/auth"),
  mockGenerateInstagramAuthUrl: vi.fn(() => "https://instagram.example/auth"),
  mockGenerateInstagramFacebookAuthUrl: vi.fn(
    () => "https://facebook.example/instagram-auth",
  ),
}))

vi.mock("@/lib/safe-action", () => ({
  workspaceActionClient: mockActionChain,
}))

vi.mock("@chatbotx.io/business", () => ({
  messengerIntegrationService: {
    findByIdForWorkspace: mockFindMessengerIntegration,
  },
  instagramIntegrationService: {
    findByIdForWorkspace: mockFindInstagramIntegration,
  },
  platformCredentialService: {
    resolveForOwner: mockResolveForOwner,
  },
}))

vi.mock("@/lib/platform-credential-owner", () => ({
  resolveOwnerForWorkspace: vi.fn(
    async (workspace: { ownerId: string }) => workspace.ownerId,
  ),
}))

vi.mock("@chatbotx.io/business/errors", () => ({
  ChatbotXException: class ChatbotXException extends Error {},
}))

vi.mock("@chatbotx.io/integration-messenger", () => ({
  generateAuthUrl: mockGenerateMessengerAuthUrl,
}))

vi.mock("@chatbotx.io/integration-instagram", () => ({
  generateAuthUrl: mockGenerateInstagramAuthUrl,
}))

vi.mock("@chatbotx.io/integration-instagram-facebook", () => ({
  generateAuthUrl: mockGenerateInstagramFacebookAuthUrl,
}))

vi.mock("next/navigation", () => ({
  redirect: mockRedirect,
}))

vi.mock("@/lib/domain", () => ({
  getOriginUrlFromHeader: vi.fn(async () => "https://app.example.com"),
}))

vi.mock("@/lib/oauth-broker", () => ({
  buildBrokerCallbackUrl: (path: string) => `https://broker.example.com${path}`,
}))

await import("../src/features/integration-messenger/actions/reconnect.action")
await import("../src/features/integration-instagram/actions/reconnect.action")

const [reconnectMessengerHandler, reconnectInstagramHandler] =
  capturedActionHandlers

const executeMessengerReconnect = () =>
  reconnectMessengerHandler({
    bindArgsParsedInputs: ["ws-1", "im-1"],
    ctx: { workspace: { id: "ws-1", ownerId: "owner-1" } },
  })

const executeInstagramReconnect = () =>
  reconnectInstagramHandler({
    bindArgsParsedInputs: ["ws-1", "ig-1"],
    ctx: { workspace: { id: "ws-1", ownerId: "owner-1" } },
  })

describe("reconnectMessengerAction", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockResolveForOwner.mockResolvedValue({
      config: {
        clientId: "client-1",
        clientSecret: "secret-1",
        version: "v23.0",
      },
    })
  })

  test("redirects to the Facebook dialog with reconnect state", async () => {
    mockFindMessengerIntegration.mockResolvedValue({
      id: "im-1",
      pageId: "page-1",
    })

    await executeMessengerReconnect()

    expect(mockGenerateMessengerAuthUrl).toHaveBeenCalledWith({
      clientId: "client-1",
      version: "v23.0",
      redirectUrl: "https://broker.example.com/integrations/messenger/callback",
      stateParams: {
        workspaceId: "ws-1",
        referer:
          "https://app.example.com/space/ws-1/settings/channels?channel=messenger",
        reconnectIntegrationId: "im-1",
      },
    })
    expect(mockRedirect).toHaveBeenCalledWith("https://facebook.example/auth")
  })

  test("throws when the integration does not exist in the workspace", async () => {
    mockFindMessengerIntegration.mockResolvedValue(undefined)

    await expect(executeMessengerReconnect()).rejects.toThrow(
      "Integration Messenger not found",
    )
    expect(mockRedirect).not.toHaveBeenCalled()
  })

  test("throws when the messenger credential is missing", async () => {
    mockFindMessengerIntegration.mockResolvedValue({
      id: "im-1",
      pageId: "page-1",
    })
    mockResolveForOwner.mockResolvedValue(null)

    await expect(executeMessengerReconnect()).rejects.toThrow(
      "Messenger App settings not found",
    )
    expect(mockRedirect).not.toHaveBeenCalled()
  })
})

describe("reconnectInstagramAction", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockResolveForOwner.mockResolvedValue({
      config: {
        clientId: "client-1",
        clientSecret: "secret-1",
        version: "v23.0",
      },
    })
  })

  test("opens the direct Instagram dialog for type instagram", async () => {
    mockFindInstagramIntegration.mockResolvedValue({
      id: "ig-1",
      type: "instagram",
    })

    await executeInstagramReconnect()

    expect(mockResolveForOwner).toHaveBeenCalledWith({
      ownerId: "owner-1",
      type: "instagram",
    })
    expect(mockGenerateInstagramAuthUrl).toHaveBeenCalledWith({
      clientId: "client-1",
      version: "v23.0",
      redirectUrl: "https://broker.example.com/integrations/instagram/callback",
      stateParams: {
        workspaceId: "ws-1",
        referer:
          "https://app.example.com/space/ws-1/settings/channels?channel=instagram",
        reconnectIntegrationId: "ig-1",
      },
    })
    expect(mockGenerateInstagramFacebookAuthUrl).not.toHaveBeenCalled()
    expect(mockRedirect).toHaveBeenCalledWith("https://instagram.example/auth")
  })

  test("opens the Facebook dialog for type facebook", async () => {
    mockFindInstagramIntegration.mockResolvedValue({
      id: "ig-1",
      type: "facebook",
    })

    await executeInstagramReconnect()

    expect(mockResolveForOwner).toHaveBeenCalledWith({
      ownerId: "owner-1",
      type: "instagramFacebook",
    })
    expect(mockGenerateInstagramFacebookAuthUrl).toHaveBeenCalledWith(
      expect.objectContaining({
        redirectUrl:
          "https://broker.example.com/integrations/instagram-facebook/callback",
        stateParams: expect.objectContaining({
          reconnectIntegrationId: "ig-1",
        }),
      }),
    )
    expect(mockGenerateInstagramAuthUrl).not.toHaveBeenCalled()
    expect(mockRedirect).toHaveBeenCalledWith(
      "https://facebook.example/instagram-auth",
    )
  })

  test("throws when the integration does not exist in the workspace", async () => {
    mockFindInstagramIntegration.mockResolvedValue(undefined)

    await expect(executeInstagramReconnect()).rejects.toThrow(
      "Integration Instagram not found",
    )
    expect(mockRedirect).not.toHaveBeenCalled()
  })
})
