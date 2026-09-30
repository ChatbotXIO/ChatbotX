import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  requestAction: vi.fn(),
  resolveContext: vi.fn(),
  hasChannelHandler: vi.fn(),
  runChannelHandler: vi.fn(),
}))

vi.mock("@chatbotx.io/business", () => ({
  threadControlService: { requestAction: mocks.requestAction },
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

const { requestThreadControlAction } = await import("../src/thread-control")

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
      applyOnChannel: (row: typeof contactInbox) => Promise<void>
    }) => {
      await input.applyOnChannel(contactInbox)
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
  mocks.runChannelHandler.mockResolvedValue(undefined)
  mocks.resolveContext.mockResolvedValue({
    ctx: { workspaceId: "ws-1" },
    integration: {
      hasChannelHandler: mocks.hasChannelHandler,
      runChannelHandler: mocks.runChannelHandler,
    },
  })
})

describe("requestThreadControlAction", () => {
  test.each([
    ["pass", undefined, "escalation"],
    ["pass", "customer_service", "customer_service"],
    ["release", undefined, undefined],
    ["take", undefined, "escalation"],
  ] as const)("%s with target %s records owner role %s", async (action, targetRole, ownerRole) => {
    await runWrapped({ ...baseProps, action, targetRole })

    expect(mocks.requestAction).toHaveBeenCalledWith(
      expect.objectContaining({ action, ownerRole }),
    )
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
