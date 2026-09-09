import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  findWithIntegrations: vi.fn(),
  findLatestContactScanRun: vi.fn(),
  createContactScanRun: vi.fn(),
  claimContactScanRun: vi.fn(),
  yieldForContinuation: vi.fn(),
  reopenReleased: vi.fn(),
  updateProgress: vi.fn(),
  incrementProgress: vi.fn(),
  markSucceeded: vi.fn(),
  markPartial: vi.fn(),
  markFailed: vi.fn(),
  pickDueRuns: vi.fn(),
  markMaxAttemptsFailed: vi.fn(),
  findRunById: vi.fn(),
  listContactScanRuns: vi.fn(),
}))

vi.mock("@chatbotx.io/database/repositories", () => ({
  coexistSyncRunRepository: {
    findLatestContactScanRun: mocks.findLatestContactScanRun,
    createContactScanRun: mocks.createContactScanRun,
    claimContactScanRun: mocks.claimContactScanRun,
    yieldForContinuation: mocks.yieldForContinuation,
    reopenReleased: mocks.reopenReleased,
    updateProgress: mocks.updateProgress,
    incrementProgress: mocks.incrementProgress,
    markSucceeded: mocks.markSucceeded,
    markPartial: mocks.markPartial,
    markFailed: mocks.markFailed,
    pickDueRuns: mocks.pickDueRuns,
    markMaxAttemptsFailed: mocks.markMaxAttemptsFailed,
    findRunById: mocks.findRunById,
    listContactScanRuns: mocks.listContactScanRuns,
  },
}))

vi.mock("../src/inbox/service", () => ({
  inboxService: {
    findWithIntegrations: mocks.findWithIntegrations,
  },
}))

vi.mock("@chatbotx.io/redis", () => ({
  invalidateCacheByTags: vi.fn(),
}))

const { contactScanService } = await import("../src/contact-scan/service")
const { contactScanIntegrationRefs } = await import(
  "../src/contact-scan/channel-registry"
)
const { CONTACT_SCAN_TRIGGER_SOURCE } = await import(
  "../src/contact-scan/constants"
)

const WORKSPACE_ID = "workspace-1"
const INBOX_ID = "inbox-1"
const INTEGRATION_ID = "integration-1"
const USER_ID = "user-1"

const connectedMessengerInbox = {
  id: INBOX_ID,
  workspaceId: WORKSPACE_ID,
  channel: "messenger",
  status: "connected",
  integrationMessenger: { id: INTEGRATION_ID },
}

const pastDate = new Date(Date.now() - 60 * 60 * 1000)
const futureDate = new Date(Date.now() + 60 * 60 * 1000)

