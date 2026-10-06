// @vitest-environment node
import { beforeEach, describe, expect, test, vi } from "vitest"

// ---------------------------------------------------------------------------
// Mock logger to suppress output
// ---------------------------------------------------------------------------
vi.mock("@/lib/log", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}))

// ---------------------------------------------------------------------------
// Mock @chatbotx.io/business
// ---------------------------------------------------------------------------
const findByIdForWorkspace = vi.fn()
const updateAuth = vi.fn()
const seedPersistentMenu = vi.fn()
const commitReconnect = vi.fn()

vi.mock("@chatbotx.io/business", () => ({
  messengerIntegrationService: {
    findByIdForWorkspace,
    updateAuth,
    seedPersistentMenu,
  },
  connectionStateService: {
    commitReconnect,
  },
}))

vi.mock("@chatbotx.io/business/connection", () => ({
  authExpiresAtOf: vi.fn(() => null),
}))

// ---------------------------------------------------------------------------
// `commitReconnect` owns opening the transaction internally (see
// `ConnectionStateService.commitReconnect`'s own unit tests for that); this
// mock models the one contract this handler relies on: it invokes the
// supplied `writeAuth(tx)` exactly once with a shared tx handle.
// ---------------------------------------------------------------------------
const SENTINEL_TX = { __tx: true }

// ---------------------------------------------------------------------------
// Mock @chatbotx.io/integration-messenger
// ---------------------------------------------------------------------------
const exchangeCodeForToken = vi.fn()
const getFacebookUser = vi.fn()
const getUserPages = vi.fn()
const debugToken = vi.fn()
const toAppAccessToken = vi.fn(() => "app-token")
const messengerIntegrationModule = { runChannelHandler: vi.fn() }

vi.mock("@chatbotx.io/integration-messenger", () => ({
  exchangeCodeForToken,
  getFacebookUser,
  getUserPages,
  debugToken,
  toAppAccessToken,
  integration: messengerIntegrationModule,
}))

const ensureMessengerWhitelistedDomain = vi.fn()
const exchangeLongLivedToken = vi.fn()
const scopesToPageSubscribeFields = vi.fn(() => ["field1", "field2"])
const subscribePageToAppWebhook = vi.fn()

vi.mock("@chatbotx.io/integration-messenger/apis/page", () => ({
  ensureMessengerWhitelistedDomain,
  exchangeLongLivedToken,
  scopesToPageSubscribeFields,
  subscribePageToAppWebhook,
}))

vi.mock("@chatbotx.io/sdk", () => ({
  AuthType: { oauth2: "oauth2" },
}))

// ---------------------------------------------------------------------------
// Mock the branding follow-up helper
// ---------------------------------------------------------------------------
const seedReconnectBranding = vi.fn()
vi.mock("@/features/channel-connect/lib/branding-follow-ups", () => ({
  seedReconnectBranding,
}))

const lookupIntegrationUserInfo = vi.fn()
vi.mock("@/lib/integration-user-info", () => ({
  lookupIntegrationUserInfo,
}))

// ---------------------------------------------------------------------------
// Dynamic import is required here (not a static-import violation): vi.mock()
// factories above are hoisted above static imports, so the module under test
// must be loaded with `await import()` after they register, or it would pick
// up the real, unmocked dependencies.
// ---------------------------------------------------------------------------
const { reconnectMessengerHandler } = await import("../reconnect-callback")

const WORKSPACE_ID = "100"
const INTEGRATION_ID = "200"

function baseRow(overrides: Record<string, unknown> = {}) {
  return {
    id: INTEGRATION_ID,
    workspaceId: WORKSPACE_ID,
    inboxId: "inbox-1",
    pageId: "page-1",
    persistentMenus: [] as unknown[],
    userInfo: undefined,
    ...overrides,
  }
}

