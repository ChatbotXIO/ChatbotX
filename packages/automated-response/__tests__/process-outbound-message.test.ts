import { describe, expect, test, vi } from "vitest"

const { mockDispatchReply, mockGetAll } = vi.hoisted(() => ({
  mockDispatchReply: vi.fn().mockResolvedValue(true),
  mockGetAll: vi.fn().mockResolvedValue([{ id: "rule-1", type: "outbound" }]),
}))

vi.mock("../src/dispatch-reply", () => ({
  dispatchAutomatedResponseReply: mockDispatchReply,
}))

vi.mock("../src/utils", () => ({
  automatedResponseService: { getAll: mockGetAll },
}))

const { replyByOutboundAutomatedResponse } = await import(
  "../src/process-outbound-message"
)

describe("replyByOutboundAutomatedResponse", () => {
  test("an outbound (agent message) rule never marks the flow run message-driven", async () => {
    await replyByOutboundAutomatedResponse({
      conversation: { id: "c-1", workspaceId: "ws-1" } as never,
      contactInbox: { id: "ci-1" } as never,
      message: { id: "m-1", text: "hello" },
    })

    expect(mockDispatchReply).toHaveBeenCalledWith(
      expect.objectContaining({ triggerType: "agent_message_out" }),
    )
    expect(mockDispatchReply.mock.calls[0][0]).not.toHaveProperty(
      "startedByContactMessage",
    )
  })
})
