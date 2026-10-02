// @vitest-environment node

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

const { cancelSpy, emitSpy, returningSpy, setSpy, transferredSpy, warnSpy } =
  vi.hoisted(() => {
    const returningSpy = vi.fn().mockResolvedValue([{ id: "conv-1" }])
    const whereSpy = vi.fn(() => ({ returning: returningSpy }))
    const setSpy = vi.fn(() => ({ where: whereSpy }))

    return {
      transferredSpy: vi.fn().mockResolvedValue(undefined),
      warnSpy: vi.fn(),
      cancelSpy: vi.fn().mockResolvedValue(undefined),
      emitSpy: vi.fn(),
      returningSpy,
      setSpy,
      whereSpy,
    }
  })

vi.mock("@chatbotx.io/business", () => ({
  BOT_DISABLE_DURATION_MS: 24 * 60 * 60 * 1000,
  sqlDropQuickReplyChallenge: () => ({ __dropQuickReplyChallenge: true }),
}))

vi.mock("@chatbotx.io/business/smart-delay", () => ({
  smartDelayService: { cancelQuickReplyFollowUps: cancelSpy },
}))

vi.mock("@chatbotx.io/database/client", () => ({
  and: (...args: unknown[]) => ({ __and: args }),
  db: {
    update: vi.fn(() => ({ set: setSpy })),
  },
  eq: (column: unknown, value: unknown) => ({ __eq: [column, value] }),
}))

vi.mock("@chatbotx.io/database/schema", () => ({
  conversationModel: {
    botEnabled: { __column: "botEnabled" },
    botResumeAt: { __column: "botResumeAt" },
    id: { __column: "id" },
  },
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
    returningSpy.mockResolvedValue([{ id: "conv-1" }])
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  test("sets a bot resume expiry when transferring the conversation to human", async () => {
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

    expect(setSpy).toHaveBeenCalledWith({
      botEnabled: false,
      botResumeAt: new Date("2026-01-02T00:00:00.000Z"),
      additionalAttributes: { __dropQuickReplyChallenge: true },
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
    ).resolves.toBeUndefined()

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
})
