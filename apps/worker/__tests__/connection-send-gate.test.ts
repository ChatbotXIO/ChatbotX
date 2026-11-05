import { DelayedError } from "bullmq"
import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({ resolveSendDecision: vi.fn() }))

vi.mock("@chatbotx.io/business", () => ({
  connectionStateService: { resolveSendDecision: mocks.resolveSendDecision },
}))
vi.mock("../src/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

const {
  CONNECTION_SEND_DEFERRAL_POLICY,
  deferralDelayMs,
  deferSendWhileAccountReconnecting,
} = await import("../src/chat/utils/connection-send-gate")

type GateJob = Parameters<typeof deferSendWhileAccountReconnecting>[0]

const buildJob = (
  data: unknown,
  overrides: Partial<Pick<GateJob, "attemptsStarted" | "attemptsMade">> = {},
): GateJob & { moveToDelayed: ReturnType<typeof vi.fn> } =>
  ({
    id: "job-1",
    data,
    attemptsStarted: 1,
    attemptsMade: 0,
    moveToDelayed: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  }) as unknown as GateJob & { moveToDelayed: ReturnType<typeof vi.fn> }

const channelMessage = (inboxId = "inbox-1") => ({
  type: "sendChannelMessage",
  data: { contactInbox: { inboxId }, message: { senderType: "bot" } },
})

beforeEach(() => {
  vi.clearAllMocks()
  mocks.resolveSendDecision.mockResolvedValue("send")
})

describe("deferSendWhileAccountReconnecting", () => {
  test("lets a send through when the account is not reconnecting", async () => {
    const job = buildJob(channelMessage())

    await expect(
      deferSendWhileAccountReconnecting(job, "token"),
    ).resolves.toBeUndefined()

    expect(mocks.resolveSendDecision).toHaveBeenCalledWith({
      inboxId: "inbox-1",
    })
    expect(job.moveToDelayed).not.toHaveBeenCalled()
  })

  test("parks the job and throws DelayedError while the account is reconnecting", async () => {
    mocks.resolveSendDecision.mockResolvedValue("defer")
    const job = buildJob(channelMessage())

    await expect(
      deferSendWhileAccountReconnecting(job, "token"),
    ).rejects.toBeInstanceOf(DelayedError)

    expect(job.moveToDelayed).toHaveBeenCalledOnce()
    const [runAt, token] = job.moveToDelayed.mock.calls[0] as [number, string]
    expect(token).toBe("token")
    expect(runAt).toBeGreaterThan(Date.now())
  })

  test("sends anyway once the deferral budget is spent", async () => {
    mocks.resolveSendDecision.mockResolvedValue("defer")
    const maxDeferrals = CONNECTION_SEND_DEFERRAL_POLICY.maxDeferrals
    // BullMQ counts one start per activation; deferrals = started - made - 1.
    const job = buildJob(channelMessage(), {
      attemptsStarted: maxDeferrals + 1,
      attemptsMade: 0,
    })

    await expect(
      deferSendWhileAccountReconnecting(job, "token"),
    ).resolves.toBeUndefined()
    expect(job.moveToDelayed).not.toHaveBeenCalled()
  })

  test("still defers on the last deferral inside the budget", async () => {
    mocks.resolveSendDecision.mockResolvedValue("defer")
    const job = buildJob(channelMessage(), {
      attemptsStarted: CONNECTION_SEND_DEFERRAL_POLICY.maxDeferrals,
      attemptsMade: 0,
    })

    await expect(
      deferSendWhileAccountReconnecting(job, "token"),
    ).rejects.toBeInstanceOf(DelayedError)
  })

  test.each([
    [
      "sendWhatsappTemplateMessage",
      { conversation: {}, contactInbox: { inboxId: "i-2" } },
    ],
    [
      "sendWhatsappTemplateToConversation",
      { conversation: {}, contactInbox: { inboxId: "i-2" } },
    ],
    [
      "sendMessengerTemplateMessage",
      { conversation: {}, contactInbox: { inboxId: "i-2" } },
    ],
  ])("%s is gated on its contact inbox's inbox", async (type, data) => {
    await deferSendWhileAccountReconnecting(buildJob({ type, data }), "token")

    expect(mocks.resolveSendDecision).toHaveBeenCalledWith({ inboxId: "i-2" })
  })

  test.each([
    [
      "a flow step with no contact inbox",
      { type: "sendFlowMessage", data: { conversationId: "c" } },
    ],
    [
      "a chat message addressed by conversation only",
      { type: "sendChatMessage", data: { conversation: {} } },
    ],
    [
      "a typing indicator",
      { type: "sendTyping", data: { contactInbox: { inboxId: "i" } } },
    ],
    ["a delete", { type: "deleteChannelMessage", data: {} }],
    ["an edit", { type: "editChannelMessage", data: {} }],
  ])("%s is not gated and costs no query", async (_name, data) => {
    await expect(
      deferSendWhileAccountReconnecting(buildJob(data), "token"),
    ).resolves.toBeUndefined()
    expect(mocks.resolveSendDecision).not.toHaveBeenCalled()
  })

  test("without a lock token the job cannot be parked, so it sends", async () => {
    mocks.resolveSendDecision.mockResolvedValue("defer")
    const job = buildJob(channelMessage())

    await expect(
      deferSendWhileAccountReconnecting(job, undefined),
    ).resolves.toBeUndefined()
    expect(mocks.resolveSendDecision).not.toHaveBeenCalled()
    expect(job.moveToDelayed).not.toHaveBeenCalled()
  })

  test("a failing lookup sends, so the handler keeps its own retry and failure path", async () => {
    mocks.resolveSendDecision.mockRejectedValue(new Error("db down"))
    const job = buildJob(channelMessage())

    await expect(
      deferSendWhileAccountReconnecting(job, "token"),
    ).resolves.toBeUndefined()
    expect(job.moveToDelayed).not.toHaveBeenCalled()
  })
})

describe("deferralDelayMs", () => {
  const { baseDelayMs, maxDelayMs } = CONNECTION_SEND_DEFERRAL_POLICY

  test("backs off exponentially and never exceeds the cap", () => {
    const noJitterFloor = (deferral: number) =>
      deferralDelayMs(deferral, () => 0)
    const noJitterCeiling = (deferral: number) =>
      deferralDelayMs(deferral, () => 1)

    expect(noJitterCeiling(0)).toBe(baseDelayMs)
    expect(noJitterCeiling(1)).toBe(baseDelayMs * 2)
    expect(noJitterCeiling(10)).toBe(maxDelayMs)
    expect(noJitterFloor(10)).toBe(maxDelayMs / 2)
  })

  test("keeps the whole wait around ten minutes, not a poll every few seconds", () => {
    let total = 0
    for (
      let deferral = 0;
      deferral < CONNECTION_SEND_DEFERRAL_POLICY.maxDeferrals;
      deferral += 1
    ) {
      total += deferralDelayMs(deferral, () => 1)
    }
    expect(total).toBeGreaterThanOrEqual(10 * 60_000)
    expect(total).toBeLessThanOrEqual(15 * 60_000)
  })
})
