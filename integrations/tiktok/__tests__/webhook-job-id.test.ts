import { createHmac } from "node:crypto"
import { describe, expect, test, vi } from "vitest"
import { webhookHandler } from "../src/handlers/webhook"

const CLIENT_SECRET = "webhook-secret"

describe("TikTok webhook incomingMessage job IDs", () => {
  test("preserves echo delay while adding a BullMQ-safe deterministic job ID", async () => {
    const timestamp = Math.floor(Date.now() / 1000)
    const body = JSON.stringify({
      client_key: "client-1",
      event: "im_send_msg",
      create_time: timestamp,
      user_openid: "user-1",
      content: "{}",
      message_id: "message:1/2",
    })
    const signature = createHmac("sha256", CLIENT_SECRET)
      .update(`${timestamp}.${body}`)
      .digest("hex")
    const add = vi.fn()

    await webhookHandler({
      config: { clientSecret: CLIENT_SECRET, openId: "business:1/2" },
      req: new Request("https://example.test/webhook", {
        method: "POST",
        body,
        headers: { "TikTok-Signature": `t=${timestamp},s=${signature}` },
      }),
      queue: { add },
    } as never)

    expect(add).toHaveBeenCalledWith(
      "incomingMessage",
      expect.objectContaining({ type: "incomingMessage" }),
      {
        delay: 2000,
        jobId: "incoming-tiktok-business_1_2-im_send_msg-message_1_2",
      },
    )
  })
})
