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
  mockFindZaloIntegration,
  mockFindThreadsIntegration,
  mockResolveForOwner,
  mockRedirect,
  mockGenerateMessengerAuthUrl,
  mockGenerateInstagramAuthUrl,
  mockGenerateInstagramFacebookAuthUrl,
  mockGenerateZaloAuthUrl,
  mockGenerateThreadsAuthUrl,
} = vi.hoisted(() => ({
  mockFindMessengerIntegration: vi.fn(),
  mockFindInstagramIntegration: vi.fn(),
  mockFindZaloIntegration: vi.fn(),
  mockFindThreadsIntegration: vi.fn(),
  mockResolveForOwner: vi.fn(),
  mockRedirect: vi.fn(),
  mockGenerateMessengerAuthUrl: vi.fn(() => "https://facebook.example/auth"),
  mockGenerateInstagramAuthUrl: vi.fn(() => "https://instagram.example/auth"),
  mockGenerateInstagramFacebookAuthUrl: vi.fn(
    () => "https://facebook.example/instagram-auth",
  ),
  mockGenerateZaloAuthUrl: vi.fn(() => "https://zalo.example/auth"),
  mockGenerateThreadsAuthUrl: vi.fn(() => "https://threads.example/auth"),
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
  zaloIntegrationService: {
    findById: mockFindZaloIntegration,
  },
  integrationThreadsService: {
    findByIdForWorkspace: mockFindThreadsIntegration,
  },
  platformCredentialService: {
    resolveForOwner: mockResolveForOwner,
  },
  customDomainService: {
    findActiveByTenantId: mockFindActiveByTenantId,
  },
  tenantService: {
    findByOwner: mockFindByOwner,
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

vi.mock("@chatbotx.io/integration-zalo", () => ({
  generateAuthUrl: mockGenerateZaloAuthUrl,
}))

vi.mock("@chatbotx.io/integration-threads", () => ({
  generateAuthUrl: mockGenerateThreadsAuthUrl,
}))

vi.mock("next/navigation", () => ({
  redirect: mockRedirect,
}))

vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(async () => (key: string) => key),
}))

vi.mock("@/lib/domain", () => ({
  getOriginUrlFromHeader: vi.fn(async () => "https://app.example.com"),
}))

const BROKER_ORIGIN = "https://broker.example.com"

vi.mock("@/lib/oauth-broker", () => ({
  getBrokerOrigin: () => BROKER_ORIGIN,
  buildBrokerCallbackUrl: (path: string) => `${BROKER_ORIGIN}${path}`,
}))

const { mockFindActiveByTenantId, mockFindByOwner } = vi.hoisted(() => ({
  mockFindActiveByTenantId: vi.fn(),
  mockFindByOwner: vi.fn(),
}))

vi.mock("@/env", () => ({ isCloud: () => true }))

await import("../src/features/integration-messenger/actions/reconnect.action")
await import("../src/features/integration-instagram/actions/reconnect.action")
await import("../src/features/integration-zalo/actions/reconnect.action")
await import("../src/features/integration-threads/actions/reconnect.action")

const [
  reconnectMessengerHandler,
  reconnectInstagramHandler,
  reconnectZaloHandler,
  reconnectThreadsHandler,
] = capturedActionHandlers

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

const executeZaloReconnect = () =>
  reconnectZaloHandler({
    bindArgsParsedInputs: ["ws-1", "iz-1"],
    ctx: { workspace: { id: "ws-1", ownerId: "owner-1" } },
  })

const executeThreadsReconnect = () =>
  reconnectThreadsHandler({
    bindArgsParsedInputs: ["ws-1", "th-1"],
    ctx: { workspace: { id: "ws-1", ownerId: "owner-1" } },
  })

describe("reconnectMessengerAction", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockResolveForOwner.mockResolvedValue({
      userId: null,
      config: {
        clientId: "client-1",
        clientSecret: "secret-1",
        version: "v23.0",
      },
    })
    mockFindByOwner.mockResolvedValue(undefined)
    mockFindActiveByTenantId.mockResolvedValue(undefined)
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

  test("uses the reseller's active custom domain for a tenant-owned credential", async () => {
    mockFindMessengerIntegration.mockResolvedValue({
      id: "im-1",
      pageId: "page-1",
    })
    mockResolveForOwner.mockResolvedValue({
      userId: "owner-1",
      config: {
        clientId: "client-1",
        clientSecret: "secret-1",
        version: "v23.0",
      },
    })
    mockFindByOwner.mockResolvedValue({ id: "t1", status: "active" })
    mockFindActiveByTenantId.mockResolvedValue({ domain: "chat.acme.com" })

    await executeMessengerReconnect()

    expect(mockGenerateMessengerAuthUrl).toHaveBeenCalledWith(
      expect.objectContaining({
        redirectUrl: "https://chat.acme.com/integrations/messenger/callback",
      }),
    )
  })
})

