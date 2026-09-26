// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => {
  const txWhere = vi.fn().mockResolvedValue(undefined)
  const txSet = vi.fn(() => ({ where: txWhere }))
  const txUpdate = vi.fn(() => ({ set: txSet }))

  const updateProfileFields = vi.fn(
    (
      _props: { id: string },
      _data: Record<string, unknown>,
      tx: { update: typeof txUpdate },
    ) => Promise.resolve(tx.update().set().where()),
  )

  return {
    buildContext: vi.fn(),
    dbTransaction: vi.fn(
      async (callback: (tx: { update: typeof txUpdate }) => Promise<void>) =>
        callback({ update: txUpdate }),
    ),
    encodeButtonPayload: vi.fn(() => "encoded-payload"),
    ensureMessengerWhitelistedDomain: vi.fn().mockResolvedValue(undefined),
    findIntegrationMessenger: vi.fn(),
    logMessengerWelcomeProfile: vi.fn().mockResolvedValue(undefined),
    loggerWarn: vi.fn(),
    setNumberIfNotExists: vi.fn(),
    moveBrandingMenuLast: vi.fn((menus: unknown[]) => menus),
    runAction: vi.fn(),
    runChannelHandler: vi.fn(),
    txSet,
    txUpdate,
    txWhere,
    updateProfileFields,
    updateMarkReadOnOutbound: vi.fn(),
  }
})

vi.mock("@chatbotx.io/business", () => ({
  buildContext: mocks.buildContext,
  inboxService: {
    updateMarkReadOnOutbound: mocks.updateMarkReadOnOutbound,
  },
  messengerIntegrationService: {
    updateProfileFields: mocks.updateProfileFields,
  },
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
  logMessengerWelcomeProfile: mocks.logMessengerWelcomeProfile,
  isRegisteredPersona: vi.fn((persona: { facebookPersonaId?: string }) =>
    Boolean(persona.facebookPersonaId),
  ),
  messengerMenusToCallToActions: vi.fn(() => []),
}))

vi.mock("@/features/integration-webchat/lib", () => ({
  getBrandingUrl: vi.fn(() => "https://app.example.test/branding"),
}))

vi.mock("@/lib/log", () => ({
  logger: { debug: vi.fn(), warn: mocks.loggerWarn },
}))

vi.mock("@chatbotx.io/redis", () => ({
  distributedStore: { setNumberIfNotExists: mocks.setNumberIfNotExists },
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

const botContext = {
  auth: { metadata: { pageId: "page-1" } },
  platform: { appUrl: "https://app.example.test" },
}

const saveSettings = () =>
  updateMessenger(
    {
      workspace: { id: "workspace-1" } as never,
      id: "messenger-1",
    },
    {
      welcomeFlowId: "flow-1",
      persistentMenus: [],
      personas: [],
      conversationStarters: [],
    },
  )

describe("updateMessenger", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.findIntegrationMessenger.mockResolvedValue({
      id: "messenger-1",
      inboxId: "inbox-1",
      auth: { tokens: { accessToken: "token-1" } },
      personas: [],
      persistentMenus: [],
      conversationStarters: [],
      welcomeFlowId: null,
    })
    mocks.buildContext.mockResolvedValue(botContext)
    mocks.setNumberIfNotExists.mockResolvedValue(true)
    mocks.runAction.mockResolvedValue({ personas: [] })
    mocks.runChannelHandler.mockResolvedValue(undefined)
    mocks.ensureMessengerWhitelistedDomain.mockResolvedValue(undefined)
    mocks.logMessengerWelcomeProfile.mockResolvedValue(undefined)
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

  test("updates the inbox flag after saving the Messenger integration", async () => {
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
        markReadOnOutbound: true,
      },
    )

    expect(mocks.updateMarkReadOnOutbound).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      id: "inbox-1",
      enabled: true,
    })
  })

  test("does not update the inbox flag when the field is omitted", async () => {
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

    expect(mocks.updateMarkReadOnOutbound).not.toHaveBeenCalled()
  })

  test("reads the welcome profile back after pushing the Messenger profile", async () => {
    await saveSettings()

    expect(mocks.logMessengerWelcomeProfile).toHaveBeenCalledWith({
      ctx: botContext,
      reason: "profileUpdated",
    })
    const updateProfileOrder = mocks.runChannelHandler.mock.calls.findIndex(
      ([, action]) => action === "updateProfile",
    )
    expect(updateProfileOrder).toBeGreaterThanOrEqual(0)
    expect(
      mocks.runChannelHandler.mock.invocationCallOrder[updateProfileOrder],
    ).toBeLessThan(mocks.logMessengerWelcomeProfile.mock.invocationCallOrder[0])
  })

  test("still reads the welcome profile back when the profile push fails", async () => {
    mocks.runChannelHandler.mockImplementation(
      (_channel: string, action: string) =>
        action === "updateProfile"
          ? Promise.reject(new Error("graph timeout"))
          : Promise.resolve(),
    )

    await expect(saveSettings()).resolves.toBeUndefined()

    expect(mocks.logMessengerWelcomeProfile).toHaveBeenCalledWith(
      expect.objectContaining({ reason: "profileUpdated" }),
    )
  })

  test("claims a 5-minute per-page slot before reading the welcome profile", async () => {
    await saveSettings()

    expect(mocks.setNumberIfNotExists).toHaveBeenCalledWith(
      "messenger:welcome-profile-read:page-1",
      1,
      300,
    )
    expect(mocks.setNumberIfNotExists.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.logMessengerWelcomeProfile.mock.invocationCallOrder[0],
    )
  })

  test("skips the read-back when the page was already read within 5 minutes", async () => {
    mocks.setNumberIfNotExists.mockResolvedValue(false)

    await expect(saveSettings()).resolves.toBeUndefined()

    expect(mocks.runChannelHandler).toHaveBeenCalledWith(
      "bot",
      "updateProfile",
      expect.anything(),
    )
    expect(mocks.logMessengerWelcomeProfile).not.toHaveBeenCalled()
  })

  test("skips the read-back but keeps the save when Redis is unavailable", async () => {
    mocks.setNumberIfNotExists.mockRejectedValue(new Error("ECONNREFUSED"))

    await expect(saveSettings()).resolves.toBeUndefined()

    expect(mocks.txUpdate).toHaveBeenCalled()
    expect(mocks.logMessengerWelcomeProfile).not.toHaveBeenCalled()
    expect(mocks.loggerWarn).toHaveBeenCalledWith(
      expect.objectContaining({ pageId: "page-1" }),
      "Skipped Messenger welcome profile read-back: throttle unavailable",
    )
  })

  test("skips the read-back without touching Redis when the page id is missing", async () => {
    mocks.buildContext.mockResolvedValue({
      auth: {},
      platform: { appUrl: "https://app.example.test" },
    })

    await expect(saveSettings()).resolves.toBeUndefined()

    expect(mocks.setNumberIfNotExists).not.toHaveBeenCalled()
    expect(mocks.logMessengerWelcomeProfile).not.toHaveBeenCalled()
  })
})
