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
const recordConnectionAuthorization = vi.fn(async () => undefined)
const captureInboxScopes = vi.fn(async () => undefined)
const runReconnectFanOut = vi.fn(async () => null)

vi.mock("@/features/channel-connect/lib/reconnect-fan-out", () => ({
  runReconnectFanOut,
}))

vi.mock("@chatbotx.io/business", () => ({
  publishDestinationService: { captureInboxScopes },
  instagramIntegrationService: {
    findByIdForWorkspace,
    updateAuth,
    seedPersistentMenu,
  },
  connectionStateService: {
    commitReconnect,
  },
  userService: { recordConnectionAuthorization },
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
const getUnifiedInstagramAccounts = vi.fn()
const subscribePageToInstagramWebhook = vi.fn()
const instagramChannelIntegration = { runChannelHandler: vi.fn() }

vi.mock("@chatbotx.io/integration-instagram", () => ({
  getInstagramAccount,
  getUnifiedInstagramAccounts,
  subscribePageToInstagramWebhook,
  integration: instagramChannelIntegration,
}))

// ---------------------------------------------------------------------------
// Mock @chatbotx.io/integration-instagram-facebook (via-Facebook variant)
// ---------------------------------------------------------------------------
const getFacebookUser = vi.fn()
const getGrantedPermissions = vi.fn()
const getUserInstagramAccounts = vi.fn()
const subscribeFacebookPageToInstagramWebhook = vi.fn()
const instagramFacebookChannelIntegration = { runChannelHandler: vi.fn() }

vi.mock("@chatbotx.io/integration-instagram-facebook", () => ({
  getFacebookUser,
  getGrantedPermissions,
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
const USER_ID = "user-1"

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
    userId: USER_ID,
    userToken: "user-token",
    grantedScopes: ["instagram_business_basic"],
    loginType: "direct",
  })
}

function invokeUnified() {
  return reconnectInstagramHandler({
    credentialConfig: {
      clientId: "meta-app-id",
      clientSecret: "meta-app-secret",
      version: "v19.0",
    },
    workspaceId: WORKSPACE_ID,
    integrationId: INTEGRATION_ID,
    userId: USER_ID,
    userToken: "system-user-token",
    grantedScopes: null,
    loginType: "unified",
    clientBusinessId: "business-1",
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
    userId: USER_ID,
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
  getGrantedPermissions.mockResolvedValue(["instagram_content_publish"])
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

describe("reconnectInstagramHandler (Unified Login)", () => {
  beforeEach(() => {
    findByIdForWorkspace.mockResolvedValue(directRow({ pageId: "ig-1" }))
    getUnifiedInstagramAccounts.mockResolvedValue([
      {
        id: "ig-2",
        userId: "ig-2",
        name: "other",
        username: "other",
        accessToken: "system-user-token",
      },
      {
        id: "ig-1",
        userId: "ig-1",
        name: "myaccount",
        username: "myaccount",
        accessToken: "system-user-token",
      },
    ])
  })

  test("finds the stored account among the assigned accounts and keeps the Unified login type", async () => {
    const result = await invokeUnified()

    expect(result).toEqual({ status: "success" })
    expect(getUnifiedInstagramAccounts).toHaveBeenCalledWith(
      "system-user-token",
      "v19.0",
    )
    expect(getInstagramAccount).not.toHaveBeenCalled()
    const { auth } = updateAuth.mock.calls[0][0]
    expect(auth.tokens.accessToken).toBe("system-user-token")
    expect(auth.metadata).toEqual(
      expect.objectContaining({
        igId: "ig-1",
        pageId: "ig-1",
        loginType: "unified",
        clientBusinessId: "business-1",
      }),
    )
    expect(subscribePageToInstagramWebhook).toHaveBeenCalledWith({
      igId: "ig-1",
      accessToken: "system-user-token",
      version: "v19.0",
      loginType: "unified",
    })
  })

  test("addresses a channel first connected with the direct login by its igId", async () => {
    findByIdForWorkspace.mockResolvedValue(directRow({ pageId: "app-scoped" }))

    await invokeUnified()

    const { auth } = updateAuth.mock.calls[0][0]
    expect(auth.metadata.pageId).toBe("ig-1")
    expect(subscribePageToInstagramWebhook).toHaveBeenCalledWith(
      expect.objectContaining({ igId: "ig-1", loginType: "unified" }),
    )
  })

  test("rejects a token that was not assigned the stored account", async () => {
    getUnifiedInstagramAccounts.mockResolvedValue([
      { id: "ig-2", userId: "ig-2", name: "other", username: "other" },
    ])

    const result = await invokeUnified()

    expect(result).toEqual({ status: "error", reason: "accountNotFound" })
    expect(commitReconnect).not.toHaveBeenCalled()
    expect(subscribePageToInstagramWebhook).not.toHaveBeenCalled()
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

describe("Instagram reconnect — connection authorization capture", () => {
  test("direct login records the validated auth once, before the commit", async () => {
    findByIdForWorkspace.mockResolvedValue(directRow())

    await invokeDirect()

    expect(recordConnectionAuthorization).toHaveBeenCalledTimes(1)
    expect(recordConnectionAuthorization).toHaveBeenCalledWith({
      userId: USER_ID,
      provider: "instagram",
      auth: expect.objectContaining({ tokens: { accessToken: "user-token" } }),
      phase: "reconnectValidated",
      workspaceId: WORKSPACE_ID,
    })
    expect(
      recordConnectionAuthorization.mock.invocationCallOrder[0],
    ).toBeLessThan(commitReconnect.mock.invocationCallOrder[0] as number)
  })

  test("Facebook login records the validated auth once, under its own provider", async () => {
    findByIdForWorkspace.mockResolvedValue(facebookRow())

    await invokeFacebook()

    expect(recordConnectionAuthorization).toHaveBeenCalledTimes(1)
    expect(recordConnectionAuthorization).toHaveBeenCalledWith({
      userId: USER_ID,
      provider: "instagramFacebook",
      // The user-level token, not the page token that gets stored.
      auth: expect.objectContaining({ tokens: { accessToken: "user-token" } }),
      phase: "reconnectValidated",
      workspaceId: WORKSPACE_ID,
    })
  })

  test("records nothing when the authorized account is not the connected one", async () => {
    findByIdForWorkspace.mockResolvedValue(directRow())
    getInstagramAccount.mockResolvedValue({ userId: "someone-else", name: "x" })

    const result = await invokeDirect()

    expect(result).toEqual({ status: "error", reason: "accountNotFound" })
    expect(recordConnectionAuthorization).not.toHaveBeenCalled()
  })
})

describe("Instagram reconnect — publish scopes and fan-out", () => {
  test("direct login stores the scopes the code exchange reported", async () => {
    findByIdForWorkspace.mockResolvedValue(directRow())

    await invokeDirect()

    expect(captureInboxScopes).toHaveBeenCalledWith(
      {
        grantedScopes: ["instagram_business_basic"],
        inboxId: "inbox-1",
        publisherKey: "instagram",
        workspaceId: WORKSPACE_ID,
      },
      SENTINEL_TX,
    )
    expect(runReconnectFanOut).not.toHaveBeenCalled()
  })

  test("Facebook login stores the granted /me/permissions", async () => {
    findByIdForWorkspace.mockResolvedValue(facebookRow())

    await invokeFacebook()

    expect(getGrantedPermissions).toHaveBeenCalledWith("user-token", "v19.0")
    expect(captureInboxScopes).toHaveBeenCalledWith(
      {
        grantedScopes: ["instagram_content_publish"],
        inboxId: "inbox-1",
        publisherKey: "instagramFacebook",
        workspaceId: WORKSPACE_ID,
      },
      SENTINEL_TX,
    )
  })

  test("Facebook login stores unknown scopes when the permission lookup fails", async () => {
    findByIdForWorkspace.mockResolvedValue(facebookRow())
    getGrantedPermissions.mockRejectedValue(new Error("graph"))

    const result = await invokeFacebook()

    expect(result).toEqual({ status: "success" })
    expect(captureInboxScopes).toHaveBeenCalledWith(
      expect.objectContaining({ grantedScopes: null }),
      SENTINEL_TX,
    )
  })

  test("Facebook login fans out to the other Instagram accounts of the login", async () => {
    findByIdForWorkspace.mockResolvedValue(facebookRow())
    lookupIntegrationUserInfo.mockResolvedValue({ userId: "fb-user-7" })

    await invokeFacebook()

    expect(runReconnectFanOut).toHaveBeenCalledWith(
      expect.objectContaining({
        clientId: "client-id",
        facebookUserId: "fb-user-7",
        kinds: ["instagramFacebook"],
        pages: [{ accessToken: "page-access-token", id: "page-2" }],
        selectedIntegrationId: INTEGRATION_ID,
        workspaceId: WORKSPACE_ID,
      }),
    )
  })
})
