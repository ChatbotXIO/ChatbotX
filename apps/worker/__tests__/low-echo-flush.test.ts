import { createHash } from "node:crypto"
import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => {
  class IntegrationNotFoundError extends Error {}
  class LockAcquisitionError extends Error {}

  return {
    IntegrationNotFoundError,
    LockAcquisitionError,
    ack: vi.fn(),
    buildContext: vi.fn(),
    calculateProcessingTtl: vi.fn(() => 1),
    chatAdd: vi.fn(),
    clearFlag: vi.fn(),
    downloadAttachments: vi.fn(),
    findContactInboxes: vi.fn(),
    findConversations: vi.fn(),
    identify: vi.fn(),
    integrationAdd: vi.fn(),
    isEchoOfOwnSend: vi.fn(),
    findPersistedSourceIds: vi.fn(),
    isWorkspaceActive: vi.fn(),
    loggerError: vi.fn(),
    loggerInfo: vi.fn(),
    loggerWarn: vi.fn(),
    lowAdd: vi.fn(),
    peek: vi.fn(),
    process: vi.fn(),
    resolveBroadcastSecret: vi.fn(),
    resolveTenantSettings: vi.fn(),
    runExclusive: vi.fn(),
    runChannelHandler: vi.fn(),
    schedule: vi.fn(),
    size: vi.fn(),
    withBlockedOwnerGuard: vi.fn(),
    workspaceFindById: vi.fn(),
  }
})

vi.mock("@chatbotx.io/business", () => ({
  buildContext: mocks.buildContext,
  createPlatformData: vi.fn(({ tenantSettings, realtimeSecret }) => ({
    ...tenantSettings,
    realtimeSecret,
  })),
  chatQueue: undefined,
  contactInboxService: { findManyByIds: mocks.findContactInboxes },
  conversationService: { findManyByIds: mocks.findConversations },
  messengerEchoBatchService: {
    findPersistedSourceIds: mocks.findPersistedSourceIds,
    process: mocks.process,
  },
  resolveBroadcastSecret: mocks.resolveBroadcastSecret,
  resolveTenantSettings: mocks.resolveTenantSettings,
  withBlockedOwnerGuard: mocks.withBlockedOwnerGuard,
  workspaceService: {
    findById: mocks.workspaceFindById,
    isActiveNow: mocks.isWorkspaceActive,
  },
}))

vi.mock("@chatbotx.io/redis", () => ({
  distributedLock: { runExclusive: mocks.runExclusive },
  LockAcquisitionError: mocks.LockAcquisitionError,
}))

vi.mock("@chatbotx.io/worker-config/messenger-echo", () => ({
  echoCollector: {
    ack: mocks.ack,
    clearFlag: mocks.clearFlag,
    peek: mocks.peek,
    schedule: mocks.schedule,
    size: mocks.size,
  },
}))

vi.mock("@chatbotx.io/worker-config", () => ({
  ChatJobAction: {
    checkOutboundAutomatedResponse: "checkOutboundAutomatedResponse",
  },
  chatQueue: { add: mocks.chatAdd },
  IntegrationJobAction: { incomingMessage: "incomingMessage" },
  integrationQueue: { add: mocks.integrationAdd },
  LowJobAction: { messengerEchoFlush: "messengerEchoFlush" },
  lowQueue: { add: mocks.lowAdd },
}))

vi.mock("../src/env", () => ({
  env: {
    MESSENGER_ECHO_FLAG_TTL_MS: 60_000,
    MESSENGER_ECHO_FLUSH_BATCH: 200,
  },
}))

vi.mock("../src/integration/handlers/received-message", () => ({
  isEchoOfOwnSend: mocks.isEchoOfOwnSend,
}))

vi.mock("../src/integration/handlers/messenger-echo-processing-lease", () => ({
  calculateMessengerEchoProcessingTtlSeconds: mocks.calculateProcessingTtl,
}))

vi.mock("../src/services/integrations", () => ({
  allIntegrations: {
    messenger: { runChannelHandler: mocks.runChannelHandler },
  },
  integrationService: {
    identifyInboxAndIntegrationAuthFromIdentifier: mocks.identify,
  },
  IntegrationNotFoundError: mocks.IntegrationNotFoundError,
}))

