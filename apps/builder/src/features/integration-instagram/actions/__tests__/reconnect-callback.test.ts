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
  instagramIntegrationService: {
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
// Mock the branding follow-up helper
// ---------------------------------------------------------------------------
const seedReconnectBranding = vi.fn()
vi.mock("@/features/channel-connect/lib/branding-follow-ups", () => ({
  seedReconnectBranding,
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
  commitReconnect.mockImplementation(
    async ({ writeAuth }: { writeAuth: (tx: unknown) => Promise<void> }) =>
      await writeAuth(SENTINEL_TX),
  )
  updateAuth.mockResolvedValue(undefined)
  seedReconnectBranding.mockResolvedValue({ appUrl: "https://app.example" })
  subscribePageToInstagramWebhook.mockResolvedValue(undefined)
  subscribeFacebookPageToInstagramWebhook.mockResolvedValue(undefined)

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

  test("calls commitReconnect with the inbox/workspace/auth and a writeAuth that persists the satellite row through the shared tx", async () => {
    await invokeDirect()

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

    const result = await invokeDirect()

    expect(result).toEqual({ status: "error", reason: "failed" })
    expect(commitReconnect).toHaveBeenCalledTimes(1)
    expect(updateAuth).toHaveBeenCalledWith(
      expect.objectContaining({ tx: SENTINEL_TX }),
    )
    expect(seedReconnectBranding).not.toHaveBeenCalled()
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
    expect(seedReconnectBranding).toHaveBeenCalledTimes(1)

    const call = seedReconnectBranding.mock.calls[0][0]
    expect(call.channel).toBe("instagram")
    expect(call.integration).toBe(instagramChannelIntegration)
    expect(call.integrationType).toBe("instagram")
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
      directRow({ persistentMenus: [{ label: "x", type: "url", url: "y" }] }),
    )

    await invokeDirect()

    const call = seedReconnectBranding.mock.calls[0][0]
    expect(call.persistBrandingMenu).toBeUndefined()
  })
})

describe("reconnectInstagramFacebookHandler — Part 1: transaction atomicity", () => {
  beforeEach(() => {
    findByIdForWorkspace.mockResolvedValue(facebookRow())
  })

  test("calls commitReconnect with the inbox/workspace/auth and a writeAuth that persists the satellite row through the shared tx", async () => {
    await invokeFacebook()

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

    const result = await invokeFacebook()

    expect(result).toEqual({ status: "error", reason: "failed" })
    expect(seedReconnectBranding).not.toHaveBeenCalled()
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
    expect(seedReconnectBranding).toHaveBeenCalledTimes(1)

    const call = seedReconnectBranding.mock.calls[0][0]
    expect(call.channel).toBe("instagram")
    expect(call.integration).toBe(instagramFacebookChannelIntegration)
    expect(call.integrationType).toBe("instagramFacebook")
    expect(call.workspaceId).toBe(WORKSPACE_ID)
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

    const call = seedReconnectBranding.mock.calls[0][0]
    expect(call.persistBrandingMenu).toBeUndefined()
  })
})
