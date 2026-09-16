import { describe, expect, test, vi } from "vitest"
import { webhookHandler } from "../src/handlers/webhook"
import { hmacSha256Hex } from "../src/lib/webhook"

const CLIENT_SECRET = "webhook-secret"

describe("instagram webhook incomingMessage job IDs", () => {
  test("uses a BullMQ-safe deterministic job ID for message events", async () => {
    const body = JSON.stringify({
      object: "instagram",
      entry: [
        {
          id: "instagram-1",
          time: 1_700_000_000,
          messaging: [
            {
              sender: { id: "contact-1" },
              recipient: { id: "instagram-1" },
              timestamp: 1_700_000_000,
              message: { mid: "mid:1/2", text: "hi" },
            },
          ],
        },
      ],
    })
    const signature = await hmacSha256Hex(CLIENT_SECRET, body)
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
      { jobId: "incoming-instagram-mid_1_2" },
    )
  })
})
