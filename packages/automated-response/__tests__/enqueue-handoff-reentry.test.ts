import { beforeEach, describe, expect, test, vi } from "vitest"

const { addMock, errorMock } = vi.hoisted(() => ({
  addMock: vi.fn(),
  errorMock: vi.fn(),
}))

vi.mock("@chatbotx.io/worker-config", () => ({
  AIJobAction: { processHandoffReentry: "processHandoffReentry" },
  aiAgentQueue: { add: addMock },
}))

vi.mock("../src/lib/logger", () => ({ logger: { error: errorMock } }))

const { enqueueHandoffReentry } = await import("../src/enqueue-handoff-reentry")

describe("enqueueHandoffReentry", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    addMock.mockResolvedValue(undefined)
  })

  test("enqueues a deterministic, message-scoped classifier job", async () => {
    await enqueueHandoffReentry({
      conversationId: "conversation-1",
      contactInboxId: "contact-inbox-1",
      messageId: "message-1",
      workspaceId: "workspace-1",
    })

    expect(addMock).toHaveBeenCalledWith(
      "processHandoffReentry",
      {
        type: "processHandoffReentry",
        data: {
          conversationId: "conversation-1",
          contactInboxId: "contact-inbox-1",
          messageId: "message-1",
        },
      },
      {
        jobId: "handoff-reentry-message-1",
        deduplication: {
          id: "handoff-reentry-message-1",
          ttl: 300_000,
          extend: true,
          replace: true,
        },
      },
    )
  })

  test("logs a normalized enqueue error with workspace context", async () => {
    addMock.mockRejectedValue(new Error("queue unavailable"))

    await enqueueHandoffReentry({
      conversationId: "conversation-1",
      contactInboxId: "contact-inbox-1",
      messageId: "message-1",
      workspaceId: "workspace-1",
    })

    expect(errorMock).toHaveBeenCalledWith(
      expect.objectContaining({
        err: expect.objectContaining({ message: "queue unavailable" }),
        workspaceId: "workspace-1",
        conversationId: "conversation-1",
        messageId: "message-1",
      }),
      "Unable to trigger handoff re-entry classifier",
    )
  })
})
