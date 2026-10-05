import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  deleteByIntegration: vi.fn(),
  disconnectInbox: vi.fn(),
  existsForPage: vi.fn(),
  remoteDisconnect: vi.fn(),
  serviceDisconnect: vi.fn(),
  tearDownForIntegration: vi.fn(),
  transaction: vi.fn(),
  tx: { marker: "tx" },
}))

vi.mock("@chatbotx.io/business", () => ({
  coexistService: { tearDownForIntegration: mocks.tearDownForIntegration },
  instagramIntegrationService: { existsForPage: mocks.existsForPage },
  messengerIntegrationService: { disconnect: mocks.serviceDisconnect },
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
  isDisconnectSafeError: vi.fn(() => false),
  integration: { disconnect: mocks.remoteDisconnect },
}))

vi.mock("@chatbotx.io/integration-messenger/apis/page", () => ({
  subscribePageToAppWebhook: vi.fn(),
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
const { disconnectMessengerConnection } = await import(
  "../src/messenger-teardown"
)

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
    mocks.remoteDisconnect.mockResolvedValue(undefined)
    mocks.tearDownForIntegration.mockResolvedValue(undefined)
    mocks.deleteByIntegration.mockResolvedValue(undefined)
    mocks.serviceDisconnect.mockResolvedValue(undefined)
    mocks.disconnectInbox.mockResolvedValue(undefined)
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
})