describe("contactScanService.schedule", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.findWithIntegrations.mockResolvedValue(connectedMessengerInbox)
    mocks.findLatestContactScanRun.mockResolvedValue(null)
    mocks.createContactScanRun.mockResolvedValue({ id: "run-1" })
  })

  test("happy path creates a run with the expected fields", async () => {
    await expect(
      contactScanService.schedule({
        workspaceId: WORKSPACE_ID,
        inboxId: INBOX_ID,
        requestedByUserId: USER_ID,
        scanFromAt: pastDate,
      }),
    ).resolves.toEqual({ runId: "run-1" })

    expect(mocks.findWithIntegrations).toHaveBeenCalledWith({
      where: { id: INBOX_ID, workspaceId: WORKSPACE_ID },
    })
    expect(mocks.createContactScanRun).toHaveBeenCalledWith({
      workspaceId: WORKSPACE_ID,
      integrationId: INTEGRATION_ID,
      channel: "messenger",
      requestedByUserId: USER_ID,
      scanFromAt: pastDate,
      triggerSource: CONTACT_SCAN_TRIGGER_SOURCE,
    })
  })

  test("rejects a `scanFromAt` that is not in the past", async () => {
    await expect(
      contactScanService.schedule({
        workspaceId: WORKSPACE_ID,
        inboxId: INBOX_ID,
        requestedByUserId: USER_ID,
        scanFromAt: futureDate,
      }),
    ).rejects.toMatchObject({
      code: "contactScanFromTimeInvalid",
      httpStatusCode: 400,
    })
    expect(mocks.findWithIntegrations).not.toHaveBeenCalled()
  })

  test("rejects when the inbox is missing or belongs to another workspace", async () => {
    mocks.findWithIntegrations.mockResolvedValue(undefined)

    await expect(
      contactScanService.schedule({
        workspaceId: WORKSPACE_ID,
        inboxId: INBOX_ID,
        requestedByUserId: USER_ID,
        scanFromAt: pastDate,
      }),
    ).rejects.toMatchObject({
      code: "contactScanInboxNotFound",
      httpStatusCode: 404,
    })
    expect(mocks.createContactScanRun).not.toHaveBeenCalled()
  })

  test("rejects an unsupported channel", async () => {
    mocks.findWithIntegrations.mockResolvedValue({
      ...connectedMessengerInbox,
      channel: "zalo",
      integrationMessenger: undefined,
    })

    await expect(
      contactScanService.schedule({
        workspaceId: WORKSPACE_ID,
        inboxId: INBOX_ID,
        requestedByUserId: USER_ID,
        scanFromAt: pastDate,
      }),
    ).rejects.toMatchObject({
      code: "contactScanChannelUnsupported",
      httpStatusCode: 400,
    })
  })

  test("rejects a disconnected inbox", async () => {
    mocks.findWithIntegrations.mockResolvedValue({
      ...connectedMessengerInbox,
      status: "disconnected",
    })

    await expect(
      contactScanService.schedule({
        workspaceId: WORKSPACE_ID,
        inboxId: INBOX_ID,
        requestedByUserId: USER_ID,
        scanFromAt: pastDate,
      }),
    ).rejects.toMatchObject({
      code: "contactScanIntegrationDisconnected",
      httpStatusCode: 400,
    })
  })

  test("rejects a connected inbox with no matching integration relation loaded", async () => {
    mocks.findWithIntegrations.mockResolvedValue({
      ...connectedMessengerInbox,
      integrationMessenger: null,
    })

    await expect(
      contactScanService.schedule({
        workspaceId: WORKSPACE_ID,
        inboxId: INBOX_ID,
        requestedByUserId: USER_ID,
        scanFromAt: pastDate,
      }),
    ).rejects.toMatchObject({
      code: "contactScanIntegrationDisconnected",
      httpStatusCode: 400,
    })
    expect(mocks.createContactScanRun).not.toHaveBeenCalled()
  })

  test("rejects while the previous scan is still in cooldown", async () => {
    mocks.findLatestContactScanRun.mockResolvedValue({
      id: "run-0",
      status: "succeeded",
      createdAt: new Date(Date.now() - 60 * 60 * 1000), // 1h ago, < 24h cooldown
    })

    await expect(
      contactScanService.schedule({
        workspaceId: WORKSPACE_ID,
        inboxId: INBOX_ID,
        requestedByUserId: USER_ID,
        scanFromAt: pastDate,
      }),
    ).rejects.toMatchObject({
      code: "contactScanCooldown",
      httpStatusCode: 409,
    })
    expect(mocks.createContactScanRun).not.toHaveBeenCalled()
  })

  test("rejects while a scan is already running", async () => {
    mocks.findLatestContactScanRun.mockResolvedValue({
      id: "run-0",
      status: "running",
      createdAt: new Date(Date.now() - 60 * 60 * 1000),
    })

    await expect(
      contactScanService.schedule({
        workspaceId: WORKSPACE_ID,
        inboxId: INBOX_ID,
        requestedByUserId: USER_ID,
        scanFromAt: pastDate,
      }),
    ).rejects.toMatchObject({
      code: "contactScanAlreadyRunning",
      httpStatusCode: 409,
    })
    expect(mocks.createContactScanRun).not.toHaveBeenCalled()
  })

  test("race: availability said open but createContactScanRun lost the unique-index race → contactScanAlreadyRunning", async () => {
    mocks.findLatestContactScanRun.mockResolvedValue(null)
    mocks.createContactScanRun.mockResolvedValue(null)

    await expect(
      contactScanService.schedule({
        workspaceId: WORKSPACE_ID,
        inboxId: INBOX_ID,
        requestedByUserId: USER_ID,
        scanFromAt: pastDate,
      }),
    ).rejects.toMatchObject({
      code: "contactScanAlreadyRunning",
      httpStatusCode: 409,
    })
  })
})

