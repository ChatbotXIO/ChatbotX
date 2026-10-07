import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  deleteByIntegration: vi.fn(),
  disconnectInbox: vi.fn(),
  existsForPage: vi.fn(),
  findByInboxId: vi.fn(),
  isDisconnectSafeError: vi.fn(),
  remoteDisconnect: vi.fn(),
  serviceDisconnect: vi.fn(),
  subscribePageToAppWebhook: vi.fn(),
  tearDownForIntegration: vi.fn(),
  transaction: vi.fn(),
  tx: { marker: "tx" },
}))

vi.mock("@chatbotx.io/business", () => ({
  coexistService: { tearDownForIntegration: mocks.tearDownForIntegration },
  instagramIntegrationService: { existsForPage: mocks.existsForPage },
  messengerIntegrationService: {
    disconnect: mocks.serviceDisconnect,
    findByInboxId: mocks.findByInboxId,
  },
}))

vi.mock("@chatbotx.io/business/connection", () => ({
  connectionStateService: { disconnectInbox: mocks.disconnectInbox },
}))

vi.mock("@chatbotx.io/database/client", () => ({
  db: { transaction: mocks.transaction },
}))

vi.mock("@chatbotx.io/database/repositories", () => ({
  metaCapiEventRepository: { deleteByIntegration: mocks.deleteByIntegration },
}))

vi.mock("@chatbotx.io/integration-messenger", () => ({
  isDisconnectSafeError: mocks.isDisconnectSafeError,
  integration: { disconnect: mocks.remoteDisconnect },
}))

vi.mock("@chatbotx.io/integration-messenger/apis/page", () => ({
  subscribePageToAppWebhook: mocks.subscribePageToAppWebhook,
}))

vi.mock("../src/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn() },
}))

// ---------------------------------------------------------------------------
// Dynamic import is required here (not a static-import violation): vi.mock()
// factories above are hoisted above static imports, so the module under test
// must be loaded with `await import()` after they register, or it would pick
// up the real, unmocked dependencies.
// ---------------------------------------------------------------------------
const { disconnectMessengerConnection, messengerConnectionTeardownHook } =
  await import("../src/messenger-teardown")

const BASE_INPUT = {
  workspaceId: "ws-1",
  integrationId: "integration-1",
  inboxId: "inbox-1",
  ownerId: "owner-1",
  auth: {
    clientId: "client-1",
    metadata: { pageId: "page-1", version: "v1" },
    tokens: { accessToken: "token" },
  },
} as Parameters<typeof disconnectMessengerConnection>[0]