vi.mock("../src/lib/logger", () => ({
  logger: {
    error: mocks.loggerError,
    info: mocks.loggerInfo,
    warn: mocks.loggerWarn,
  },
}))

const { messengerEchoFlush } = await import(
  "../src/integration/handlers/messenger-echo-flush"
)

const data = {
  channel: "messenger" as const,
  integrationIdentifier: "page-1",
}
const scope = { channel: "messenger", identifier: "page-1" }
const peekDigest = "peek-digest"
const rawItem = (suffix: string) => ({
  entryId: "page-1",
  entryTime: 1_700_000_000,
  messaging: {
    sender: { id: "page-1" },
    recipient: { id: `psid-${suffix}` },
    timestamp: 1_700_000_000_000,
    message: { mid: `mid-${suffix}`, text: `text-${suffix}`, is_echo: true },
  },
})
const parsedItem = (suffix: string) => ({
  sourceId: `mid-${suffix}`,
  contactSourceId: `psid-${suffix}`,
  createdAt: new Date(1_700_000_000_000),
  text: `text-${suffix}`,
  contentType: "text" as const,
  attachments: [],
})
const fallbackJobId = (
  raw: ReturnType<typeof rawItem>,
  flushJobId = "flush-1",
) => {
  const messageIdentity = raw.messaging.message?.mid ?? raw
  const fingerprint = createHash("sha256")
    .update(JSON.stringify([data.channel, raw.entryId, messageIdentity]))
    .digest("hex")
  return `messenger-echo-fallback-${flushJobId}-${fingerprint}`
}
const job = (attemptsMade = 0, attempts = 2, id = "flush-1") =>
  ({ attemptsMade, id, opts: { attempts } }) as never

beforeEach(() => {
  vi.clearAllMocks()
  mocks.identify.mockResolvedValue({
    inbox: { id: "inbox-1", workspaceId: "ws-1", channel: "messenger" },
    integrationRow: { id: "integration-1", auth: {} },
  })
  mocks.withBlockedOwnerGuard.mockImplementation(
    async (_workspaceId: string, fn: () => Promise<unknown>) => await fn(),
  )
  mocks.runExclusive.mockImplementation(
    async ({ fn }: { fn: () => Promise<unknown> }) => await fn(),
  )
  mocks.workspaceFindById.mockResolvedValue({
    id: "ws-1",
    ownerId: "owner-1",
    isActive: true,
    startTime: null,
    endTime: null,
    timezone: "UTC",
  })
  mocks.isWorkspaceActive.mockReturnValue(true)
  mocks.resolveTenantSettings.mockResolvedValue({
    appUrl: "https://app.test",
    wsUrl: "https://ws.test",
    storageUrl: "https://storage.test",
  })
  mocks.resolveBroadcastSecret.mockReturnValue("secret")
  mocks.buildContext.mockResolvedValue({ auth: {} })
  mocks.peek.mockResolvedValue({
    items: [],
    malformedCount: 0,
    digest: peekDigest,
  })
  mocks.ack.mockResolvedValue(0)
  mocks.size.mockResolvedValue(0)
  mocks.schedule.mockResolvedValue(false)
  mocks.process.mockResolvedValue({
    items: 0,
    dedupedItems: 0,
    contactsCreated: 0,
    messagesInserted: 0,
    duplicatesSkipped: 0,
    attachmentsWritten: 0,
    attachmentFailures: 0,
    perItemFailures: 0,
  })
  mocks.findPersistedSourceIds.mockResolvedValue(new Set())
  mocks.runChannelHandler.mockImplementation(
    (group: string, name: string, props: { data: { payload?: unknown } }) => {
      if (group === "message" && name === "parseEcho") {
        const messaging = props.data.payload as ReturnType<
          typeof rawItem
        >["messaging"]
        return Promise.resolve(parsedItem(messaging.message.mid.slice(4)))
      }
      if (group === "contact" && name === "getProfile") {
        return Promise.resolve({ firstName: "Ada" })
      }
      if (group === "message" && name === "downloadAttachments") {
        return Promise.resolve([])
      }
      return Promise.reject(new Error(`Unexpected handler ${group}.${name}`))
    },
  )
})

