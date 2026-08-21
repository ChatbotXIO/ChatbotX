import { beforeEach, describe, expect, test, vi } from "vitest"

const { mockSendMessageToZaloOA } = vi.hoisted(() => ({
  mockSendMessageToZaloOA: vi.fn(),
}))

vi.mock("../src/api/message", () => ({
  sendMessageToZaloOA: mockSendMessageToZaloOA,
  uploadAttachment: vi.fn(),
}))

vi.mock("../src/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

const { sendMessage, sendFlowStep } = await import(
  "../src/handlers/message/outgoing-message"
)

const ctx = {
  auth: { tokens: { accessToken: "tok" } },
} as never

const contact = {
  id: "contact-1",
  sourceId: "zalo-uid-1",
} as never

describe("zalo outgoing handlers return provider message ids", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSendMessageToZaloOA.mockResolvedValue({
      error: 0,
      message: "Success",
      data: { message_id: "m_provider-1" },
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

    expect(mockSendMessageToZaloOA).toHaveBeenCalledTimes(1)
    expect(result).toEqual({ messageIds: ["m_provider-1"] })
  })

  test("sendFlowStep (sendText) returns the Send API message_id", async () => {
    const result = await sendFlowStep({
      ctx,
      data: {
        contact,
        flowId: "flow-1",
        step: {
          id: "step-1",
          stepType: "sendText",
          text: "automated reply",
          buttons: [],
        },
      },
    } as never)

    expect(mockSendMessageToZaloOA).toHaveBeenCalledTimes(1)
    expect(result).toEqual({ messageIds: ["m_provider-1"] })
  })

  test("sendMessage tolerates a response without data.message_id", async () => {
    mockSendMessageToZaloOA.mockResolvedValue({
      error: 0,
      message: "Success",
    })

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

    expect(result).toEqual({ messageIds: [] })
  })
})
