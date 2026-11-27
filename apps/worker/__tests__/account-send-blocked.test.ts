import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  stopSendingForBlockedAccount: vi.fn(),
  setIfAbsent: vi.fn(),
  del: vi.fn(),
  syncThreadOwner: vi.fn(),
  loggerError: vi.fn(),
  loggerWarn: vi.fn(),
}))

vi.mock("@chatbotx.io/business", () => ({
  broadcastService: {
    stopSendingForBlockedAccount: mocks.stopSendingForBlockedAccount,
  },
  threadControlService: { recordEvent: vi.fn() },
}))
vi.mock("@chatbotx.io/redis", () => ({
  casStore: { setIfAbsent: mocks.setIfAbsent, del: mocks.del },
}))
vi.mock("@chatbotx.io/channel-registry/thread-control", () => ({
  syncThreadOwner: mocks.syncThreadOwner,
}))
vi.mock("@chatbotx.io/integration-messenger", () => ({
  isThreadControlRejection: () => false,
}))
vi.mock("../src/lib/logger", () => ({
  logger: {
    warn: mocks.loggerWarn,
    error: mocks.loggerError,
    info: vi.fn(),
  },
}))

const { reconcileChannelSendError } = await import(
  "../src/chat/handlers/channel-send-error-reconcilers"
)
const { ChannelError, ChannelErrorCategory, ChannelErrorReason } = await import(
  "@chatbotx.io/sdk"
)

const conversation = { id: "conv-1", workspaceId: "ws-1" }
const blockedError = () =>
  new ChannelError("page blocked", ChannelErrorCategory.UNKNOWN, {
    code: 2022,
    reason: ChannelErrorReason.ACCOUNT_POLICY_BLOCKED,
  })
const broadcastMetadata = {
  type: "broadcast" as const,
  broadcastId: "b-1",
  contactInboxId: "ci-1",
}

let inboxCounter = 0
// A fresh inbox per test keeps the in-process burst window from leaking across tests.
const run = (
  error: unknown,
  overrides: { metadata?: unknown; channel?: string; inboxId?: string } = {},
) => {
  const inboxId = overrides.inboxId ?? `inbox-${++inboxCounter}`
  return reconcileChannelSendError({
    error,
    conversation,
    contactInbox: {
      id: "ci-1",
      inboxId,
      channel: overrides.channel ?? "instagram",
    },
    contentAttributes: undefined,
    metadata: "metadata" in overrides ? overrides.metadata : broadcastMetadata,
  } as never)
}

describe("account-send-blocked reconciler", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.setIfAbsent.mockResolvedValue(true)
    mocks.del.mockResolvedValue(undefined)
    mocks.stopSendingForBlockedAccount.mockResolvedValue({ stoppedIds: [] })
  })

  test.each([
    "messenger",
    "instagram",
    "whatsapp",
    "zalo",
  ])("a %s broadcast send stops the page's broadcasts and still returns false", async (channel) => {
    const reconciled = await run(blockedError(), {
      channel,
      inboxId: `i-${channel}`,
    })

    expect(reconciled).toBe(false)
    expect(mocks.stopSendingForBlockedAccount).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      inboxId: `i-${channel}`,
      channel,
      reason: ChannelErrorReason.ACCOUNT_POLICY_BLOCKED,
      errorMessage: "page blocked",
    })
  })

  test("inbox, flow and sequence sends do not stop broadcasts", async () => {
    for (const metadata of [
      undefined,
      { type: "flowNode" },
      { type: "sequenceSchedule" },
    ]) {
      await run(blockedError(), { metadata })
    }
    expect(mocks.stopSendingForBlockedAccount).not.toHaveBeenCalled()
  })

  test("a recipient-level or plain error does not stop broadcasts", async () => {
    await run(new ChannelError("x", ChannelErrorCategory.USER_BLOCKED))
    await run(new Error("boom"))
    expect(mocks.stopSendingForBlockedAccount).not.toHaveBeenCalled()
  })

  test("a burst of 200 errors for one inbox calls the service once", async () => {
    await Promise.all(
      Array.from({ length: 200 }, () =>
        run(blockedError(), { inboxId: "burst-inbox" }),
      ),
    )
    expect(mocks.stopSendingForBlockedAccount).toHaveBeenCalledTimes(1)
  })

  test("another process already handled the burst: no stop here", async () => {
    mocks.setIfAbsent.mockResolvedValue(false)
    await run(blockedError())
    expect(mocks.stopSendingForBlockedAccount).not.toHaveBeenCalled()
  })

  test("a Redis failure still stops (the stop is idempotent)", async () => {
    mocks.setIfAbsent.mockRejectedValue(new Error("redis down"))
    await run(blockedError())
    expect(mocks.stopSendingForBlockedAccount).toHaveBeenCalledTimes(1)
  })

  test("a service failure is logged, never thrown, and the next error retries", async () => {
    mocks.stopSendingForBlockedAccount.mockRejectedValueOnce(new Error("db"))
    const first = await run(blockedError(), { inboxId: "retry-inbox" })
    const second = await run(blockedError(), { inboxId: "retry-inbox" })

    expect(first).toBe(false)
    expect(second).toBe(false)
    expect(mocks.loggerError).toHaveBeenCalledTimes(1)
    expect(mocks.stopSendingForBlockedAccount).toHaveBeenCalledTimes(2)
    // The shared guard is released too, or other processes would skip the retry.
    expect(mocks.del).toHaveBeenCalledWith(
      "broadcast:account-block-stop:retry-inbox",
    )
  })

  test("failing to release the guard is only logged", async () => {
    mocks.stopSendingForBlockedAccount.mockRejectedValueOnce(new Error("db"))
    mocks.del.mockRejectedValueOnce(new Error("redis down"))

    await expect(
      run(blockedError(), { inboxId: "del-fail-inbox" }),
    ).resolves.toBe(false)
    expect(mocks.loggerWarn).toHaveBeenCalled()
  })

  test("a blocked Messenger page skips the thread-owner lookup", async () => {
    const error = new ChannelError(
      "restricted",
      ChannelErrorCategory.PERMISSION_DENIED,
      {
        code: 10,
        subCode: 1_893_063,
        reason: ChannelErrorReason.ACCOUNT_SEND_RESTRICTED,
      },
    )
    await run(error, { channel: "messenger" })
    expect(mocks.syncThreadOwner).not.toHaveBeenCalled()
  })

  test("another Messenger permission error still looks up the thread owner", async () => {
    mocks.syncThreadOwner.mockResolvedValue({ threadControlState: null })
    const error = new ChannelError(
      "denied",
      ChannelErrorCategory.PERMISSION_DENIED,
      { code: 10 },
    )
    await run(error, { channel: "messenger", metadata: undefined })
    expect(mocks.syncThreadOwner).toHaveBeenCalledTimes(1)
  })
})
