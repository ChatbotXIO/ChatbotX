import type { IntegrationJobRunChallenge } from "@chatbotx.io/worker-config"
import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  detectConversationAndContactInbox: vi.fn(),
  detectFlowVersion: vi.fn(),
  runStepsAndQuickReplies: vi.fn(async () => undefined),
  emit: vi.fn(),
  runQuickReplyChallenge: vi.fn(async () => undefined),
  initVariables: vi.fn(() => ({ conversation: {} })),
  SdkException: class SdkException extends Error {},
}))

vi.mock("@chatbotx.io/event-bus", () => ({
  emit: mocks.emit,
}))

vi.mock("@chatbotx.io/sdk", () => ({
  initVariables: mocks.initVariables,
  SdkException: mocks.SdkException,
  // Mirror of the real pure helper — the module is fully mocked here.
  resolveSourceScopedIdentityMatch: async <T>(
    identity: { sourceId: string; sourceUserId?: string | null },
    lookup: (
      where: { sourceId: string } | { sourceUserId: string },
    ) => Promise<T | undefined>,
  ) => {
    const bySourceId = await lookup({ sourceId: identity.sourceId })
    if (bySourceId || !identity.sourceUserId) {
      return bySourceId
        ? { row: bySourceId, matchedBy: "sourceId" as const }
        : undefined
    }
    const bySourceUserId = await lookup({
      sourceUserId: identity.sourceUserId,
    })
    return bySourceUserId
      ? { row: bySourceUserId, matchedBy: "sourceUserId" as const }
      : undefined
  },
}))

vi.mock("../src/lib/db", () => ({
  detectConversationAndContactInbox: mocks.detectConversationAndContactInbox,
  detectFlowVersion: mocks.detectFlowVersion,
}))

vi.mock("../src/integration/handlers/flow", () => ({
  runStepsAndQuickReplies: mocks.runStepsAndQuickReplies,
}))

vi.mock("../src/integration/handlers/quick-reply-resume", () => ({
  runQuickReplyChallenge: mocks.runQuickReplyChallenge,
}))

const { runChallenge } = await import("../src/integration/handlers/challenge")

function makeChallenge(
  overrides: Partial<IntegrationJobRunChallenge["data"]> = {},
): IntegrationJobRunChallenge["data"] {
  const { challenge: challengeOverrides, ...rest } = overrides
  const challengeData = {
    flowId: "flow-1",
    flowVersionId: "flow-version-1",
    nodeId: "node-1",
    stepId: "step-1",
    attempts: 2,
    lastAttemptAt: new Date("2026-01-01T00:00:00Z"),
    ...challengeOverrides?.data,
  }

  return {
    conversationId: "conversation-1",
    contactInboxId: "contact-inbox-1",
    challenge: {
      type: "step",
      ...challengeOverrides,
      data: challengeData,
    },
    ...rest,
  }
}

describe("runChallenge", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.detectConversationAndContactInbox.mockResolvedValue({
      conversation: {
        id: "conversation-1",
        workspaceId: "workspace-1",
        contactId: "contact-1",
      },
      contactInbox: {
        id: "contact-inbox-1",
        channel: "messenger",
      },
    })
    mocks.detectFlowVersion.mockResolvedValue({
      flowVersion: {
        id: "flow-version-1",
        flowId: "flow-1",
        nodes: [
          {
            id: "node-1",
            data: {
              details: {
                steps: [{ id: "step-1" }],
              },
            },
          },
        ],
      },
      useLatestFlowVersion: false,
    })
  })

  test("resumes challenge from the stored step", async () => {
    await expect(runChallenge(makeChallenge())).resolves.toBeUndefined()

    expect(mocks.runStepsAndQuickReplies).toHaveBeenCalledWith(
      expect.objectContaining({
        startFromStepId: "step-1",
      }),
    )
  })

  test("delegates a quickReply challenge and does not re-run the node", async () => {
    await runChallenge({
      conversationId: "conversation-1",
      contactInboxId: "contact-inbox-1",
      challenge: {
        type: "quickReply",
        data: {
          flowId: "flow-1",
          nodeId: "node-1",
          attempts: 0,
          maxRetries: 3,
          sentAt: new Date(),
        },
      },
    })

    expect(mocks.runQuickReplyChallenge).toHaveBeenCalledOnce()
    expect(mocks.runStepsAndQuickReplies).not.toHaveBeenCalled()
  })

  test("ignores an unknown challenge type without resolving a flow", async () => {
    await expect(
      runChallenge({
        conversationId: "conversation-1",
        contactInboxId: "contact-inbox-1",
        challenge: { type: "somethingNew", data: {} },
      } as unknown as IntegrationJobRunChallenge["data"]),
    ).resolves.toBeUndefined()

    expect(mocks.runQuickReplyChallenge).not.toHaveBeenCalled()
    expect(mocks.detectFlowVersion).not.toHaveBeenCalled()
    expect(mocks.runStepsAndQuickReplies).not.toHaveBeenCalled()
  })
})
