import { beforeEach, describe, expect, test, vi } from "vitest"

const { mockSendPageMessage } = vi.hoisted(() => ({
  mockSendPageMessage: vi.fn(),
}))

vi.mock("../src/apis/message", () => ({
  sendPageMessage: mockSendPageMessage,
}))

vi.mock("../src/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

const { sendMessage, sendFlowStep } = await import(
  "../src/handlers/message/outgoing-message"
)

const ctx = {
  auth: { tokens: { accessToken: "tok" }, version: "v20.0" },
  integrationDetail: { personaId: undefined },
} as never

const contact = {
  id: "contact-1",
  sourceId: "psid-1",
  lastIncomingMessageAt: new Date("2026-06-23T09:00:00.000Z"),
} as never

describe("messenger outgoing handlers return provider message ids", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSendPageMessage.mockResolvedValue({
      recipient_id: "psid-1",
      message_id: "m_provider-1",
    })
  })

  test("sendMessage returns the Send API message_id so the worker can persist sourceId", async () => {
    const result = await sendMessage({
      ctx,
      data: {
        contact,
        message: {
          id: "msg-1",
          contentType: "text",
          messageType: "outgoing",
          text: "hello",
        },
      },
    } as never)

    expect(mockSendPageMessage).toHaveBeenCalledTimes(1)
    expect(result).toEqual({ messageIds: ["m_provider-1"] })
  })

  test("sendFlowStep (sendText) returns the Send API message_id", async () => {
    const result = await sendFlowStep({
      ctx,
      data: {
        contact,
        step: {
          id: "step-1",
          nodeId: "node-1",
          stepType: "sendText",
          text: "automated reply",
          buttons: [],
        },
      },
    } as never)

    expect(mockSendPageMessage).toHaveBeenCalledTimes(1)
    expect(result).toEqual({ messageIds: ["m_provider-1"] })
  })
})
