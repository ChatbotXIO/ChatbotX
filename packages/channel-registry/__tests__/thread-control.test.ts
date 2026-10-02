import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  requestAction: vi.fn(),
  syncThreadOwner: vi.fn(),
  resolveContext: vi.fn(),
  hasChannelHandler: vi.fn(),
  runChannelHandler: vi.fn(),
  channelResult: vi.fn(),
}))

vi.mock("@chatbotx.io/business", () => ({
  threadControlService: {
    requestAction: mocks.requestAction,
    syncThreadOwner: mocks.syncThreadOwner,
  },
  ThreadControlUnsupportedError: class ThreadControlUnsupportedError extends Error {
    channel: string
    constructor(channel: string) {
      super(`unsupported: ${channel}`)
      this.channel = channel
    }
  },
}))

vi.mock("../src/registry", () => ({
  resolveIntegrationContextFromContactInbox: mocks.resolveContext,
}))

const { requestThreadControlAction, getChannelThreadOwner, syncThreadOwner } =
  await import("../src/thread-control")

const contactInbox = { id: "ci-1", channel: "whatsapp", inboxId: "inbox-1" }
const snapshot = {
  contactInboxId: "ci-1",
  threadControlState: "idle",
  threadOwnerRole: null,
  threadControlUpdatedAt: null,
}

/** Runs the channel callback the wrapper hands to the business service. */
const runWrapped = async (
  props: Parameters<typeof requestThreadControlAction>[0],
) => {
  mocks.requestAction.mockImplementation(
    async (input: {
      applyOnChannel: (row: typeof contactInbox) => Promise<unknown>
    }) => {
      const channelResult = await input.applyOnChannel(contactInbox)
      mocks.channelResult(channelResult)
      return snapshot
    },
  )
  return await requestThreadControlAction(props)
}

const baseProps = {
  workspaceId: "ws-1",
  contactInboxId: "ci-1",
  conversationId: "conv-1",
  action: "release" as const,
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.hasChannelHandler.mockReturnValue(true)
  mocks.runChannelHandler.mockResolvedValue({ ownerRole: null })
  mocks.resolveContext.mockResolvedValue({
    ctx: { workspaceId: "ws-1" },
    integration: {
      hasChannelHandler: mocks.hasChannelHandler,
      runChannelHandler: mocks.runChannelHandler,
    },
  })
})

describe("requestThreadControlAction", () => {
  test("hands the channel's returned owner role to the business service (no channel rule here)", async () => {
    mocks.runChannelHandler.mockResolvedValue({ ownerRole: "marketing" })

    await runWrapped({ ...baseProps, action: "take" })

    expect(mocks.channelResult).toHaveBeenCalledWith({
      ownerRole: "marketing",
    })
    expect(mocks.requestAction).toHaveBeenCalledWith(
      expect.not.objectContaining({ ownerRole: expect.anything() }),
    )
  })

  test("passes a null owner (no role expressible) through unchanged", async () => {
    mocks.runChannelHandler.mockResolvedValue({ ownerRole: null })

    await runWrapped({ ...baseProps, action: "release" })

    expect(mocks.channelResult).toHaveBeenCalledWith({ ownerRole: null })
  })

  test("resolves the integration and calls updateThreadControl with the contact inbox and action", async () => {
    const result = await runWrapped({ ...baseProps, action: "pass" })

    expect(mocks.resolveContext).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      contactInbox,
    })
    expect(mocks.hasChannelHandler).toHaveBeenCalledWith(
      "conversation",
      "updateThreadControl",
    )
    expect(mocks.runChannelHandler).toHaveBeenCalledWith(
      "conversation",
      "updateThreadControl",
      {
        ctx: { workspaceId: "ws-1" },
        data: { contact: contactInbox, action: "pass", targetRole: undefined },
      },
    )
    expect(result).toBe(snapshot)
  })

  test("forwards an explicit pass target role", async () => {
    await runWrapped({ ...baseProps, action: "pass", targetRole: "marketing" })

    expect(mocks.runChannelHandler).toHaveBeenCalledWith(
      "conversation",
      "updateThreadControl",
      expect.objectContaining({
        data: expect.objectContaining({ targetRole: "marketing" }),
      }),
    )
  })

  test("delegates the state recording to the business service with the caller's identifiers", async () => {
    await runWrapped({ ...baseProps })

    expect(mocks.requestAction).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "ws-1",
        contactInboxId: "ci-1",
        conversationId: "conv-1",
        action: "release",
        applyOnChannel: expect.any(Function),
      }),
    )
  })

  test("a channel without the handler throws ThreadControlUnsupportedError before any call", async () => {
    mocks.hasChannelHandler.mockReturnValue(false)

    await expect(runWrapped(baseProps)).rejects.toMatchObject({
      channel: "whatsapp",
      message: expect.stringContaining("unsupported"),
    })
    expect(mocks.runChannelHandler).not.toHaveBeenCalled()
  })

  test("a channel failure propagates unchanged", async () => {
    const failure = new Error("2494191")
    mocks.runChannelHandler.mockRejectedValue(failure)

    await expect(runWrapped(baseProps)).rejects.toBe(failure)
  })
})

