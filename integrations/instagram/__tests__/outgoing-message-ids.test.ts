import { beforeEach, describe, expect, test, vi } from "vitest"

const { mockSendInstagramMessage } = vi.hoisted(() => ({
  mockSendInstagramMessage: vi.fn(),
}))

vi.mock("../src/apis/page", () => ({
  sendInstagramMessage: mockSendInstagramMessage,
}))

vi.mock("../src/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

const { sendMessage, sendFlowStep } = await import(
  "../src/handlers/message/outgoing-message"
)

const ctx = { auth: { tokens: { accessToken: "tok" } } } as never
const contact = { id: "contact-1", sourceId: "igsid-1" } as never

describe("instagram outgoing handlers return provider message ids", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSendInstagramMessage.mockResolvedValue({
      recipient_id: "igsid-1",
      message_id: "ig_provider-1",
    })
  })

  test("sendMessage returns the Send API message_id", async () => {
    const result = await sendMessage({
      ctx,
      data: {
        contact,
        message: { id: "msg-1", contentType: "text", text: "hello" },
      },
    } as never)

    expect(mockSendInstagramMessage).toHaveBeenCalledTimes(1)
    expect(result).toEqual({ messageIds: ["ig_provider-1"] })
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

    expect(mockSendInstagramMessage).toHaveBeenCalledTimes(1)
    expect(result).toEqual({ messageIds: ["ig_provider-1"] })
  })
})
