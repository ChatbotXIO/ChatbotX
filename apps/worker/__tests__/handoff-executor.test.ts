// @vitest-environment node

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

const { cancelSpy, emitSpy, handOffSpy, transferredSpy, warnSpy } = vi.hoisted(
  () => ({
    transferredSpy: vi.fn().mockResolvedValue(undefined),
    warnSpy: vi.fn(),
    cancelSpy: vi.fn().mockResolvedValue(undefined),
    emitSpy: vi.fn(),
    handOffSpy: vi.fn().mockResolvedValue(true),
  }),
)

vi.mock("@chatbotx.io/business", () => ({
  conversationService: { handOffIfBotEnabled: handOffSpy },
}))

vi.mock("@chatbotx.io/business/smart-delay", () => ({
  smartDelayService: { cancelQuickReplyFollowUps: cancelSpy },
}))

vi.mock("@chatbotx.io/event-bus", () => ({
  emit: emitSpy,
}))

vi.mock("@chatbotx.io/events", () => ({
  emitConversationTransferredToHuman: transferredSpy,
}))

vi.mock("@chatbotx.io/logger", () => ({
  default: {
    error: vi.fn(),
    warn: warnSpy,
  },
}))

describe("HandoffExecutorService", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"))
    vi.clearAllMocks()
    handOffSpy.mockResolvedValue(true)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  test("hands off through the workspace-scoped service, not a direct db write", async () => {
    const { HandoffExecutorService } = await import(
      "../src/trigger/services/handoff-executor.service"
    )

    await new HandoffExecutorService().execute({
      contactId: "contact-1",
      conversationId: "conv-1",
      reason: "needs_human",
      source: "ai_system_tool",
      workspaceId: "ws-1",
    })

    expect(handOffSpy).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      conversationId: "conv-1",
    })
    expect(cancelSpy).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      conversationIds: ["conv-1"],
    })
    expect(emitSpy).toHaveBeenCalledWith(
      "analytics:dashboard",
      expect.objectContaining({
        conversationId: "conv-1",
        eventType: "conversation:transferred_to_human",
        workspaceId: "ws-1",
      }),
    )
  })

  test("a failed follow-up cancel does not skip the transfer events", async () => {
    cancelSpy.mockRejectedValueOnce(new Error("redis down"))
    const { HandoffExecutorService } = await import(
      "../src/trigger/services/handoff-executor.service"
    )

    await expect(
      new HandoffExecutorService().execute({
        contactId: "contact-1",
        conversationId: "conv-1",
        reason: "needs_human",
        source: "ai_system_tool",
        workspaceId: "ws-1",
      }),
    ).resolves.toEqual({ status: "handedOff" })

    expect(transferredSpy).toHaveBeenCalledWith("ws-1", "contact-1", "conv-1")
    expect(emitSpy).toHaveBeenCalledWith(
      "analytics:dashboard",
      expect.objectContaining({ conversationId: "conv-1" }),
    )
    expect(warnSpy).toHaveBeenCalledWith(
      expect.objectContaining({ conversationId: "conv-1" }),
      expect.stringContaining("cancel quick reply"),
    )
  })

  test("attributes the event to the channel and inbox the caller knows", async () => {
    const { HandoffExecutorService } = await import(
      "../src/trigger/services/handoff-executor.service"
    )

    await new HandoffExecutorService().execute({
      channel: "whatsapp",
      contactId: "contact-1",
      conversationId: "conv-1",
      inboxId: "inbox-7",
      reason: "needs_human",
      source: "ai_system_tool",
      workspaceId: "ws-1",
    })

    expect(emitSpy).toHaveBeenCalledWith(
      "analytics:dashboard",
      expect.objectContaining({ channel: "whatsapp", inboxId: "inbox-7" }),
    )
  })

  test("never invents a channel when the caller does not know one", async () => {
    const { HandoffExecutorService } = await import(
      "../src/trigger/services/handoff-executor.service"
    )

    await new HandoffExecutorService().execute({
      contactId: "contact-1",
      conversationId: "conv-1",
      reason: "needs_human",
      source: "ai_system_tool",
      workspaceId: "ws-1",
    })

    const [, payload] =
      emitSpy.mock.calls.find(([type]) => type === "analytics:dashboard") ?? []
    expect(payload.channel).toBeUndefined()
    expect(payload.inboxId).toBeUndefined()
  })

  test("an already handed-off conversation emits nothing", async () => {
    handOffSpy.mockResolvedValueOnce(false)
    const { HandoffExecutorService } = await import(
      "../src/trigger/services/handoff-executor.service"
    )

    await expect(
      new HandoffExecutorService().execute({
        contactId: "contact-1",
        conversationId: "conv-1",
        reason: "needs_human",
        source: "ai_system_tool",
        workspaceId: "ws-1",
      }),
    ).resolves.toEqual({ status: "alreadyHandedOff" })

    expect(cancelSpy).not.toHaveBeenCalled()
    expect(transferredSpy).not.toHaveBeenCalled()
    expect(emitSpy).not.toHaveBeenCalled()
  })

  test("forwards the reopen opt-in only when the caller sets it", async () => {
    const { HandoffExecutorService } = await import(
      "../src/trigger/services/handoff-executor.service"
    )
    const base = {
      contactId: "contact-1",
      conversationId: "conv-1",
      reason: "needs_human",
      source: "ai_system_tool" as const,
      workspaceId: "ws-1",
    }

    await new HandoffExecutorService().execute({
      ...base,
      reopenUnansweredHumanReplyWindow: true,
    })
    await new HandoffExecutorService().execute(base)

    expect(handOffSpy).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ reopenUnansweredHumanReplyWindow: true }),
    )
    expect(handOffSpy).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ reopenUnansweredHumanReplyWindow: undefined }),
    )
  })
})
