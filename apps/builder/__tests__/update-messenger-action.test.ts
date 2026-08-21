// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => {
  const txWhere = vi.fn().mockResolvedValue(undefined)
  const txSet = vi.fn(() => ({ where: txWhere }))
  const txUpdate = vi.fn(() => ({ set: txSet }))

  return {
    buildContext: vi.fn(),
    dbTransaction: vi.fn(
      async (callback: (tx: { update: typeof txUpdate }) => Promise<void>) =>
        callback({ update: txUpdate }),
    ),
    encodeButtonPayload: vi.fn(() => "encoded-payload"),
    ensureMessengerWhitelistedDomain: vi.fn().mockResolvedValue(undefined),
    findIntegrationMessenger: vi.fn(),
    moveBrandingMenuLast: vi.fn((menus: unknown[]) => menus),
    runAction: vi.fn(),
    runChannelHandler: vi.fn(),
    txSet,
    txUpdate,
    txWhere,
  }
})

vi.mock("@chatbotx.io/business", () => ({
  buildContext: mocks.buildContext,
}))

vi.mock("@chatbotx.io/business/branding", () => ({
  moveBrandingMenuLast: mocks.moveBrandingMenuLast,
}))

vi.mock("@chatbotx.io/business/errors", () => ({
  ChatbotXException: class ChatbotXException extends Error {},
}))

vi.mock("@chatbotx.io/database/client", () => ({
  db: { transaction: mocks.dbTransaction },
  eq: vi.fn((field: unknown, value: unknown) => ({ field, value })),
}))

vi.mock("@chatbotx.io/database/schema", () => ({
  integrationMessengerModel: { id: "id" },
}))

vi.mock("@chatbotx.io/flow-config", () => ({
  encodeButtonPayload: mocks.encodeButtonPayload,
}))

vi.mock("@chatbotx.io/integration-messenger", () => ({
  ensureMessengerWhitelistedDomain: mocks.ensureMessengerWhitelistedDomain,
  integration: {
    runAction: mocks.runAction,
    runChannelHandler: mocks.runChannelHandler,
  },
  isRegisteredPersona: vi.fn((persona: { facebookPersonaId?: string }) =>
    Boolean(persona.facebookPersonaId),
  ),
  messengerMenusToCallToActions: vi.fn(() => []),
}))

vi.mock("@/features/integration-webchat/lib", () => ({
  getBrandingUrl: vi.fn(() => "https://app.example.test/branding"),
}))

vi.mock("@/lib/log", () => ({
  logger: { debug: vi.fn(), warn: vi.fn() },
}))

vi.mock("@/lib/safe-action", () => {
  const chain: Record<string, unknown> = {}
  chain.bindArgsSchemas = vi.fn(() => chain)
  chain.inputSchema = vi.fn(() => chain)
  chain.action = vi.fn((handler: unknown) => handler)
  return { workspaceActionClient: chain }
})

vi.mock("../src/features/integration-messenger/queries", () => ({
  findIntegrationMessenger: mocks.findIntegrationMessenger,
}))

const { updateMessenger } = await import(
  "../src/features/integration-messenger/actions/update-messenger-action"
)

describe("updateMessenger", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.findIntegrationMessenger.mockResolvedValue({
      id: "messenger-1",
      auth: { tokens: { accessToken: "token-1" } },
      personas: [],
      persistentMenus: [],
      conversationStarters: [],
      welcomeFlowId: null,
    })
    mocks.buildContext.mockResolvedValue({
      platform: { appUrl: "https://app.example.test" },
    })
    mocks.runAction.mockResolvedValue({ personas: [] })
    mocks.runChannelHandler.mockResolvedValue(undefined)
    mocks.ensureMessengerWhitelistedDomain.mockResolvedValue(undefined)
    mocks.txSet.mockReturnValue({ where: mocks.txWhere })
    mocks.txWhere.mockResolvedValue(undefined)
  })

  test("keeps saved settings when post-commit profile field deletion fails", async () => {
    mocks.runChannelHandler.mockImplementation(
      (_channel: string, action: string) => {
        if (action === "deleteProfileFields") {
          return Promise.reject(new Error("graph timeout"))
        }
        return Promise.resolve()
      },
    )

    await updateMessenger(
      {
        workspace: { id: "workspace-1" } as never,
        id: "messenger-1",
      },
      {
        welcomeFlowId: null,
        persistentMenus: [],
        personas: [],
        conversationStarters: [],
      },
    )

    expect(mocks.txUpdate).toHaveBeenCalled()
    expect(mocks.ensureMessengerWhitelistedDomain).toHaveBeenCalled()
    expect(mocks.runChannelHandler).toHaveBeenCalledWith(
      "bot",
      "updateProfile",
      expect.objectContaining({
        data: expect.objectContaining({ get_started: expect.any(Object) }),
      }),
    )
  })
})
