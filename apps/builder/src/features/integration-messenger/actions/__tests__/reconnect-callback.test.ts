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
const reconnectInbox = vi.fn()
const findWorkspaceById = vi.fn()
const resolveTenantSettingsMock = vi.fn()

vi.mock("@chatbotx.io/business", () => ({
  messengerIntegrationService: {
    findByIdForWorkspace,
    updateAuth,
    seedPersistentMenu,
  },
  connectionStateService: {
    reconnectInbox,
  },
  workspaceService: {
    findById: findWorkspaceById,
  },
  resolveTenantSettings: resolveTenantSettingsMock,
}))

vi.mock("@chatbotx.io/business/connection", () => ({
  authExpiresAtOf: vi.fn(() => null),
}))

// ---------------------------------------------------------------------------
// Mock @chatbotx.io/database/client — `db.transaction` mimics Drizzle's real
// semantics closely enough for this test: it runs the callback against one
// shared `tx` handle and forwards whatever the callback does (resolve/reject).
// ---------------------------------------------------------------------------
const SENTINEL_TX = { __tx: true }
const dbTransaction = vi.fn(
  async (callback: (tx: unknown) => unknown) => await callback(SENTINEL_TX),
)
vi.mock("@chatbotx.io/database/client", () => ({
  db: { transaction: dbTransaction },
}))

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
// Mock the branding follow-up + its URL builder
// ---------------------------------------------------------------------------
const runBrandingFollowUps = vi.fn()
vi.mock("@/features/channel-connect/lib/branding-follow-ups", () => ({
  runBrandingFollowUps,
}))

const getBrandingUrl = vi.fn(() => "https://branding.example/messenger")
vi.mock("@/features/integration-webchat/lib", () => ({
  getBrandingUrl,
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
const WORKSPACE = { id: WORKSPACE_ID, ownerId: "owner-1" }

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
  dbTransaction.mockImplementation(
    async (callback: (tx: unknown) => unknown) => await callback(SENTINEL_TX),
  )
  findByIdForWorkspace.mockResolvedValue(baseRow())
  updateAuth.mockResolvedValue(undefined)
  reconnectInbox.mockResolvedValue(undefined)
  findWorkspaceById.mockResolvedValue(WORKSPACE)
  resolveTenantSettingsMock.mockResolvedValue({ appUrl: "https://app.example" })
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
  runBrandingFollowUps.mockResolvedValue(undefined)
})

describe("reconnectMessengerHandler — Part 1: transaction atomicity", () => {
  test("wraps the auth write and reconnectInbox in one shared transaction", async () => {
    await invoke()

    expect(dbTransaction).toHaveBeenCalledTimes(1)
    expect(updateAuth).toHaveBeenCalledWith(
      expect.objectContaining({ tx: SENTINEL_TX }),
    )
    expect(reconnectInbox).toHaveBeenCalledWith(
      expect.objectContaining({ tx: SENTINEL_TX }),
    )
  })

  test("rolls back the whole reconnect when reconnectInbox fails after the auth write (e.g. channelLimitReached)", async () => {
    const channelLimitReached = Object.assign(
      new Error("Channel limit reached"),
      {
        code: "channelLimitReached",
      },
    )
    reconnectInbox.mockRejectedValue(channelLimitReached)

    const result = await invoke()

    expect(result).toEqual({ status: "error", reason: "failed" })
    // Both writes ran through the SAME transaction boundary, so the thrown
    // error aborts the whole thing — there is no "auth saved, inbox state
    // stale" partial outcome for the real DB to commit.
    expect(dbTransaction).toHaveBeenCalledTimes(1)
    expect(updateAuth).toHaveBeenCalledWith(
      expect.objectContaining({ tx: SENTINEL_TX }),
    )
    // A failed transaction must abort the whole reconnect before any
    // post-commit follow-up (branding, webhook resubscribe) runs.
    expect(runBrandingFollowUps).not.toHaveBeenCalled()
    expect(subscribePageToAppWebhook).not.toHaveBeenCalled()
  })
})

describe("reconnectMessengerHandler — Part 2: branding follow-up", () => {
  test("seeds the community branding entry when the satellite row has none", async () => {
    const result = await invoke()

    expect(result).toEqual({ status: "success" })
    expect(runBrandingFollowUps).toHaveBeenCalledTimes(1)
    expect(getBrandingUrl).toHaveBeenCalledWith(
      "messenger",
      "https://app.example",
    )

    const call = runBrandingFollowUps.mock.calls[0][0]
    expect(call.integration).toBe(messengerIntegrationModule)
    expect(call.integrationType).toBe("messenger")
    expect(call.session.workspace).toEqual(WORKSPACE)
    expect(call.session.brandingMenuEntry.url).toBe(
      "https://branding.example/messenger",
    )
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

    const call = runBrandingFollowUps.mock.calls[0][0]
    expect(call.persistBrandingMenu).toBeUndefined()
  })

  test("a branding follow-up failure never fails the reconnect", async () => {
    runBrandingFollowUps.mockRejectedValue(new Error("Graph API down"))

    const result = await invoke()

    expect(result).toEqual({ status: "success" })
  })
})