describe("disconnectMessengerConnection", () => {
  beforeEach(() => {
    mocks.existsForPage.mockResolvedValue(false)
    mocks.isDisconnectSafeError.mockReturnValue(false)
    mocks.remoteDisconnect.mockResolvedValue(undefined)
    mocks.tearDownForIntegration.mockResolvedValue(undefined)
    mocks.deleteByIntegration.mockResolvedValue(undefined)
    mocks.serviceDisconnect.mockResolvedValue(undefined)
    mocks.disconnectInbox.mockResolvedValue(undefined)
    mocks.subscribePageToAppWebhook.mockResolvedValue(undefined)
    mocks.transaction.mockImplementation(
      async (callback: (tx: unknown) => Promise<unknown>) =>
        await callback(mocks.tx),
    )
  })

  test("opens its own db.transaction and runs the coexist/MetaCapiEvent/satellite teardown plus connectionStateService.disconnectInbox inside it", async () => {
    await disconnectMessengerConnection(BASE_INPUT)

    expect(mocks.transaction).toHaveBeenCalledTimes(1)
    expect(mocks.tearDownForIntegration).toHaveBeenCalledWith({
      workspaceId: BASE_INPUT.workspaceId,
      integrationId: BASE_INPUT.integrationId,
      channel: "messenger",
      currentError: "Integration disconnected",
      tx: mocks.tx,
    })
    expect(mocks.deleteByIntegration).toHaveBeenCalledWith(
      {
        workspaceId: BASE_INPUT.workspaceId,
        channel: "messenger",
        integrationId: BASE_INPUT.integrationId,
      },
      mocks.tx,
    )
    expect(mocks.serviceDisconnect).toHaveBeenCalledWith({
      id: BASE_INPUT.integrationId,
      tx: mocks.tx,
    })
    expect(mocks.disconnectInbox).toHaveBeenCalledWith({
      inboxId: BASE_INPUT.inboxId,
      ownerId: BASE_INPUT.ownerId,
      workspaceId: BASE_INPUT.workspaceId,
      tx: mocks.tx,
    })
  })

  test("rolls back: a failing write inside the transaction rejects the whole call and later steps never run", async () => {
    const failure = new Error("constraint violation")
    mocks.deleteByIntegration.mockRejectedValueOnce(failure)

    await expect(disconnectMessengerConnection(BASE_INPUT)).rejects.toThrow(
      failure,
    )

    expect(mocks.serviceDisconnect).not.toHaveBeenCalled()
    expect(mocks.disconnectInbox).not.toHaveBeenCalled()
  })

  // Regression: the remote Graph API phase is best-effort — a failure there
  // must never block the local database cleanup (coexist/MetaCapiEvent/
  // satellite row delete) it protects. Before the fix, a thrown error here
  // propagated out of `tearDownMessengerConnection` before the
  // `withinTransaction` closure was ever constructed, so
  // `disconnectMessengerConnection` rejected and `db.transaction` never ran,
  // leaving orphaned coexist/MetaCapiEvent rows behind.
  test("still runs the database cleanup when the remote Graph API disconnect rethrows a non-safe error", async () => {
    const graphFailure = new Error("Graph API unavailable")
    mocks.remoteDisconnect.mockRejectedValueOnce(graphFailure)

    await expect(
      disconnectMessengerConnection(BASE_INPUT),
    ).resolves.toBeUndefined()

    expect(mocks.tearDownForIntegration).toHaveBeenCalledWith({
      workspaceId: BASE_INPUT.workspaceId,
      integrationId: BASE_INPUT.integrationId,
      channel: "messenger",
      currentError: "Integration disconnected",
      tx: mocks.tx,
    })
    expect(mocks.deleteByIntegration).toHaveBeenCalledWith(
      {
        workspaceId: BASE_INPUT.workspaceId,
        channel: "messenger",
        integrationId: BASE_INPUT.integrationId,
      },
      mocks.tx,
    )
    expect(mocks.serviceDisconnect).toHaveBeenCalledWith({
      id: BASE_INPUT.integrationId,
      tx: mocks.tx,
    })
    expect(mocks.disconnectInbox).toHaveBeenCalledWith({
      inboxId: BASE_INPUT.inboxId,
      ownerId: BASE_INPUT.ownerId,
      workspaceId: BASE_INPUT.workspaceId,
      tx: mocks.tx,
    })
  })

  // Same regression, triggered from the shared-page decision itself —
  // `instagramIntegrationService.existsForPage` throwing on a database error
  // before any remote Graph API call is even attempted.
  test("still runs the database cleanup when existsForPage throws before the shared-page decision is made", async () => {
    const dbFailure = new Error("connection refused")
    mocks.existsForPage.mockRejectedValueOnce(dbFailure)

    await expect(
      disconnectMessengerConnection(BASE_INPUT),
    ).resolves.toBeUndefined()

    expect(mocks.tearDownForIntegration).toHaveBeenCalledWith({
      workspaceId: BASE_INPUT.workspaceId,
      integrationId: BASE_INPUT.integrationId,
      channel: "messenger",
      currentError: "Integration disconnected",
      tx: mocks.tx,
    })
    expect(mocks.deleteByIntegration).toHaveBeenCalledWith(
      {
        workspaceId: BASE_INPUT.workspaceId,
        channel: "messenger",
        integrationId: BASE_INPUT.integrationId,
      },
      mocks.tx,
    )
    expect(mocks.serviceDisconnect).toHaveBeenCalledWith({
      id: BASE_INPUT.integrationId,
      tx: mocks.tx,
    })
  })

  test("preserves the shared Facebook Page webhook subscription and skips the remote disconnect when an Instagram integration still shares the Page", async () => {
    mocks.existsForPage.mockResolvedValue(true)

    await disconnectMessengerConnection(BASE_INPUT)

    expect(mocks.subscribePageToAppWebhook).toHaveBeenCalledWith(
      expect.objectContaining({
        pageId: BASE_INPUT.auth.metadata.pageId,
        accessToken: BASE_INPUT.auth.tokens.accessToken,
      }),
    )
    expect(mocks.remoteDisconnect).not.toHaveBeenCalled()
  })
})

