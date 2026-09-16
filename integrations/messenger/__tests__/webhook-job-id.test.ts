import { createHmac } from "node:crypto"
import { describe, expect, test, vi } from "vitest"
import { webhookHandler } from "../src/handlers/webhook"

const CLIENT_SECRET = "webhook-secret"

describe("messenger webhook incomingMessage job IDs", () => {
  test("uses a BullMQ-safe deterministic job ID for message events", async () => {
    const body = JSON.stringify({
      object: "page",
      entry: [
        {
          id: "page-1",
          time: 1_700_000_000,
          messaging: [
            {
              sender: { id: "contact-1" },
              recipient: { id: "page-1" },
              timestamp: 1_700_000_000,
              message: { mid: "mid:1/2", text: "hi" },
            },
          ],
        },
      ],
    })
    const signature = createHmac("sha256", CLIENT_SECRET)
      .update(body)
      .digest("hex")
    const add = vi.fn()

    await webhookHandler({
      config: { clientSecret: CLIENT_SECRET },
      req: new Request("https://example.test/webhook", {
        method: "POST",
        body,
        headers: { "x-hub-signature-256": `sha256=${signature}` },
      }),
      queue: { add },
    } as never)

    expect(add).toHaveBeenCalledWith(
      "incomingMessage",
      expect.objectContaining({ type: "incomingMessage" }),
      { jobId: "incoming-messenger-mid_1_2" },
    )
  })
})
