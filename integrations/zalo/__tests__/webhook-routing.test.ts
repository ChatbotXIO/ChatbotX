import type { ContextQueue, HandleRequestProps } from "@chatbotx.io/sdk"
import { describe, expect, test, vi } from "vitest"
import { webhookHandler } from "../src/handlers/webhook"
import type { ZaloConfig } from "../src/schema/definition"

const APP_ID = "app-1"

const config = { clientId: APP_ID } as unknown as ZaloConfig

const buildProps = (
  body: Record<string, unknown>,
  queueAdd: ContextQueue["add"],
): HandleRequestProps<ZaloConfig> =>
  ({
    config,
    req: new Request("https://example.com/webhook", {
      method: "POST",
      body: JSON.stringify(body),
      headers: { "Content-Type": "application/json" },
    }),
    queue: { add: queueAdd },
  }) as unknown as HandleRequestProps<ZaloConfig>

describe("zalo webhookHandler event routing", () => {
  test("acks user_received_message delivery receipts without enqueueing", async () => {
    const queueAdd = vi.fn()

    const result = await webhookHandler(
      buildProps(
        {
          app_id: APP_ID,
          event_name: "user_received_message",
          sender: { id: "oa-1" },
          recipient: { id: "user-1" },
          message: { msg_id: "m-1" },
        },
        queueAdd,
      ),
    )

    expect(result).toBe("ok")
    expect(queueAdd).not.toHaveBeenCalled()
  })

  test("routes user_send_text to the incomingMessage queue", async () => {
    const queueAdd = vi.fn()

    await webhookHandler(
      buildProps(
        {
          app_id: APP_ID,
          event_name: "user_send_text",
          sender: { id: "user-1" },
          recipient: { id: "oa-1" },
          message: { msg_id: "m-2", text: "hello" },
        },
        queueAdd,
      ),
    )

    expect(queueAdd).toHaveBeenCalledWith(
      "incomingMessage",
      expect.objectContaining({
        type: "incomingMessage",
        data: expect.objectContaining({
          integrationType: "zalo",
          integrationIdentifier: "oa-1",
        }),
      }),
    )
  })

  test("routes oa_send_text echoes to the incomingMessage queue", async () => {
    const queueAdd = vi.fn()

    await webhookHandler(
      buildProps(
        {
          app_id: APP_ID,
          event_name: "oa_send_text",
          sender: { id: "oa-1" },
          recipient: { id: "user-1" },
          message: { msg_id: "m-3", text: "reply" },
        },
        queueAdd,
      ),
    )

    expect(queueAdd).toHaveBeenCalledWith(
      "incomingMessage",
      expect.objectContaining({
        type: "incomingMessage",
        data: expect.objectContaining({
          integrationIdentifier: "oa-1",
        }),
      }),
    )
  })

  test("routes user_seen_message to the contactMarkAsRead queue", async () => {
    const queueAdd = vi.fn()

    await webhookHandler(
      buildProps(
        {
          app_id: APP_ID,
          event_name: "user_seen_message",
          sender: { id: "user-1" },
          recipient: { id: "oa-1" },
          message: { msg_ids: ["m-4"] },
        },
        queueAdd,
      ),
    )

    expect(queueAdd).toHaveBeenCalledWith(
      "contactMarkAsRead",
      expect.objectContaining({
        type: "contactMarkAsRead",
        data: expect.objectContaining({
          integrationIdentifier: "oa-1",
          sourceConversationId: "user-1",
        }),
      }),
    )
  })
})