describe("messengerConnectionTeardownHook", () => {
  beforeEach(() => {
    mocks.existsForPage.mockResolvedValue(false)
    mocks.isDisconnectSafeError.mockReturnValue(false)
    mocks.remoteDisconnect.mockResolvedValue(undefined)
    mocks.findByInboxId.mockResolvedValue({ id: "integration-1" })
  })

  const HOOK_CONNECTION = {
    id: "conn-1",
    workspaceId: "ws-1",
    inboxId: "inbox-1",
  } as never

  test("resolves the satellite row by inboxId, then delegates to the shared teardown", async () => {
    const result = await messengerConnectionTeardownHook({
      connection: HOOK_CONNECTION,
      auth: BASE_INPUT.auth as never,
    })

    expect(mocks.findByInboxId).toHaveBeenCalledWith("inbox-1")
    expect(mocks.remoteDisconnect).toHaveBeenCalledWith(BASE_INPUT.auth)
    expect(result.skipGenericRemoteTeardown).toBe(true)
    expect(result.remoteErrors).toEqual([])
  })

  test("surfaces a sanitized remote Graph API failure message in remoteErrors instead of throwing", async () => {
    // `toPublicErrorMessage` is not mocked in this file, so this exercises
    // the real implementation: a plain (non-`ChatbotXException`) `Error`
    // always collapses to the call site's fallback instead of leaking its
    // raw message.
    mocks.remoteDisconnect.mockRejectedValue(new Error("Graph API down"))

    const result = await messengerConnectionTeardownHook({
      connection: HOOK_CONNECTION,
      auth: BASE_INPUT.auth as never,
    })

    expect(result.remoteErrors).toEqual(["Provider-side teardown failed"])
    expect(result.skipGenericRemoteTeardown).toBe(true)
  })

  test("does not record a disconnect-safe remote error in remoteErrors", async () => {
    mocks.remoteDisconnect.mockRejectedValue(new Error("Page not found"))
    mocks.isDisconnectSafeError.mockReturnValue(true)

    const result = await messengerConnectionTeardownHook({
      connection: HOOK_CONNECTION,
      auth: BASE_INPUT.auth as never,
    })

    expect(result.remoteErrors).toEqual([])
    expect(result.skipGenericRemoteTeardown).toBe(true)
  })

  test("skips provider-specific teardown and resolves a no-op when the connection has no inboxId", async () => {
    const connectionWithoutInboxId = {
      id: "conn-1",
      workspaceId: "ws-1",
      inboxId: null,
    } as never

    const result = await messengerConnectionTeardownHook({
      connection: connectionWithoutInboxId,
      auth: BASE_INPUT.auth as never,
    })

    expect(mocks.findByInboxId).not.toHaveBeenCalled()
    expect(result).toEqual({
      remoteErrors: [],
      skipGenericRemoteTeardown: false,
      withinTransaction: expect.any(Function),
    })
    await expect(
      result.withinTransaction(mocks.tx as never),
    ).resolves.toBeUndefined()
  })
})
