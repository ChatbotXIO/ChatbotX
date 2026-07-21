import type { IntegrationJobRunChallenge } from "@chatbotx.io/worker-config"
import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  detectConversationAndContactInbox: vi.fn(),
  detectFlowVersion: vi.fn(),
  runStepsAndQuickReplies: vi.fn(async () => undefined),
  emit: vi.fn(),
  initVariables: vi.fn(() => ({ conversation: {} })),
  SdkException: class SdkException extends Error {},
}))

vi.mock("@chatbotx.io/event-bus", () => ({
  emit: mocks.emit,
}))

vi.mock("@chatbotx.io/sdk", () => ({
  initVariables: mocks.initVariables,
  SdkException: mocks.SdkException,
}))

vi.mock("../src/lib/db", () => ({
  detectConversationAndContactInbox: mocks.detectConversationAndContactInbox,
  detectFlowVersion: mocks.detectFlowVersion,
}))

vi.mock("../src/integration/handlers/flow", () => ({
  runStepsAndQuickReplies: mocks.runStepsAndQuickReplies,
}))

const { runChallenge } = await import("../src/integration/handlers/challenge")

const broadcastMetadata = {
  type: "broadcast" as const,
  broadcastId: "broadcast-1",
  contactInboxId: "contact-inbox-1",
}

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

  test("forwards challenge metadata into the resumed flow", async () => {
    await expect(
      runChallenge(
        makeChallenge({
          challenge: {
            type: "step",
            data: { metadata: broadcastMetadata },
          },
        }),
      ),
    ).resolves.toBeUndefined()

    expect(mocks.runStepsAndQuickReplies).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: broadcastMetadata,
        startFromStepId: "step-1",
        triggerMessageId: undefined,
      }),
    )
  })

  test("accepts legacy challenges without metadata", async () => {
    await expect(runChallenge(makeChallenge())).resolves.toBeUndefined()

    expect(mocks.runStepsAndQuickReplies).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: undefined,
        startFromStepId: "step-1",
      }),
    )
  })
})
