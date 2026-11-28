import { describe, expect, test, vi } from "vitest"

const sendMessageApi = vi.fn()

vi.mock("../src/apis/message", () => ({ sendMessage: sendMessageApi }))
vi.mock("../src/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

const { sendFlowStep, sendMessage } = await import(
  "../src/handlers/message/outgoing-message"
)

const ctx = {
  auth: { metadata: { openId: "b1" }, tokens: { accessToken: "t" } },
} as never
const HOUR = 60 * 60 * 1000

const run = (ms: number, sendFrom: "inbox" | "api" | undefined) =>
  sendMessage({
    ctx,
    data: {
      contact: {
        id: "c1",
        sourceConversationId: "conv-1",
        lastIncomingMessageAt: new Date(Date.now() - ms),
      },
      message: { text: "hi", contentType: "text" },
      sendFrom,
    },
  } as never)

describe("TikTok sendMessage — messaging window", () => {
  test("refuses a manual send after 48h with tiktok_messaging_window_closed", async () => {
    await expect(run(49 * HOUR, "inbox")).rejects.toMatchObject({
      code: "tiktok_messaging_window_closed",
    })
    expect(sendMessageApi).not.toHaveBeenCalled()
  })

  test("sends inside 48h", async () => {
    sendMessageApi.mockResolvedValue("m1")
    await run(30 * HOUR, "api")
    expect(sendMessageApi).toHaveBeenCalled()
  })

  test("refuses a closed-window manual flow step", async () => {
    await expect(
      sendFlowStep({
        ctx,
        data: {
          contact: {
            id: "c1",
            sourceConversationId: "conv-1",
            lastIncomingMessageAt: new Date(Date.now() - 49 * HOUR),
          },
          step: { stepType: "sendText", content: "hi" },
          sendFrom: "inbox",
        },
      } as never),
    ).rejects.toMatchObject({ code: "tiktok_messaging_window_closed" })
  })
})
