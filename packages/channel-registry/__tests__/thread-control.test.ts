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
    await runWrapped({ ...baseProps, actorUserId: "user-1" })

    expect(mocks.requestAction).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "ws-1",
        contactInboxId: "ci-1",
        conversationId: "conv-1",
        action: "release",
        actorUserId: "user-1",
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
