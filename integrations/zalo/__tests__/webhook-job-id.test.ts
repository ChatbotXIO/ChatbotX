import { describe, expect, test, vi } from "vitest"
import { webhookHandler } from "../src/handlers/webhook"

describe("zalo webhook incomingMessage job IDs", () => {
  test("uses a BullMQ-safe deterministic job ID for message events", async () => {
    const add = vi.fn()

    await webhookHandler({
      config: { clientId: "app-1" },
      req: new Request("https://example.test/webhook", {
        method: "POST",
        body: JSON.stringify({
          app_id: "app-1",
          event_name: "user_send_text",
          sender: { id: "user-1" },
          recipient: { id: "oa-1" },
          message: { msg_id: "message:1/2", text: "hi" },
        }),
      }),
      queue: { add },
    } as never)

    expect(add).toHaveBeenCalledWith(
      "incomingMessage",
      expect.objectContaining({ type: "incomingMessage" }),
      { jobId: "incoming-zalo-message_1_2" },
    )
  })
})
