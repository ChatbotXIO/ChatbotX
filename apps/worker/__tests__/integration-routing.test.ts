import { beforeEach, describe, expect, test, vi } from "vitest"

const { resolveIncomingTextRouting } = await import(
  "../src/integration/routing"
)

const conversation = {
  id: "conversation-1",
  workspaceId: "workspace-1",
  additionalAttributes: {},
}

describe("resolveIncomingTextRouting", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test("does not route pending challenges when bot automation is inactive", async () => {
    const inactiveConversation = {
      ...conversation,
      additionalAttributes: {
        challenge: { type: "step", data: { stepId: "step-1" } },
      },
    }
    const isConversationActive = vi.fn(async () => false)

    await expect(
      resolveIncomingTextRouting({
        conversation: inactiveConversation as never,
        isEligibleIncomingText: true,
        isConversationActive,
      }),
    ).resolves.toEqual({ type: "none" })

    expect(isConversationActive).toHaveBeenCalledWith(inactiveConversation)
  })

  test("routes pending challenges after bot automation is confirmed active", async () => {
    const activeConversation = {
      ...conversation,
      additionalAttributes: {
        challenge: { type: "step", data: { stepId: "step-1" } },
      },
    }
    const isConversationActive = vi.fn(async () => true)

    await expect(
      resolveIncomingTextRouting({
        conversation: activeConversation as never,
        isEligibleIncomingText: true,
        isConversationActive,
      }),
    ).resolves.toEqual({
      type: "challenge",
      conversation: activeConversation,
      challenge: activeConversation.additionalAttributes.challenge,
    })
  })

  test("routes automated response only when there is no challenge and bot automation is active", async () => {
    const isConversationActive = vi.fn(async () => true)

    await expect(
      resolveIncomingTextRouting({
        conversation: conversation as never,
        isEligibleIncomingText: true,
        isConversationActive,
      }),
    ).resolves.toEqual({
      type: "automatedResponse",
      conversation,
    })
  })

  test("skips ineligible incoming text without checking bot automation", async () => {
    const isConversationActive = vi.fn(async () => true)

    await expect(
      resolveIncomingTextRouting({
        conversation: conversation as never,
        isEligibleIncomingText: false,
        isConversationActive,
      }),
    ).resolves.toEqual({ type: "none" })

    expect(isConversationActive).not.toHaveBeenCalled()
  })
})
