import { describe, expect, test, vi } from "vitest"

vi.mock("@chatbotx.io/business/smart-delay", () => ({
  smartDelayService: {},
}))
vi.mock("../src/lib/logger", () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() },
}))

const { buildSendFlowResumeJob } = await import(
  "../src/integration/handlers/smart-delay"
)

const row = {
  id: "row-1",
  conversationId: "conv-1",
  contactInboxId: "ci-1",
  flowId: "flow-1",
  flowVersionId: "fv-1",
  nodeId: "node-1",
  metadata: null,
  appointmentId: null,
} as unknown as Parameters<typeof buildSendFlowResumeJob>[0]

describe("buildSendFlowResumeJob", () => {
  test("never emits startedByContactMessage, so a delayed resume is not message-driven", () => {
    const job = buildSendFlowResumeJob(row, {
      sendFrom: "inbox",
      appointmentId: "appt-1",
      startedByContactMessage: true,
    } as never)

    expect(job.data.data).not.toHaveProperty("startedByContactMessage")
    expect(buildSendFlowResumeJob(row).data.data).not.toHaveProperty(
      "startedByContactMessage",
    )
  })
})
