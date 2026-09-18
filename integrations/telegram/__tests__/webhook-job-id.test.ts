import { describe, expect, test, vi } from "vitest"
import { webhookHandler } from "../src/handlers/webhook"

describe("telegram webhook incomingMessage job IDs", () => {
  test("uses the update ID and safe integration identifier", async () => {
    const add = vi.fn()

    await webhookHandler({
      config: { botId: "bot:1/2" },
      req: new Request("https://example.test/webhook", {
        method: "POST",
        body: JSON.stringify({
          update_id: 42,
          message: {
            message_id: 1,
            chat: { id: 123, type: "private" },
            date: 1_700_000_000,
            text: "hi",
          },
        }),
      }),
      queue: { add },
    } as never)

    expect(add).toHaveBeenCalledWith(
      "incomingMessage",
      expect.objectContaining({ type: "incomingMessage" }),
      { jobId: "incoming-telegram-bot_1_2-42" },
    )
  })
})