describe("messengerEchoFlush", () => {
  test("acks the exact peeked count and immediately schedules the remaining depth", async () => {
    mocks.peek.mockResolvedValue({
      items: [rawItem("1"), rawItem("2")],
      malformedCount: 1,
      digest: peekDigest,
    })
    mocks.size.mockResolvedValue(7)
    mocks.schedule.mockResolvedValue(true)
    mocks.process.mockResolvedValue({
      items: 2,
      dedupedItems: 2,
      contactsCreated: 1,
      messagesInserted: 2,
      duplicatesSkipped: 0,
      attachmentsWritten: 0,
      attachmentFailures: 0,
      perItemFailures: 0,
    })

    await messengerEchoFlush(job(), data)

    expect(mocks.peek).toHaveBeenCalledWith(scope, 200, {
      processingTtlSeconds: 1,
    })
    expect(mocks.runExclusive).toHaveBeenCalledWith(
      expect.objectContaining({ retryTimeoutInSeconds: 0 }),
    )
    expect(mocks.process).toHaveBeenCalledWith(
      expect.objectContaining({
        items: [
          expect.objectContaining({ sourceId: "mid-1", raw: rawItem("1") }),
          expect.objectContaining({ sourceId: "mid-2", raw: rawItem("2") }),
        ],
      }),
    )
    expect(mocks.ack).toHaveBeenCalledWith(scope, 3, peekDigest)
    expect(mocks.clearFlag).toHaveBeenCalledWith(scope)
    expect(mocks.schedule).toHaveBeenCalledWith(scope, 60_000)
    expect(mocks.lowAdd).toHaveBeenCalledExactlyOnceWith("messengerEchoFlush", {
      type: "messengerEchoFlush",
      data,
    })
  })

  test("does not reschedule after draining the list", async () => {
    mocks.peek.mockResolvedValue({
      items: [rawItem("1")],
      malformedCount: 0,
      digest: peekDigest,
    })

    await messengerEchoFlush(job(), data)

    expect(mocks.ack).toHaveBeenCalledWith(scope, 1, peekDigest)
    expect(mocks.schedule).not.toHaveBeenCalled()
    expect(mocks.lowAdd).not.toHaveBeenCalled()
  })

  test("retains the flag and does not reschedule when acknowledgement detects a changed list", async () => {
    mocks.peek.mockResolvedValue({
      items: [rawItem("1")],
      malformedCount: 1,
      digest: peekDigest,
    })
    mocks.ack.mockResolvedValueOnce(-1)
    mocks.size.mockResolvedValue(7)
    mocks.schedule.mockResolvedValue(true)

    await messengerEchoFlush(job(), data)

    expect(mocks.ack).toHaveBeenCalledExactlyOnceWith(scope, 2, peekDigest)
    expect(mocks.clearFlag).not.toHaveBeenCalled()
    expect(mocks.size).not.toHaveBeenCalled()
    expect(mocks.schedule).not.toHaveBeenCalled()
    expect(mocks.lowAdd).not.toHaveBeenCalled()
    expect(mocks.loggerWarn).toHaveBeenCalledWith(
      {
        integrationIdentifier: "page-1",
        malformedCount: 1,
        peekedCount: 2,
        validCount: 1,
      },
      "Messenger echo collector changed before acknowledgement; retained its scheduling flag",
    )
  })

  test("clears a stale scheduling flag when the list is already empty", async () => {
    await messengerEchoFlush(job(), data)

    expect(mocks.clearFlag).toHaveBeenCalledExactlyOnceWith(scope)
    expect(mocks.process).not.toHaveBeenCalled()
    expect(mocks.ack).not.toHaveBeenCalled()
    expect(mocks.lowAdd).not.toHaveBeenCalled()
  })

  test("acks malformed-only collector entries before clearing the flag", async () => {
    mocks.peek.mockResolvedValue({
      items: [],
      malformedCount: 2,
      digest: peekDigest,
    })

    await messengerEchoFlush(job(), data)

    expect(mocks.ack).toHaveBeenCalledExactlyOnceWith(scope, 2, peekDigest)
    expect(mocks.clearFlag).toHaveBeenCalledExactlyOnceWith(scope)
    expect(mocks.loggerWarn).toHaveBeenCalledWith(
      expect.objectContaining({ malformedCount: 2 }),
      "Dropped malformed Messenger echo collector entries",
    )
    expect(mocks.process).not.toHaveBeenCalled()
    expect(mocks.lowAdd).not.toHaveBeenCalled()
  })

  test("drops an object-shaped malformed entry while processing and acking a valid entry", async () => {
    const valid = rawItem("1")
    mocks.peek.mockResolvedValue({
      items: [{}, valid],
      malformedCount: 0,
      digest: peekDigest,
    })
    mocks.process.mockResolvedValue({
      items: 1,
      dedupedItems: 1,
      contactsCreated: 0,
      messagesInserted: 1,
      duplicatesSkipped: 0,
      attachmentsWritten: 0,
      attachmentFailures: 0,
      perItemFailures: 0,
    })

    await expect(messengerEchoFlush(job(), data)).resolves.toBeUndefined()

    expect(mocks.process).toHaveBeenCalledWith(
      expect.objectContaining({
        items: [expect.objectContaining({ sourceId: "mid-1", raw: valid })],
      }),
    )
    expect(mocks.ack).toHaveBeenCalledExactlyOnceWith(scope, 2, peekDigest)
    expect(mocks.integrationAdd).not.toHaveBeenCalled()
    expect(mocks.loggerError).toHaveBeenCalledWith(
      expect.objectContaining({
        err: expect.anything(),
        integrationIdentifier: "page-1",
      }),
      "Dropped structurally malformed Messenger echo collector entry",
    )
  })

  test("drops the peeked batch when the workspace owner is blocked", async () => {
    mocks.peek.mockResolvedValue({
      items: [rawItem("1"), rawItem("2")],
      malformedCount: 1,
      digest: peekDigest,
    })
    mocks.withBlockedOwnerGuard.mockResolvedValueOnce(undefined)

    await messengerEchoFlush(job(), data)

    expect(mocks.runExclusive).toHaveBeenCalledOnce()
    expect(mocks.runExclusive.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.peek.mock.invocationCallOrder[0] as number,
    )
    expect(mocks.ack).toHaveBeenCalledExactlyOnceWith(scope, 3, peekDigest)
    expect(mocks.clearFlag).toHaveBeenCalledExactlyOnceWith(scope)
    expect(mocks.loggerInfo).toHaveBeenCalledWith(
      expect.objectContaining({
        droppedCount: 3,
        integrationIdentifier: "page-1",
        workspaceId: "ws-1",
      }),
      "Skipping workspace job for frozen workspace",
    )
    expect(mocks.lowAdd).not.toHaveBeenCalled()
  })

  test.each([
    "missing inbox",
    "blocked workspace",
  ])("returns without peeking or acking for the %s path when the page lock is held", async () => {
    mocks.runExclusive.mockRejectedValueOnce(
      new mocks.LockAcquisitionError("held"),
    )

    await messengerEchoFlush(job(), data)

    expect(mocks.identify).not.toHaveBeenCalled()
    expect(mocks.withBlockedOwnerGuard).not.toHaveBeenCalled()
    expect(mocks.peek).not.toHaveBeenCalled()
    expect(mocks.ack).not.toHaveBeenCalled()
  })

  test("routes an out-of-window echo to the legacy single-event path", async () => {
    const raw = {
      ...rawItem("stale"),
      messaging: {
        ...rawItem("stale").messaging,
        timestamp: 1,
      },
    }
    mocks.peek.mockResolvedValue({
      items: [raw],
      malformedCount: 0,
      digest: peekDigest,
    })
    mocks.runChannelHandler.mockResolvedValueOnce(null)

    await messengerEchoFlush(job(), data)

    expect(mocks.integrationAdd).toHaveBeenCalledExactlyOnceWith(
      "incomingMessage",
      {
        type: "incomingMessage",
        data: {
          integrationType: "messenger",
          integrationIdentifier: "page-1",
          payload: {
            object: "page",
            entry: [
              {
                id: "page-1",
                time: 1_700_000_000,
                messaging: [raw.messaging],
              },
            ],
          },
        },
      },
      { jobId: fallbackJobId(raw) },
    )
    expect(mocks.process).not.toHaveBeenCalled()
    expect(mocks.ack).toHaveBeenCalledWith(scope, 1, peekDigest)
  })

  test("queues one fallback job when the same flush retries after a batch failure", async () => {
    const unparseable = rawItem("bad")
    const parsed = rawItem("1")
    const queuedJobs = new Map<string, object>()
    mocks.integrationAdd.mockImplementation(
      (_name: string, _payload: unknown, options: { jobId: string }) => {
        const existing = queuedJobs.get(options.jobId)
        if (existing) {
          return Promise.resolve(existing)
        }
        const created = { id: options.jobId }
        queuedJobs.set(options.jobId, created)
        return Promise.resolve(created)
      },
    )
    mocks.peek.mockResolvedValue({
      items: [unparseable, parsed],
      malformedCount: 0,
      digest: peekDigest,
    })
    mocks.runChannelHandler.mockImplementation(
      (
        _group: string,
        name: string,
        props: { data: { payload?: unknown } },
      ) => {
        if (name !== "parseEcho") {
          return Promise.resolve([])
        }
        const messaging = props.data.payload as ReturnType<
          typeof rawItem
        >["messaging"]
        return Promise.resolve(
          messaging.message.mid === "mid-bad" ? null : parsedItem("1"),
        )
      },
    )
    const error = new Error("database unavailable")
    mocks.process.mockRejectedValueOnce(error).mockResolvedValueOnce({
      items: 2,
      dedupedItems: 1,
      contactsCreated: 0,
      messagesInserted: 1,
      duplicatesSkipped: 0,
      attachmentsWritten: 0,
      attachmentFailures: 0,
      perItemFailures: 1,
    })

    await expect(messengerEchoFlush(job(0, 2), data)).rejects.toBe(error)
    await messengerEchoFlush(job(1, 2), data)

    const expectedJobId = fallbackJobId(unparseable)
    expect(queuedJobs).toEqual(
      new Map([[expectedJobId, { id: expectedJobId }]]),
    )
    expect(mocks.integrationAdd).toHaveBeenCalledTimes(2)
    expect(mocks.integrationAdd.mock.calls.map((call) => call[2])).toEqual([
      { jobId: expectedJobId },
      { jobId: expectedJobId },
    ])
    expect(expectedJobId).not.toContain(":")
  })

  test("uses different fallback job ids for different flushes of the same echo", async () => {
    const unparseable = rawItem("bad")
    mocks.peek.mockResolvedValue({
      items: [unparseable],
      malformedCount: 0,
      digest: peekDigest,
    })
    mocks.runChannelHandler.mockResolvedValue(null)

    await messengerEchoFlush(job(0, 2, "flush-1"), data)
    await messengerEchoFlush(job(0, 2, "flush-2"), data)

    expect(mocks.integrationAdd).toHaveBeenCalledTimes(2)
    expect(mocks.integrationAdd.mock.calls.map((call) => call[2])).toEqual([
      { jobId: fallbackJobId(unparseable, "flush-1") },
      { jobId: fallbackJobId(unparseable, "flush-2") },
    ])
  })

  test("rethrows a batch failure before the final attempt without acking", async () => {
    const error = new Error("database unavailable")
    mocks.peek.mockResolvedValue({
      items: [rawItem("1")],
      malformedCount: 0,
      digest: peekDigest,
    })
    mocks.process.mockRejectedValueOnce(error)

    await expect(messengerEchoFlush(job(0, 2), data)).rejects.toBe(error)

    expect(mocks.integrationAdd).not.toHaveBeenCalled()
    expect(mocks.ack).not.toHaveBeenCalled()
    expect(mocks.clearFlag).not.toHaveBeenCalled()
  })

  test("falls every peeked item back and removes a poison batch on the final attempt", async () => {
    const first = rawItem("1")
    const second = rawItem("2")
    const error = new Error("database unavailable")
    mocks.peek.mockResolvedValue({
      items: [first, second],
      malformedCount: 1,
      digest: peekDigest,
    })
    mocks.process.mockRejectedValueOnce(error)

    await expect(messengerEchoFlush(job(1, 2), data)).resolves.toBeUndefined()

    expect(mocks.integrationAdd).toHaveBeenCalledTimes(2)
    expect(mocks.findPersistedSourceIds).toHaveBeenCalledWith({
      inbox: expect.objectContaining({ id: "inbox-1", workspaceId: "ws-1" }),
      items: [
        expect.objectContaining({ sourceId: "mid-1" }),
        expect.objectContaining({ sourceId: "mid-2" }),
      ],
    })
    expect(mocks.ack).toHaveBeenCalledWith(scope, 3, peekDigest)
    expect(mocks.clearFlag).toHaveBeenCalledWith(scope)
    expect(mocks.loggerError).toHaveBeenCalledWith(
      expect.objectContaining({ err: error, integrationIdentifier: "page-1" }),
      expect.stringContaining("final attempt"),
    )
  })

  test("falls back only unpersisted items on the final attempt and acks the full batch", async () => {
    const first = rawItem("1")
    const second = rawItem("2")
    mocks.peek.mockResolvedValue({
      items: [first, second],
      malformedCount: 1,
      digest: peekDigest,
    })
    mocks.process.mockRejectedValueOnce(new Error("tracking unavailable"))
    mocks.findPersistedSourceIds.mockResolvedValueOnce(new Set(["mid-1"]))

    await messengerEchoFlush(job(1, 2), data)

    expect(mocks.integrationAdd).toHaveBeenCalledExactlyOnceWith(
      "incomingMessage",
      expect.objectContaining({
        data: expect.objectContaining({
          payload: expect.objectContaining({
            entry: [
              expect.objectContaining({
                messaging: [
                  expect.objectContaining({
                    message: expect.objectContaining({ mid: "mid-2" }),
                  }),
                ],
              }),
            ],
          }),
        }),
      }),
      { jobId: fallbackJobId(second) },
    )
    expect(mocks.ack).toHaveBeenCalledWith(scope, 3, peekDigest)
    expect(mocks.clearFlag).toHaveBeenCalledWith(scope)
    expect(mocks.loggerWarn).toHaveBeenCalledWith(
      expect.objectContaining({
        persistedAndDropped: 1,
        persistedSourceIds: ["mid-1"],
      }),
      expect.stringContaining("already persisted"),
    )
  })

  test("falls every item back when the final-attempt persistence lookup fails", async () => {
    const first = rawItem("1")
    const second = rawItem("2")
    const lookupError = new Error("lookup unavailable")
    mocks.peek.mockResolvedValue({
      items: [first, second],
      malformedCount: 0,
      digest: peekDigest,
    })
    mocks.process.mockRejectedValueOnce(new Error("tracking unavailable"))
    mocks.findPersistedSourceIds.mockRejectedValueOnce(lookupError)

    await messengerEchoFlush(job(1, 2), data)

    expect(mocks.integrationAdd).toHaveBeenCalledTimes(2)
    expect(mocks.ack).toHaveBeenCalledWith(scope, 2, peekDigest)
    expect(mocks.loggerWarn).toHaveBeenCalledWith(
      expect.objectContaining({ err: lookupError }),
      expect.stringContaining("persistence lookup failed"),
    )
  })

  test("does not enqueue a parse failure twice when the batch fails on its final attempt", async () => {
    const unparseable = rawItem("bad")
    const firstParsed = rawItem("1")
    const secondParsed = rawItem("2")
    mocks.peek.mockResolvedValue({
      items: [unparseable, firstParsed, secondParsed],
      malformedCount: 0,
      digest: peekDigest,
    })
    mocks.runChannelHandler
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(parsedItem("1"))
      .mockResolvedValueOnce(parsedItem("2"))
    mocks.process.mockRejectedValueOnce(new Error("database unavailable"))

    await messengerEchoFlush(job(1, 2), data)

    expect(mocks.integrationAdd).toHaveBeenCalledTimes(3)
    const fallbackMids = mocks.integrationAdd.mock.calls.map(
      ([, request]) => request.data.payload.entry[0].messaging[0].message.mid,
    )
    expect(fallbackMids).toEqual(["mid-bad", "mid-1", "mid-2"])
  })

  test("falls back and acks a missing inbox without self-rescheduling", async () => {
    const raw = rawItem("1")
    mocks.identify.mockRejectedValueOnce(
      new mocks.IntegrationNotFoundError("missing"),
    )
    mocks.peek.mockResolvedValue({
      items: [raw],
      malformedCount: 1,
      digest: peekDigest,
    })

    await messengerEchoFlush(job(), data)

    expect(mocks.runExclusive).toHaveBeenCalledOnce()
    expect(mocks.runExclusive.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.peek.mock.invocationCallOrder[0] as number,
    )
    expect(mocks.integrationAdd).toHaveBeenCalledOnce()
    expect(mocks.ack).toHaveBeenCalledExactlyOnceWith(scope, 2, peekDigest)
    expect(mocks.clearFlag).toHaveBeenCalledExactlyOnceWith(scope)
    expect(mocks.lowAdd).not.toHaveBeenCalled()
  })

  test("bulk-loads loop-guard rows once and enqueues only non-self echoes", async () => {
    mocks.peek.mockResolvedValue({
      items: [rawItem("1")],
      malformedCount: 0,
      digest: peekDigest,
    })
    mocks.findContactInboxes.mockResolvedValue([
      { id: "ci-1", channel: "messenger" },
      { id: "ci-2", channel: "messenger" },
    ])
    mocks.findConversations.mockResolvedValue([
      { id: "conv-1", workspaceId: "ws-1" },
      { id: "conv-2", workspaceId: "ws-1" },
    ])
    mocks.isEchoOfOwnSend
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false)
    mocks.process.mockImplementationOnce(async ({ ports }) => {
      await ports.onTextMessagesPersisted([
        {
          row: { id: "message-1", text: "one" },
          item: parsedItem("1"),
          contactInboxId: "ci-1",
          conversationId: "conv-1",
        },
        {
          row: { id: "message-2", text: "two" },
          item: parsedItem("2"),
          contactInboxId: "ci-2",
          conversationId: "conv-2",
        },
      ])
      return {
        items: 2,
        dedupedItems: 2,
        contactsCreated: 0,
        messagesInserted: 2,
        duplicatesSkipped: 0,
        attachmentsWritten: 0,
        attachmentFailures: 0,
        perItemFailures: 0,
      }
    })

    await messengerEchoFlush(job(), data)

    expect(mocks.findContactInboxes).toHaveBeenCalledExactlyOnceWith({
      workspaceId: "ws-1",
      ids: ["ci-1", "ci-2"],
      full: true,
    })
    expect(mocks.findConversations).toHaveBeenCalledExactlyOnceWith({
      workspaceId: "ws-1",
      ids: ["conv-1", "conv-2"],
    })
    expect(mocks.isEchoOfOwnSend).toHaveBeenCalledTimes(2)
    expect(mocks.chatAdd).toHaveBeenCalledExactlyOnceWith(
      "checkOutboundAutomatedResponse",
      {
        type: "checkOutboundAutomatedResponse",
        data: {
          conversation: { id: "conv-2", workspaceId: "ws-1" },
          contactInbox: { id: "ci-2", channel: "messenger" },
          message: { id: "message-2", text: "text-2" },
        },
      },
    )
  })

  test("skips the loop-guard hook entirely while the workspace is inactive", async () => {
    mocks.peek.mockResolvedValue({
      items: [rawItem("1")],
      malformedCount: 0,
      digest: peekDigest,
    })
    mocks.isWorkspaceActive.mockReturnValue(false)
    mocks.process.mockImplementationOnce(async ({ ports }) => {
      await ports.onTextMessagesPersisted([
        {
          row: { id: "message-1", text: "one" },
          item: parsedItem("1"),
          contactInboxId: "ci-1",
          conversationId: "conv-1",
        },
      ])
      return {
        items: 1,
        dedupedItems: 1,
        contactsCreated: 0,
        messagesInserted: 1,
        duplicatesSkipped: 0,
        attachmentsWritten: 0,
        attachmentFailures: 0,
        perItemFailures: 0,
      }
    })

    await messengerEchoFlush(job(), data)

    expect(mocks.findContactInboxes).not.toHaveBeenCalled()
    expect(mocks.findConversations).not.toHaveBeenCalled()
    expect(mocks.isEchoOfOwnSend).not.toHaveBeenCalled()
    expect(mocks.chatAdd).not.toHaveBeenCalled()
  })
})