describe("contactScanService.getStatus", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test("returns idle without querying runs when the inbox is unknown", async () => {
    mocks.findWithIntegrations.mockResolvedValue(undefined)

    await expect(
      contactScanService.getStatus({
        workspaceId: WORKSPACE_ID,
        inboxId: INBOX_ID,
      }),
    ).resolves.toEqual({
      status: "idle",
      latest: null,
      availability: { canScan: true },
    })
    expect(mocks.findLatestContactScanRun).not.toHaveBeenCalled()
  })

  test("returns idle without querying runs for a non-scan channel", async () => {
    mocks.findWithIntegrations.mockResolvedValue({
      ...connectedMessengerInbox,
      channel: "zalo",
    })

    await expect(
      contactScanService.getStatus({
        workspaceId: WORKSPACE_ID,
        inboxId: INBOX_ID,
      }),
    ).resolves.toEqual({
      status: "idle",
      latest: null,
      availability: { canScan: true },
    })
    expect(mocks.findLatestContactScanRun).not.toHaveBeenCalled()
  })

  test("returns idle without querying runs when the integration relation is missing", async () => {
    mocks.findWithIntegrations.mockResolvedValue({
      ...connectedMessengerInbox,
      integrationMessenger: null,
    })

    await expect(
      contactScanService.getStatus({
        workspaceId: WORKSPACE_ID,
        inboxId: INBOX_ID,
      }),
    ).resolves.toEqual({
      status: "idle",
      latest: null,
      availability: { canScan: true },
    })
    expect(mocks.findLatestContactScanRun).not.toHaveBeenCalled()
  })

  test("resolves inbox → integration then returns the built view for a resolved inbox", async () => {
    mocks.findWithIntegrations.mockResolvedValue(connectedMessengerInbox)
    const createdAt = new Date(Date.now() - 60 * 60 * 1000)
    mocks.findLatestContactScanRun.mockResolvedValue({
      id: "run-1",
      status: "succeeded",
      scanFromAt: pastDate,
      createdAt,
      startedAt: createdAt,
      finishedAt: new Date(),
      importedContactCount: 42,
      currentScan: 100,
      currentError: null,
    })

    const result = await contactScanService.getStatus({
      workspaceId: WORKSPACE_ID,
      inboxId: INBOX_ID,
    })

    expect(mocks.findLatestContactScanRun).toHaveBeenCalledWith({
      workspaceId: WORKSPACE_ID,
      integrationId: INTEGRATION_ID,
    })
    expect(result.status).toBe("succeeded")
    expect(result.latest).toEqual({
      id: "run-1",
      status: "succeeded",
      scanFromAt: pastDate,
      createdAt,
      startedAt: createdAt,
      finishedAt: result.latest?.finishedAt,
      importedContactCount: 42,
      currentScan: 100,
      currentError: null,
    })
    expect(result.availability.canScan).toBe(false)
  })
})

