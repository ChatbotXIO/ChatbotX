import { describe, expect, test, vi } from "vitest"
import { webhookHandler } from "../src/handlers/webhook"
import { hmacSha256Hex } from "../src/lib/webhook"
import { INSTAGRAM_MESSAGE_METADATA } from "../src/schema"

const CLIENT_SECRET = "webhook-secret"

const dispatchMessage = async (message: Record<string, unknown>) => {
  const body = JSON.stringify({
    object: "instagram",
    entry: [
      {
        id: "ig-account-id",
        time: 1_783_674_105,
        messaging: [
          {
            sender: { id: "ig-account-id" },
            recipient: { id: "customer-id" },
            timestamp: 1_783_674_105,
            message,
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

  return add
}

describe("instagram message echoes", () => {
  test("an echo of a message the account sent is enqueued as incomingMessageEcho", async () => {
    const add = await dispatchMessage({
      mid: "mid-echo",
      text: "agent reply",
      is_echo: true,
    })

    expect(add).toHaveBeenCalledTimes(1)
    expect(add).toHaveBeenCalledWith(
      "incomingMessageEcho",
      expect.objectContaining({
        type: "incomingMessageEcho",
        data: expect.objectContaining({ integrationType: "instagram" }),
      }),
    )
  })

  test("the echo of our own bot send is still dropped", async () => {
    const add = await dispatchMessage({
      mid: "mid-bot",
      text: "bot reply",
      is_echo: true,
      metadata: INSTAGRAM_MESSAGE_METADATA,
    })

    expect(add).not.toHaveBeenCalled()
  })

  test("a customer message stays an incomingMessage", async () => {
    const add = await dispatchMessage({ mid: "mid-customer", text: "hello" })

    expect(add).toHaveBeenCalledWith(
      "incomingMessage",
      expect.objectContaining({ type: "incomingMessage" }),
    )
  })
})
