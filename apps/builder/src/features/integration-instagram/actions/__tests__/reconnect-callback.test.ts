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
  instagramIntegrationService: {
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
// Mock @chatbotx.io/integration-instagram (direct Instagram Business Login)
// ---------------------------------------------------------------------------
const getInstagramAccount = vi.fn()
const subscribePageToInstagramWebhook = vi.fn()
const instagramChannelIntegration = { runChannelHandler: vi.fn() }

vi.mock("@chatbotx.io/integration-instagram", () => ({
  getInstagramAccount,
  subscribePageToInstagramWebhook,
  integration: instagramChannelIntegration,
}))

// ---------------------------------------------------------------------------
// Mock @chatbotx.io/integration-instagram-facebook (via-Facebook variant)
// ---------------------------------------------------------------------------
const getFacebookUser = vi.fn()
const getUserInstagramAccounts = vi.fn()
const subscribeFacebookPageToInstagramWebhook = vi.fn()
const instagramFacebookChannelIntegration = { runChannelHandler: vi.fn() }

vi.mock("@chatbotx.io/integration-instagram-facebook", () => ({
  getFacebookUser,
  getUserInstagramAccounts,
  subscribePageToInstagramWebhook: subscribeFacebookPageToInstagramWebhook,
  integration: instagramFacebookChannelIntegration,
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

const getBrandingUrl = vi.fn(() => "https://branding.example/instagram")
vi.mock("@/features/integration-webchat/lib", () => ({
  getBrandingUrl,
}))

const buildIntegrationUserInfo = vi.fn()
const lookupIntegrationUserInfo = vi.fn()
vi.mock("@/lib/integration-user-info", () => ({
  buildIntegrationUserInfo,
  lookupIntegrationUserInfo,
}))

// ---------------------------------------------------------------------------
// Dynamic import is required here (not a static-import violation): vi.mock()
// factories above are hoisted above static imports, so the module under test
// must be loaded with `await import()` after they register, or it would pick
// up the real, unmocked dependencies.
// ---------------------------------------------------------------------------
const { reconnectInstagramHandler, reconnectInstagramFacebookHandler } =
  await import("../reconnect-callback")

const WORKSPACE_ID = "100"
const INTEGRATION_ID = "200"
const WORKSPACE = { id: WORKSPACE_ID, ownerId: "owner-1" }

function directRow(overrides: Record<string, unknown> = {}) {
  return {
    id: INTEGRATION_ID,
    workspaceId: WORKSPACE_ID,
    inboxId: "inbox-1",
    type: "instagram" as const,
    igId: "ig-1",
    pageId: "page-1",
    persistentMenus: [] as unknown[],
    userInfo: undefined,
    ...overrides,
  }
}

function facebookRow(overrides: Record<string, unknown> = {}) {
  return {
    id: INTEGRATION_ID,
    workspaceId: WORKSPACE_ID,
    inboxId: "inbox-1",
    type: "facebook" as const,
    igId: "ig-1",
    pageId: "page-1",
    persistentMenus: [] as unknown[],
    userInfo: undefined,
    ...overrides,
  }
}

function invokeDirect() {
  return reconnectInstagramHandler({
    credentialConfig: {
      clientId: "client-id",
      clientSecret: "client-secret",
      version: "v19.0",
    },
    workspaceId: WORKSPACE_ID,
    integrationId: INTEGRATION_ID,
    userToken: "user-token",
  })
}

function invokeFacebook() {
  return reconnectInstagramFacebookHandler({
    credentialConfig: {
      clientId: "client-id",
      clientSecret: "client-secret",
      version: "v19.0",
    },
    workspaceId: WORKSPACE_ID,
    integrationId: INTEGRATION_ID,
    userToken: "user-token",
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  dbTransaction.mockImplementation(
    async (callback: (tx: unknown) => unknown) => await callback(SENTINEL_TX),
  )
  updateAuth.mockResolvedValue(undefined)
  reconnectInbox.mockResolvedValue(undefined)
  findWorkspaceById.mockResolvedValue(WORKSPACE)
  resolveTenantSettingsMock.mockResolvedValue({ appUrl: "https://app.example" })
  subscribePageToInstagramWebhook.mockResolvedValue(undefined)
  subscribeFacebookPageToInstagramWebhook.mockResolvedValue(undefined)
  runBrandingFollowUps.mockResolvedValue(undefined)

  getInstagramAccount.mockResolvedValue({
    userId: "ig-1",
    name: "My Account",
    username: "myaccount",
    profile_picture_url: "https://avatar",
  })
  buildIntegrationUserInfo.mockResolvedValue(undefined)

  getUserInstagramAccounts.mockResolvedValue([
    {
      id: "ig-1",
      name: "My Account",
      username: "myaccount",
      pageId: "page-2",
      pageAccessToken: "page-access-token",
    },
  ])
  lookupIntegrationUserInfo.mockResolvedValue(undefined)
})

describe("reconnectInstagramHandler (direct login) — Part 1: transaction atomicity", () => {
  beforeEach(() => {
    findByIdForWorkspace.mockResolvedValue(directRow())
  })

  test("wraps the auth write and reconnectInbox in one shared transaction", async () => {
    await invokeDirect()

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
      { code: "channelLimitReached" },
    )
    reconnectInbox.mockRejectedValue(channelLimitReached)

    const result = await invokeDirect()

    expect(result).toEqual({ status: "error", reason: "failed" })
    expect(dbTransaction).toHaveBeenCalledTimes(1)
    expect(updateAuth).toHaveBeenCalledWith(
      expect.objectContaining({ tx: SENTINEL_TX }),
    )
    expect(runBrandingFollowUps).not.toHaveBeenCalled()
    expect(subscribePageToInstagramWebhook).not.toHaveBeenCalled()
  })
})

describe("reconnectInstagramHandler (direct login) — Part 2: branding follow-up", () => {
  beforeEach(() => {
    findByIdForWorkspace.mockResolvedValue(directRow())
  })

  test("seeds the community branding entry when the satellite row has none", async () => {
    const result = await invokeDirect()

    expect(result).toEqual({ status: "success" })
    expect(runBrandingFollowUps).toHaveBeenCalledTimes(1)
    expect(getBrandingUrl).toHaveBeenCalledWith(
      "instagram",
      "https://app.example",
    )

    const call = runBrandingFollowUps.mock.calls[0][0]
    expect(call.integration).toBe(instagramChannelIntegration)
    expect(call.integrationType).toBe("instagram")
    expect(call.session.workspace).toEqual(WORKSPACE)
    expect(call.session.brandingMenuEntry.url).toBe(
      "https://branding.example/instagram",
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
      directRow({ persistentMenus: [{ label: "x", type: "url", url: "y" }] }),
    )

    await invokeDirect()

    const call = runBrandingFollowUps.mock.calls[0][0]
    expect(call.persistBrandingMenu).toBeUndefined()
  })
})

describe("reconnectInstagramFacebookHandler — Part 1: transaction atomicity", () => {
  beforeEach(() => {
    findByIdForWorkspace.mockResolvedValue(facebookRow())
  })

  test("wraps the auth write and reconnectInbox in one shared transaction", async () => {
    await invokeFacebook()

    expect(dbTransaction).toHaveBeenCalledTimes(1)
    expect(updateAuth).toHaveBeenCalledWith(
      expect.objectContaining({ tx: SENTINEL_TX }),
    )
    expect(reconnectInbox).toHaveBeenCalledWith(
      expect.objectContaining({ tx: SENTINEL_TX }),
    )
  })

  test("rolls back the whole reconnect when reconnectInbox fails after the auth write", async () => {
    const channelLimitReached = Object.assign(
      new Error("Channel limit reached"),
      { code: "channelLimitReached" },
    )
    reconnectInbox.mockRejectedValue(channelLimitReached)

    const result = await invokeFacebook()

    expect(result).toEqual({ status: "error", reason: "failed" })
    expect(runBrandingFollowUps).not.toHaveBeenCalled()
    expect(subscribeFacebookPageToInstagramWebhook).not.toHaveBeenCalled()
  })
})

describe("reconnectInstagramFacebookHandler — Part 2: branding follow-up", () => {
  beforeEach(() => {
    findByIdForWorkspace.mockResolvedValue(facebookRow())
  })

  test("seeds the community branding entry via the Facebook-variant integration module", async () => {
    const result = await invokeFacebook()

    expect(result).toEqual({ status: "success" })
    expect(runBrandingFollowUps).toHaveBeenCalledTimes(1)

    const call = runBrandingFollowUps.mock.calls[0][0]
    expect(call.integration).toBe(instagramFacebookChannelIntegration)
    expect(call.integrationType).toBe("instagramFacebook")
    expect(call.session.workspace).toEqual(WORKSPACE)
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
      facebookRow({ persistentMenus: [{ label: "x", type: "url", url: "y" }] }),
    )

    await invokeFacebook()

    const call = runBrandingFollowUps.mock.calls[0][0]
    expect(call.persistBrandingMenu).toBeUndefined()
  })
})
