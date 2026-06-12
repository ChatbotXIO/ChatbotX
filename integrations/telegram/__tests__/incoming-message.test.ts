import { describe, expect, test } from "vitest"
import { receiveMessage } from "../src/handlers/message/incoming-message"

const ctx = {
  auth: {
    secretText: "telegram-token",
  },
} as never

describe("receiveMessage", () => {
  test("stores locale from message sender language_code", async () => {
    const result = await receiveMessage({
      ctx,
      data: {
        integrationType: "telegram",
        integrationIdentifier: "bot-1",
        payload: {
          update_id: 1,
          message: {
            message_id: 10,
            from: {
              id: 100,
              is_bot: false,
              first_name: "Ada",
              last_name: "Lovelace",
              language_code: "vi",
            },
            chat: {
              id: 100,
              type: "private",
            },
            date: 1_765_440_000,
            text: "hello",
          },
        },
      },
    })

    expect(result.contact.locale).toBe("vi")
  })

  test("stores locale from callback query sender language_code", async () => {
    const result = await receiveMessage({
      ctx,
      data: {
        integrationType: "telegram",
        integrationIdentifier: "bot-1",
        payload: {
          update_id: 1,
          callback_query: {
            id: "callback-1",
            from: {
              id: 100,
              is_bot: false,
              first_name: "Ada",
              language_code: "vi",
            },
            data: "button-1",
          },
        },
      },
    })

    expect(result.contact.locale).toBe("vi")
  })

  test("leaves locale undefined when message sender is absent", async () => {
    const result = await receiveMessage({
      ctx,
      data: {
        integrationType: "telegram",
        integrationIdentifier: "bot-1",
        payload: {
          update_id: 1,
          message: {
            message_id: 10,
            chat: {
              id: 100,
              type: "private",
            },
            date: 1_765_440_000,
            text: "hello",
          },
        },
      },
    })

    expect(result.contact.locale).toBeUndefined()
  })
})
