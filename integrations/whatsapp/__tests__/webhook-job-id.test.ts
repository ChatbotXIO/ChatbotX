import { describe, expect, test, vi } from "vitest"

vi.mock("whatsapp-api-js/middleware/next", () => ({
  WhatsAppAPI: class {
    on: { message?: (args: unknown) => void } = {}

    async handle_post(): Promise<number> {
      await Promise.resolve()
      this.on.message?.({
        phoneID: "phone-1",
        message: { id: "wamid:1/2" },
      })
      return 200
    }
  },
}))

const { webhookHandler } = await import("../src/handlers/webhook")

describe("WhatsApp webhook incomingMessage job IDs", () => {
  test("uses a BullMQ-safe deterministic job ID for message events", async () => {
    const add = vi.fn()

    await expect(
      webhookHandler({
        config: { verifyToken: "verify-token", manualIntegration: true },
        req: new Request("https://example.test/webhook", {
          method: "POST",
          body: JSON.stringify({
            entry: [
              {
                id: "waba-1",
                changes: [
                  {
                    field: "messages",
                    value: {
                      metadata: { phone_number_id: "phone-1" },
                      messages: [
                        {
                          from: "user-1",
                          id: "wamid:1/2",
                          timestamp: "1",
                          type: "text",
                          text: { body: "hi" },
                        },
                      ],
                    },
                  },
                ],
              },
            ],
          }),
        }),
        queue: { add },
      } as never),
    ).resolves.toBe("ok")

    expect(add).toHaveBeenCalledWith(
      "incomingMessage",
      expect.objectContaining({ type: "incomingMessage" }),
      expect.objectContaining({ jobId: "wa-msg-phone-1-wamid_1_2" }),
    )
  })
})