describe("reconnectInstagramAction", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockResolveForOwner.mockResolvedValue({
      userId: null,
      config: {
        clientId: "client-1",
        clientSecret: "secret-1",
        version: "v23.0",
      },
    })
    mockFindByOwner.mockResolvedValue(undefined)
    mockFindActiveByTenantId.mockResolvedValue(undefined)
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

describe("reconnectZaloAction", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockResolveForOwner.mockResolvedValue({
      userId: null,
      config: {
        clientId: "client-1",
        clientSecret: "secret-1",
        verifyToken: "verify-1",
        version: "v4",
      },
    })
    mockFindByOwner.mockResolvedValue(undefined)
    mockFindActiveByTenantId.mockResolvedValue(undefined)
  })

  test("redirects to the Zalo dialog with reconnect state", async () => {
    mockFindZaloIntegration.mockResolvedValue({ id: "iz-1", oaId: "oa-1" })

    await executeZaloReconnect()

    expect(mockResolveForOwner).toHaveBeenCalledWith({
      ownerId: "owner-1",
      type: "zalo",
    })
    expect(mockGenerateZaloAuthUrl).toHaveBeenCalledWith({
      clientId: "client-1",
      clientSecret: "",
      redirectUrl: "https://broker.example.com/integrations/zalo/callback",
      stateParams: {
        workspaceId: "ws-1",
        referer:
          "https://app.example.com/space/ws-1/settings/channels?channel=zalo",
        reconnectIntegrationId: "iz-1",
      },
    })
    expect(mockRedirect).toHaveBeenCalledWith("https://zalo.example/auth")
  })

  test("throws when the integration does not exist in the workspace", async () => {
    mockFindZaloIntegration.mockRejectedValue(
      new Error("Integration Zalo not found"),
    )

    await expect(executeZaloReconnect()).rejects.toThrow(
      "Integration Zalo not found",
    )
    expect(mockRedirect).not.toHaveBeenCalled()
  })

  test("throws when the zalo credential is missing", async () => {
    mockFindZaloIntegration.mockResolvedValue({ id: "iz-1", oaId: "oa-1" })
    mockResolveForOwner.mockResolvedValue(null)

    await expect(executeZaloReconnect()).rejects.toThrow(
      "Zalo App settings not found",
    )
    expect(mockRedirect).not.toHaveBeenCalled()
  })

  test("uses the reseller's active custom domain for a tenant-owned credential", async () => {
    mockFindZaloIntegration.mockResolvedValue({ id: "iz-1", oaId: "oa-1" })
    mockResolveForOwner.mockResolvedValue({
      userId: "owner-1",
      config: {
        clientId: "client-1",
        clientSecret: "secret-1",
        verifyToken: "verify-1",
        version: "v4",
      },
    })
    mockFindByOwner.mockResolvedValue({ id: "t1", status: "active" })
    mockFindActiveByTenantId.mockResolvedValue({ domain: "chat.acme.com" })

    await executeZaloReconnect()

    expect(mockGenerateZaloAuthUrl).toHaveBeenCalledWith(
      expect.objectContaining({
        redirectUrl: "https://chat.acme.com/integrations/zalo/callback",
      }),
    )
  })
})

describe("reconnectThreadsAction", () => {
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

  test("redirects to the Threads dialog with reconnect state", async () => {
    mockFindThreadsIntegration.mockResolvedValue({
      id: "th-1",
      threadsUserId: "threads-user-1",
    })

    await executeThreadsReconnect()

    expect(mockGenerateThreadsAuthUrl).toHaveBeenCalledWith({
      clientId: "client-1",
      redirectUrl: "https://broker.example.com/integrations/threads/callback",
      stateParams: {
        workspaceId: "ws-1",
        referer:
          "https://app.example.com/space/ws-1/settings/channels?channel=threads",
        reconnectIntegrationId: "th-1",
      },
    })
    expect(mockRedirect).toHaveBeenCalledWith("https://threads.example/auth")
  })

  test("throws a translated not-found error when the integration is missing", async () => {
    mockFindThreadsIntegration.mockResolvedValue(undefined)

    await expect(executeThreadsReconnect()).rejects.toThrow(
      "channels.reconnect.errors.notFound",
    )
    expect(mockRedirect).not.toHaveBeenCalled()
  })

  test("throws a translated app-settings error when the credential is missing", async () => {
    mockFindThreadsIntegration.mockResolvedValue({
      id: "th-1",
      threadsUserId: "threads-user-1",
    })
    mockResolveForOwner.mockResolvedValue(null)

    await expect(executeThreadsReconnect()).rejects.toThrow(
      "messages.needToAddSettings",
    )
    expect(mockRedirect).not.toHaveBeenCalled()
  })
})