describe("getChannelThreadOwner / syncThreadOwner", () => {
  test("returns null (cannot sync) when the channel has no getThreadOwner handler", async () => {
    mocks.hasChannelHandler.mockReturnValue(false)

    const result = await getChannelThreadOwner({
      workspaceId: "ws-1",
      contactInbox: contactInbox as never,
    })

    expect(result).toBeNull()
    expect(mocks.runChannelHandler).not.toHaveBeenCalled()
  })

  test("returns the handler result when the channel implements it", async () => {
    const owner = { ownerAppId: "a-1", expiresAt: null }
    mocks.runChannelHandler.mockResolvedValue(owner)

    const result = await getChannelThreadOwner({
      workspaceId: "ws-1",
      contactInbox: contactInbox as never,
    })

    expect(result).toBe(owner)
    expect(mocks.hasChannelHandler).toHaveBeenCalledWith(
      "conversation",
      "getThreadOwner",
    )
  })

  test("syncThreadOwner hands the business service the channel fetch seam", async () => {
    const owner = { ownerAppId: "a-1", expiresAt: null }
    mocks.runChannelHandler.mockResolvedValue(owner)
    mocks.syncThreadOwner.mockImplementation(
      async (input: {
        fetchOwner: (row: typeof contactInbox) => Promise<unknown>
      }) => {
        mocks.channelResult(await input.fetchOwner(contactInbox))
        return snapshot
      },
    )

    await syncThreadOwner({
      workspaceId: "ws-1",
      contactInbox: contactInbox as never,
      conversationId: "conv-1",
    })

    expect(mocks.channelResult).toHaveBeenCalledWith(owner)
  })
})

describe("createBulkThreadControl", () => {
  const inbox = { channel: "messenger", inboxId: "inbox-1" }
  const response = {
    results: [{ contactInboxId: "ci-1", status: "succeeded" }],
    retryAfterMs: 60_000,
  }

  const limits = {
    maxBatchSize: 50,
    batchGapMs: 1000,
    rateLimitPauseMs: 3_600_000,
  }
  /** The limits handler answers `limits`; the bulk handler answers `answer`. */
  const channelAnswers = (answer: unknown) =>
    mocks.runChannelHandler.mockImplementation(
      (_scope: string, handler: string) => {
        if (handler === "bulkThreadControlLimits") {
          return Promise.resolve(limits)
        }
        return typeof answer === "function"
          ? (answer as () => Promise<unknown>)()
          : Promise.resolve(answer)
      },
    )

  test("resolves the integration once, reads the channel's limits, and reuses it for every batch", async () => {
    const ctx = { auth: "page-token" }
    channelAnswers(response)
    mocks.resolveContext.mockResolvedValue({
      integration: {
        hasChannelHandler: mocks.hasChannelHandler.mockReturnValue(true),
        runChannelHandler: mocks.runChannelHandler,
      },
      ctx,
    })
    const { createBulkThreadControl } = await import("../src/thread-control")

    const bulk = await createBulkThreadControl({
      workspaceId: "ws-1",
      inbox,
    })
    await bulk.run({ action: "handToAi", contacts: [] })
    const out = await bulk.run({
      action: "takeFromAi",
      contacts: [],
      text: "A person is here",
    })

    // The channel's pause request reaches the caller with the results.
    expect(out).toBe(response)
    expect(bulk.limits).toEqual(limits)
    expect(mocks.runChannelHandler).toHaveBeenCalledWith(
      "conversation",
      "bulkThreadControlLimits",
      { ctx },
    )
    expect(mocks.resolveContext).toHaveBeenCalledTimes(1)
    expect(mocks.resolveContext).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      contactInbox: inbox,
    })
    expect(mocks.runChannelHandler).toHaveBeenLastCalledWith(
      "conversation",
      "bulkUpdateThreadControl",
      {
        ctx,
        data: { action: "takeFromAi", contacts: [], text: "A person is here" },
      },
    )
  })

  test.each([
    ["the bulk handler", "bulkUpdateThreadControl"],
    ["the limits handler", "bulkThreadControlLimits"],
  ])("a channel without %s is unsupported, before any batch runs", async (_name, missing) => {
    mocks.resolveContext.mockResolvedValue({
      integration: {
        hasChannelHandler: mocks.hasChannelHandler.mockImplementation(
          (_scope: string, handler: string) => handler !== missing,
        ),
        runChannelHandler: mocks.runChannelHandler,
      },
      ctx: {},
    })
    const { createBulkThreadControl } = await import("../src/thread-control")

    await expect(
      createBulkThreadControl({ workspaceId: "ws-1", inbox }),
    ).rejects.toMatchObject({ channel: "messenger" })
    expect(mocks.runChannelHandler).not.toHaveBeenCalled()
  })

  test("a whole-call failure from the channel reaches the caller", async () => {
    const failure = new Error("token revoked")
    channelAnswers(() => Promise.reject(failure))
    mocks.resolveContext.mockResolvedValue({
      integration: {
        hasChannelHandler: mocks.hasChannelHandler.mockReturnValue(true),
        runChannelHandler: mocks.runChannelHandler,
      },
      ctx: {},
    })
    const { createBulkThreadControl } = await import("../src/thread-control")
    const bulk = await createBulkThreadControl({
      workspaceId: "ws-1",
      inbox,
    })

    await expect(bulk.run({ action: "handToAi", contacts: [] })).rejects.toBe(
      failure,
    )
  })
})
