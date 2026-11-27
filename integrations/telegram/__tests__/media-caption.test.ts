import type { MessageButtonTemplate } from "@chatbotx.io/sdk"
import { beforeEach, describe, expect, test, vi } from "vitest"

const { mockSendTelegramMessage, mockSendTelegramPhoto } = vi.hoisted(() => ({
  mockSendTelegramMessage: vi.fn(),
  mockSendTelegramPhoto: vi.fn(),
}))

vi.mock("../src/apis/bot", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/apis/bot")>()),
  sendTelegramMessage: mockSendTelegramMessage,
  sendTelegramPhoto: mockSendTelegramPhoto,
}))

vi.mock("../src/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

const { sendMessage } = await import("../src/handlers/message/outgoing-message")
const { convertFlowStepImage, convertFlowStepVideo } = await import(
  "../src/handlers/message/outgoing-message/send-attachment"
)

const ctx = { auth: { secretText: "tok" } } as never
const contact = { sourceId: "chat-1" }
const image = {
  fileType: "image",
  mimeType: "image/png",
  url: "https://example.com/a.png",
}
const quickReplies: MessageButtonTemplate[] = [
  {
    id: "qr-1",
    label: "Yes",
    buttonType: "postback",
    postback: "flow-1::qr-1",
  },
]

const flowStep = (stepType: string, caption?: string) => ({
  data: {
    contact,
    flowId: "flow-1",
    step: {
      id: "step-1",
      stepType,
      mode: "file",
      url: "https://example.com/a.bin",
      buttons: [],
      caption,
    },
  },
})

describe("telegram flow steps — media caption", () => {
  test("an image step sends its caption with the photo", () => {
    const [payload] = Array.from(
      convertFlowStepImage(flowStep("sendImage", "Hi there") as never),
    )
    expect(payload).toEqual({
      chat_id: "chat-1",
      photo: "https://example.com/a.bin",
      caption: "Hi there",
      reply_markup: undefined,
    })
  })

  test("a video step sends its caption with the video", () => {
    const [payload] = Array.from(
      convertFlowStepVideo(flowStep("sendVideo", "Watch") as never),
    )
    expect(payload).toMatchObject({ video: "https://example.com/a.bin" })
    expect(payload?.caption).toBe("Watch")
  })

  test("an empty caption is left out", () => {
    const [payload] = Array.from(
      convertFlowStepImage(flowStep("sendImage", "") as never),
    )
    expect(payload?.caption).toBeUndefined()
  })
})

describe("telegram sendMessage — one image with text", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSendTelegramMessage.mockResolvedValue(100)
    mockSendTelegramPhoto.mockResolvedValue(200)
  })

  const send = (text: string) =>
    sendMessage({
      ctx,
      data: {
        contact,
        quickReplies,
        message: {
          id: "msg-1",
          contentType: "text",
          text,
          attachments: [image],
        },
      },
    } as never)

  test("goes out as one captioned photo carrying the quick replies", async () => {
    const result = await send("Look at this")

    expect(mockSendTelegramMessage).not.toHaveBeenCalled()
    expect(mockSendTelegramPhoto).toHaveBeenCalledTimes(1)
    const [, payload] = mockSendTelegramPhoto.mock.calls[0]
    expect(payload).toMatchObject({
      chat_id: "chat-1",
      photo: "https://example.com/a.png",
      caption: "Look at this",
    })
    expect(payload.reply_markup.inline_keyboard.flat()).toEqual([
      expect.objectContaining({ text: "Yes" }),
    ])
    expect(result).toEqual({ messageIds: ["200"], sentCount: 1 })
  })

  test("text longer than a caption stays a separate message", async () => {
    const result = await send("a".repeat(1025))

    expect(mockSendTelegramMessage).toHaveBeenCalledTimes(1)
    const [, payload] = mockSendTelegramPhoto.mock.calls[0]
    expect(payload.caption).toBeUndefined()
    expect(payload.reply_markup).toBeUndefined()
    expect(result).toEqual({ messageIds: ["100", "200"], sentCount: 2 })
  })
})