function invoke() {
  return reconnectMessengerHandler({
    credentialConfig: {
      clientId: "client-id",
      clientSecret: "client-secret",
      version: "v19.0",
    },
    workspaceId: WORKSPACE_ID,
    integrationId: INTEGRATION_ID,
    code: "oauth-code",
    callbackUrl: "https://app.example/callback",
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  commitReconnect.mockImplementation(
    async ({ writeAuth }: { writeAuth: (tx: unknown) => Promise<void> }) =>
      await writeAuth(SENTINEL_TX),
  )
  findByIdForWorkspace.mockResolvedValue(baseRow())
  updateAuth.mockResolvedValue(undefined)
  seedReconnectBranding.mockResolvedValue({ appUrl: "https://app.example" })
  exchangeCodeForToken.mockResolvedValue("short-lived-token")
  exchangeLongLivedToken.mockImplementation(
    async (_config: unknown, token: string) => `long-${token}`,
  )
  getUserPages.mockResolvedValue({
    pages: [
      { id: "page-1", access_token: "page-access-token", name: "My Page" },
    ],
  })
  lookupIntegrationUserInfo.mockResolvedValue(undefined)
  debugToken.mockResolvedValue({ scopes: ["pages_messaging"] })
  subscribePageToAppWebhook.mockResolvedValue(undefined)
  ensureMessengerWhitelistedDomain.mockResolvedValue(undefined)
})

describe("reconnectMessengerHandler — Part 1: transaction atomicity", () => {
  test("calls commitReconnect with the inbox/workspace/auth and a writeAuth that persists the satellite row through the shared tx", async () => {
    await invoke()

    expect(commitReconnect).toHaveBeenCalledTimes(1)
    expect(commitReconnect).toHaveBeenCalledWith(
      expect.objectContaining({
        inboxId: "inbox-1",
        workspaceId: WORKSPACE_ID,
      }),
    )
    expect(updateAuth).toHaveBeenCalledWith(
      expect.objectContaining({ tx: SENTINEL_TX }),
    )
  })

  test("propagates a commitReconnect failure (e.g. channelLimitReached from the inbox re-check) as a failed reconnect", async () => {
    const channelLimitReached = Object.assign(
      new Error("Channel limit reached"),
      { code: "channelLimitReached" },
    )
    commitReconnect.mockImplementation(async ({ writeAuth }) => {
      await writeAuth(SENTINEL_TX)
      throw channelLimitReached
    })

    const result = await invoke()

    expect(result).toEqual({ status: "error", reason: "failed" })
    expect(commitReconnect).toHaveBeenCalledTimes(1)
    expect(updateAuth).toHaveBeenCalledWith(
      expect.objectContaining({ tx: SENTINEL_TX }),
    )
    // A failed transaction must abort the whole reconnect before any
    // post-commit follow-up (branding, webhook resubscribe) runs.
    expect(seedReconnectBranding).not.toHaveBeenCalled()
    expect(subscribePageToAppWebhook).not.toHaveBeenCalled()
  })
})

describe("reconnectMessengerHandler — Part 2: branding follow-up", () => {
  test("seeds the community branding entry when the satellite row has none", async () => {
    const result = await invoke()

    expect(result).toEqual({ status: "success" })
    expect(seedReconnectBranding).toHaveBeenCalledTimes(1)

    const call = seedReconnectBranding.mock.calls[0][0]
    expect(call.channel).toBe("messenger")
    expect(call.integration).toBe(messengerIntegrationModule)
    expect(call.integrationType).toBe("messenger")
    expect(call.workspaceId).toBe(WORKSPACE_ID)
    expect(call.integrationId).toBe(INTEGRATION_ID)
    expect(typeof call.persistBrandingMenu).toBe("function")

    const entry = {
      label: "Built with",
      type: "url" as const,
      url: "https://x",
    }
    await call.persistBrandingMenu(entry)
    expect(seedPersistentMenu).toHaveBeenCalledWith({
      id: INTEGRATION_ID,
      entry,
    })
  })

  test("does not clobber an existing persistent menu", async () => {
    findByIdForWorkspace.mockResolvedValue(
      baseRow({ persistentMenus: [{ label: "x", type: "url", url: "y" }] }),
    )

    await invoke()

    const call = seedReconnectBranding.mock.calls[0][0]
    expect(call.persistBrandingMenu).toBeUndefined()
  })
})
