import { beforeEach, describe, expect, test, vi } from "vitest"

const REJECTION_SUBCODE = 7_654_321

const mocks = vi.hoisted(() => ({
  recordEvent: vi.fn(),
  syncThreadOwner: vi.fn(),
  loggerWarn: vi.fn(),
}))

vi.mock("@chatbotx.io/business", () => ({
  threadControlService: { recordEvent: mocks.recordEvent },
}))

vi.mock("@chatbotx.io/channel-registry/thread-control", () => ({
  syncThreadOwner: mocks.syncThreadOwner,
}))

vi.mock("@chatbotx.io/integration-messenger", () => ({
  // No real subcode is published yet; the fast path is exercised with a stub.
  isThreadControlRejection: (error: { subCode: unknown }) =>
    Number(error.subCode) === REJECTION_SUBCODE,
}))

vi.mock("../src/lib/logger", () => ({
  logger: { warn: mocks.loggerWarn, error: vi.fn(), info: vi.fn() },
}))

const { reconcileChannelSendError } = await import(
  "../src/chat/handlers/channel-send-error-reconcilers"
)
const { ChannelError, ChannelErrorCategory } = await import("@chatbotx.io/sdk")

const contactInbox = { id: "ci-1", inboxId: "inbox-1", channel: "messenger" }
const conversation = { id: "conv-1", workspaceId: "ws-1" }

const context = (error: unknown, channel = "messenger") =>
  ({
    error,
    contactInbox: { ...contactInbox, channel },
    conversation,
  }) as never

// Production shape: Messenger gives code 10 and no dedicated subcode.
const permissionError = (subCode?: number) =>
  new ChannelError("refused", ChannelErrorCategory.PERMISSION_DENIED, {
    code: 10,
    subCode,
  })

const snapshot = (
  threadControlState: "owned" | "standby" | null,
  threadOwnerAppId: string | null = null,
) => ({
  contactInboxId: "ci-1",
  threadControlState,
  threadOwnerRole: null,
  threadOwnerAppId,
  threadControlUpdatedAt: null,
  threadOwnerExpiresAt: null,
  threadControlLastEvent: null,
})

describe("Messenger thread-control rejection reconciler", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.recordEvent.mockResolvedValue({})
  })

  test("a foreign owner: ONE sync, then serviceRejected keeping the owner app id", async () => {
    mocks.syncThreadOwner.mockResolvedValue(snapshot("standby", "app-partner"))

    const reconciled = await reconcileChannelSendError(
      context(permissionError()),
    )

    expect(reconciled).toBe(false)
    expect(mocks.syncThreadOwner).toHaveBeenCalledTimes(1)
    expect(mocks.syncThreadOwner).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "ws-1",
        conversationId: "conv-1",
      }),
    )
    expect(mocks.recordEvent).toHaveBeenCalledTimes(1)
    expect(mocks.recordEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "ws-1",
        conversationId: "conv-1",
        event: "serviceRejected",
        ownerAppId: "app-partner",
      }),
    )
  })

  test("PERMISSION_DENIED while we still own the thread records nothing", async () => {
    mocks.syncThreadOwner.mockResolvedValue(snapshot("owned"))

    await expect(
      reconcileChannelSendError(context(permissionError())),
    ).resolves.toBe(false)

    expect(mocks.syncThreadOwner).toHaveBeenCalledTimes(1)
    expect(mocks.recordEvent).not.toHaveBeenCalled()
  })

  test("a thread that resolves to no routing state records nothing", async () => {
    mocks.syncThreadOwner.mockResolvedValue(snapshot(null))

    await reconcileChannelSendError(context(permissionError()))

    expect(mocks.recordEvent).not.toHaveBeenCalled()
  })

  test("a failing owner sync records nothing and is logged with err", async () => {
    const boom = new Error("graph down")
    mocks.syncThreadOwner.mockRejectedValue(boom)

    await expect(
      reconcileChannelSendError(context(permissionError())),
    ).resolves.toBe(false)

    expect(mocks.recordEvent).not.toHaveBeenCalled()
    expect(mocks.loggerWarn).toHaveBeenCalledWith(
      expect.objectContaining({ err: boom }),
      expect.any(String),
    )
  })

  test("a known rejection subcode records serviceRejected without any owner query", async () => {
    await reconcileChannelSendError(context(permissionError(REJECTION_SUBCODE)))

    expect(mocks.syncThreadOwner).not.toHaveBeenCalled()
    expect(mocks.recordEvent).toHaveBeenCalledTimes(1)
    expect(mocks.recordEvent).toHaveBeenCalledWith(
      expect.objectContaining({ event: "serviceRejected" }),
    )
  })

  test("a non-permission error never queries the owner", async () => {
    await reconcileChannelSendError(context(new Error("boom")))
    await reconcileChannelSendError(
      context(
        new ChannelError("slow", ChannelErrorCategory.RATE_LIMITED, {
          code: 4,
        }),
      ),
    )

    expect(mocks.syncThreadOwner).not.toHaveBeenCalled()
    expect(mocks.recordEvent).not.toHaveBeenCalled()
  })

  test("a bookkeeping failure is only logged, never thrown", async () => {
    mocks.syncThreadOwner.mockResolvedValue(snapshot("standby", "app-partner"))
    mocks.recordEvent.mockRejectedValue(new Error("db down"))

    await expect(
      reconcileChannelSendError(context(permissionError())),
    ).resolves.toBe(false)
    expect(mocks.loggerWarn).toHaveBeenCalledTimes(1)
  })
})
