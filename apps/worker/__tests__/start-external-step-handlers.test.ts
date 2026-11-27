import { stepTypes } from "@chatbotx.io/flow-config"
import { beforeEach, describe, expect, test, vi } from "vitest"

// The startExternalFlow / startExternalNode flow steps hand everything the
// current run carries to the flow they start, through one `sendFlow` job.

const mocks = vi.hoisted(() => ({ queueAdd: vi.fn() }))

vi.mock("@chatbotx.io/events/context", () => ({
  webhookChannelOrigin: vi.fn(() => "webhook"),
}))
vi.mock("@chatbotx.io/worker-config", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@chatbotx.io/worker-config")>()),
  integrationQueue: { add: (...args: unknown[]) => mocks.queueAdd(...args) },
}))

const { flowStepHandlers } = await import("../src/integration/handlers/step")

const triggerMessageCreatedAt = new Date("2026-02-03T04:05:06Z")

const carried = {
  metadata: { source: "ad", nested: { n: 1 } },
  isBulkBroadcast: true,
  appointmentId: "appt-1",
  sendFrom: "inbox" as const,
  sentByUserId: "user-1",
  nodeVisits: { "node-a": 2 },
  triggerMessageId: "msg-1",
  triggerMessageCreatedAt,
  startedByContactMessage: true,
  commentAnchor: { postId: "post-1", commentId: "comment-1" },
}

const props = (step: Record<string, unknown>) => ({
  conversation: { id: "conv-1" },
  contactInbox: { id: "ci-1" },
  step,
  ...carried,
})

const enqueuedJob = () => mocks.queueAdd.mock.calls[0]?.[1]

describe("startExternalFlow and startExternalNode flow steps", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test("startExternalFlow forwards every carried field and adds no nodeId", async () => {
    await flowStepHandlers[stepTypes.enum.startExternalFlow]?.(
      props({ id: "s-1", flowId: "11" }) as never,
    )

    expect(mocks.queueAdd).toHaveBeenCalledTimes(1)
    expect(mocks.queueAdd.mock.calls[0]?.[0]).toBe("sendFlow")
    expect(enqueuedJob()).toEqual({
      type: "sendFlow",
      data: {
        conversationId: "conv-1",
        contactInboxId: "ci-1",
        flowId: "11",
        origin: "webhook",
        ...carried,
      },
    })
    expect(enqueuedJob().data).not.toHaveProperty("nodeId")
  })

  test("startExternalNode forwards every carried field and adds the nodeId", async () => {
    await flowStepHandlers[stepTypes.enum.startExternalNode]?.(
      props({ id: "s-2", flowId: "11", nodeId: "22" }) as never,
    )

    expect(mocks.queueAdd).toHaveBeenCalledTimes(1)
    expect(enqueuedJob()).toEqual({
      type: "sendFlow",
      data: {
        conversationId: "conv-1",
        contactInboxId: "ci-1",
        flowId: "11",
        nodeId: "22",
        origin: "webhook",
        ...carried,
      },
    })
  })
})