describe("contactScanService thin delegations", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test("pickDue always passes type: contact_scan", async () => {
    mocks.pickDueRuns.mockResolvedValue([])
    await contactScanService.pickDue({ batchSize: 10, maxAttempts: 5 })
    expect(mocks.pickDueRuns).toHaveBeenCalledWith({
      batchSize: 10,
      maxAttempts: 5,
      type: "contact_scan",
    })
  })

  test("markMaxAttemptsFailed always passes type: contact_scan", async () => {
    await contactScanService.markMaxAttemptsFailed({ maxAttempts: 5 })
    expect(mocks.markMaxAttemptsFailed).toHaveBeenCalledWith({
      maxAttempts: 5,
      type: "contact_scan",
    })
  })

  test("claim delegates to claimContactScanRun", async () => {
    mocks.claimContactScanRun.mockResolvedValue({ id: "run-1" })
    await contactScanService.claim({ runId: "run-1" })
    expect(mocks.claimContactScanRun).toHaveBeenCalledWith({
      runId: "run-1",
    })
  })

  test("yieldForContinuation delegates with the expect guard", async () => {
    const expect_ = { status: "running" as const, claimToken: "token-1" }
    mocks.yieldForContinuation.mockResolvedValue(1)
    await contactScanService.yieldForContinuation({
      runId: "run-1",
      expect: expect_,
    })
    expect(mocks.yieldForContinuation).toHaveBeenCalledWith({
      runId: "run-1",
      expect: expect_,
    })
  })

  test("reopenReleased delegates to the repository", async () => {
    mocks.reopenReleased.mockResolvedValue(1)
    await contactScanService.reopenReleased({ runId: "run-1" })
    expect(mocks.reopenReleased).toHaveBeenCalledWith({ runId: "run-1" })
  })

  test("updateProgress delegates to the repository", async () => {
    mocks.updateProgress.mockResolvedValue(1)
    await contactScanService.updateProgress({
      runId: "run-1",
      fields: { resumeCursor: "cursor-1" },
    })
    expect(mocks.updateProgress).toHaveBeenCalledWith({
      runId: "run-1",
      fields: { resumeCursor: "cursor-1" },
    })
  })

  test("incrementProgress delegates to the repository", async () => {
    mocks.incrementProgress.mockResolvedValue(1)
    await contactScanService.incrementProgress({
      runId: "run-1",
      increments: { currentScan: 5 },
      expect: { status: "running", claimToken: "token-1" },
    })
    expect(mocks.incrementProgress).toHaveBeenCalledWith({
      runId: "run-1",
      increments: { currentScan: 5 },
      expect: { status: "running", claimToken: "token-1" },
    })
  })

  test("findRunById delegates to the repository", async () => {
    mocks.findRunById.mockResolvedValue({ id: "run-1" })
    await contactScanService.findRunById({ runId: "run-1" })
    expect(mocks.findRunById).toHaveBeenCalledWith({ runId: "run-1" })
  })

  test("listHistory delegates to listContactScanRuns and narrows rows to the history view", async () => {
    const createdAt = new Date("2026-01-01T00:00:00Z")
    mocks.listContactScanRuns.mockResolvedValue({
      data: [
        {
          id: "run-1",
          workspaceId: WORKSPACE_ID,
          channel: "messenger",
          status: "succeeded",
          scanFromAt: createdAt,
          importedContactCount: 12,
          currentScan: 40,
          startedAt: createdAt,
          finishedAt: createdAt,
          createdAt,
          requestedByUserId: USER_ID,
          currentError: null,
          // Fields the history view must NOT leak through.
          claimToken: "should-not-leak",
          triggerSource: "manual",
        },
      ],
      pageCount: 3,
    })

    const result = await contactScanService.listHistory({
      workspaceId: WORKSPACE_ID,
      page: 2,
      perPage: 10,
    })

    expect(mocks.listContactScanRuns).toHaveBeenCalledWith({
      workspaceId: WORKSPACE_ID,
      page: 2,
      perPage: 10,
    })
    expect(result).toEqual({
      data: [
        {
          id: "run-1",
          workspaceId: WORKSPACE_ID,
          channel: "messenger",
          status: "succeeded",
          scanFromAt: createdAt,
          importedContactCount: 12,
          currentScan: 40,
          startedAt: createdAt,
          finishedAt: createdAt,
          createdAt,
          requestedByUserId: USER_ID,
          currentError: null,
        },
      ],
      pageCount: 3,
    })
  })

  test("finish maps succeeded/partial/failed to the matching repository call", async () => {
    mocks.markSucceeded.mockResolvedValue(1)
    await contactScanService.finish({ runId: "run-1", status: "succeeded" })
    expect(mocks.markSucceeded).toHaveBeenCalledWith({
      runId: "run-1",
      expect: undefined,
    })

    mocks.markPartial.mockResolvedValue(1)
    await contactScanService.finish({
      runId: "run-1",
      status: "partial",
      currentError: "pageFailed",
    })
    expect(mocks.markPartial).toHaveBeenCalledWith({
      runId: "run-1",
      currentError: "pageFailed",
      expect: undefined,
    })

    mocks.markFailed.mockResolvedValue(1)
    await contactScanService.finish({
      runId: "run-1",
      status: "failed",
      currentError: "tokenInvalid",
    })
    expect(mocks.markFailed).toHaveBeenCalledWith({
      runId: "run-1",
      currentError: "tokenInvalid",
      expect: undefined,
    })
  })

  test("resetForRetry wraps updateProgress with status: init and no claimToken change", async () => {
    mocks.updateProgress.mockResolvedValue(1)
    await contactScanService.resetForRetry({
      runId: "run-1",
      currentError: "providerRetryable",
    })

    expect(mocks.updateProgress).toHaveBeenCalledWith(
      expect.objectContaining({
        runId: "run-1",
        fields: expect.objectContaining({
          status: "init",
          currentError: "providerRetryable",
        }),
      }),
    )
    const call = mocks.updateProgress.mock.calls.at(-1)?.[0]
    expect(call.fields).not.toHaveProperty("claimToken")
  })
})

const connectedInstagramInbox = {
  id: INBOX_ID,
  workspaceId: WORKSPACE_ID,
  channel: "instagram",
  status: "connected",
  integrationInstagram: { id: INTEGRATION_ID },
}

describe("contactScanIntegrationRefs channel registry", () => {
  test("covers every ContactScanChannel", () => {
    expect(Object.keys(contactScanIntegrationRefs)).toEqual([
      "messenger",
      "instagram",
    ])
  })

  test("messenger returns the integration ref when the relation is loaded", () => {
    expect(
      contactScanIntegrationRefs.messenger(connectedMessengerInbox as never),
    ).toEqual({ integrationId: INTEGRATION_ID })
  })

  test("messenger returns null when the relation is missing", () => {
    expect(
      contactScanIntegrationRefs.messenger({
        ...connectedMessengerInbox,
        integrationMessenger: null,
      } as never),
    ).toBeNull()
  })

  test("instagram returns the integration ref when the relation is loaded", () => {
    expect(
      contactScanIntegrationRefs.instagram(connectedInstagramInbox as never),
    ).toEqual({ integrationId: INTEGRATION_ID })
  })

  test("instagram returns null when the relation is missing", () => {
    expect(
      contactScanIntegrationRefs.instagram({
        ...connectedInstagramInbox,
        integrationInstagram: null,
      } as never),
    ).toBeNull()
  })
})
