import { beforeEach, describe, expect, test, vi } from "vitest"

const { resolveIncomingTextRouting, shouldRunStoryMentionAutomation } =
  await import("../src/integration/routing")

const conversation = {
  id: "conversation-1",
  workspaceId: "workspace-1",
  additionalAttributes: {},
}

const challengeConversation = {
  ...conversation,
  additionalAttributes: {
    challenge: { type: "step", data: { stepId: "step-1" } },
  },
}

describe("resolveIncomingTextRouting", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test("does not route pending challenges when bot automation is inactive", async () => {
    const isConversationActive = vi.fn(async () => false)

    await expect(
      resolveIncomingTextRouting({
        conversation: challengeConversation as never,
        hasActionableInput: true,
        hasText: true,
        isConversationActive,
      }),
    ).resolves.toEqual({ type: "none" })

    expect(isConversationActive).toHaveBeenCalledWith(challengeConversation)
  })

  test("routes pending challenges after bot automation is confirmed active", async () => {
    const isConversationActive = vi.fn(async () => true)

    await expect(
      resolveIncomingTextRouting({
        conversation: challengeConversation as never,
        hasActionableInput: true,
        hasText: true,
        isConversationActive,
      }),
    ).resolves.toEqual({
      type: "challenge",
      conversation: challengeConversation,
      challenge: challengeConversation.additionalAttributes.challenge,
    })
  })

  test("routes an attachment-only reply to a pending challenge", async () => {
    const isConversationActive = vi.fn(async () => true)

    await expect(
      resolveIncomingTextRouting({
        conversation: challengeConversation as never,
        // An uploaded image/file/voice carries actionable input but no text.
        hasActionableInput: true,
        hasText: false,
        isConversationActive,
      }),
    ).resolves.toEqual({
      type: "challenge",
      conversation: challengeConversation,
      challenge: challengeConversation.additionalAttributes.challenge,
    })
  })

  test("routes automated response only when there is no challenge and bot automation is active", async () => {
    const isConversationActive = vi.fn(async () => true)

    await expect(
      resolveIncomingTextRouting({
        conversation: conversation as never,
        hasActionableInput: true,
        hasText: true,
        isConversationActive,
      }),
    ).resolves.toEqual({
      type: "automatedResponse",
      conversation,
    })
  })

  test("does not route attachment-only messages to automated response without a challenge", async () => {
    const isConversationActive = vi.fn(async () => true)

    // No challenge is pending, so an attachment with no text has nothing to
    // drive: automated (AI) replies stay text-only.
    await expect(
      resolveIncomingTextRouting({
        conversation: conversation as never,
        hasActionableInput: true,
        hasText: false,
        isConversationActive,
      }),
    ).resolves.toEqual({ type: "none" })
  })

  test("routes inactive inbound text to the handoff re-entry classifier", async () => {
    const isConversationActive = vi.fn(async () => false)

    await expect(
      resolveIncomingTextRouting({
        conversation: conversation as never,
        hasActionableInput: true,
        hasText: true,
        isConversationActive,
      }),
    ).resolves.toEqual({ type: "handoffReentry", conversation })
  })

  test("does not route attachment-only inactive input to the handoff classifier", async () => {
    const isConversationActive = vi.fn(async () => false)

    await expect(
      resolveIncomingTextRouting({
        conversation: conversation as never,
        hasActionableInput: true,
        hasText: false,
        isConversationActive,
      }),
    ).resolves.toEqual({ type: "none" })
  })

  test("skips messages with no actionable input without checking bot automation", async () => {
    const isConversationActive = vi.fn(async () => true)

    await expect(
      resolveIncomingTextRouting({
        conversation: conversation as never,
        hasActionableInput: false,
        hasText: false,
        isConversationActive,
      }),
    ).resolves.toEqual({ type: "none" })

    expect(isConversationActive).not.toHaveBeenCalled()
  })
})

describe("shouldRunStoryMentionAutomation", () => {
  test("runs the mention automation when the bot is active and nothing is pending", async () => {
    await expect(
      shouldRunStoryMentionAutomation({
        conversation: conversation as never,
        isConversationActive: async () => true,
      }),
    ).resolves.toBe(true)
  })

  test("leaves the mention to a pending challenge so it can take the media", async () => {
    const isConversationActive = vi.fn(async () => true)

    await expect(
      shouldRunStoryMentionAutomation({
        conversation: challengeConversation as never,
        isConversationActive,
      }),
    ).resolves.toBe(false)
    expect(isConversationActive).not.toHaveBeenCalled()
  })

  test("stays silent while the bot is paused for a human agent", async () => {
    await expect(
      shouldRunStoryMentionAutomation({
        conversation: conversation as never,
        isConversationActive: async () => false,
      }),
    ).resolves.toBe(false)
  })
})
