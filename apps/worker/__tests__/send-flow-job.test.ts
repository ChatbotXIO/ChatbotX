import { describe, expect, test, vi } from "vitest"

vi.mock("@chatbotx.io/events/context", () => ({
  webhookChannelOrigin: vi.fn(() => "webhook"),
}))
vi.mock("@chatbotx.io/worker-config", () => ({
  IntegrationJobAction: { sendFlow: "sendFlow" },
}))

const { buildSendFlowJob, pickSendFlowExtras } = await import(
  "../src/integration/handlers/send-flow-job"
)

describe("buildSendFlowJob", () => {
  test("a trigger starts a flow with just the core and the origin", () => {
    expect(
      buildSendFlowJob({
        conversationId: "c1",
        contactInboxId: "ci1",
        flowId: "f1",
      }),
    ).toEqual({
      type: "sendFlow",
      data: {
        conversationId: "c1",
        contactInboxId: "ci1",
        flowId: "f1",
        origin: "webhook",
      },
    })
  })

  test("a flow step forwards every carried field and cannot override the core", () => {
    const createdAt = new Date("2026-01-01T00:00:00Z")
    const extras = pickSendFlowExtras({
      metadata: { a: 1 },
      isBulkBroadcast: true,
      appointmentId: "ap1",
      sendFrom: "inbox",
      sentByUserId: "u1",
      nodeVisits: { n1: 2 },
      triggerMessageId: "m1",
      triggerMessageCreatedAt: createdAt,
      startedByContactMessage: true,
      commentAnchor: undefined,
    })

    const job = buildSendFlowJob(
      {
        conversationId: "c1",
        contactInboxId: "ci1",
        flowId: "f1",
        nodeId: "n1",
      },
      extras,
    )

    expect(job.data).toMatchObject({
      conversationId: "c1",
      contactInboxId: "ci1",
      flowId: "f1",
      nodeId: "n1",
      metadata: { a: 1 },
      isBulkBroadcast: true,
      appointmentId: "ap1",
      sendFrom: "inbox",
      sentByUserId: "u1",
      nodeVisits: { n1: 2 },
      triggerMessageId: "m1",
      triggerMessageCreatedAt: createdAt,
      startedByContactMessage: true,
      origin: "webhook",
    })
  })

  test("pickSendFlowExtras carries only the named fields, not the rest of the step props", () => {
    const extras = pickSendFlowExtras({
      sentByUserId: "u1",
      flowVersion: "must not leak",
    } as never)

    expect(extras).not.toHaveProperty("flowVersion")
    expect(extras.sentByUserId).toBe("u1")
  })
})
