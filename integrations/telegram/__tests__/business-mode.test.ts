import { afterEach, describe, expect, test, vi } from "vitest"
import { receiveMessage } from "../src/handlers/message/incoming-message"
import { webhookHandler } from "../src/handlers/webhook"
import { chatTarget } from "../src/lib/chat-target"

vi.mock("../src/apis/bot", () => ({ getTelegramFileUrl: vi.fn() }))

const SECRET = "s3cret-token"
const customer = { id: 100, is_bot: false, first_name: "Ada" }
const owner = { id: 200, is_bot: false, first_name: "Natalia" }

const businessMessage = (from: typeof customer) => ({
  update_id: 1,
  business_message: {
    message_id: 55,
    business_connection_id: "bc-1",
    from,
    chat: { id: 100, type: "private", first_name: "Ada" },
    date: 1_760_000_000,
    text: "hello",
  },
})

const route = async (update: Record<string, unknown>) => {
  const queue = { add: vi.fn().mockResolvedValue(undefined) }
  await webhookHandler({
    config: { botId: "bot-1", webhookSecretToken: SECRET },
    req: new Request("https://example.test/telegram", {
      method: "POST",
      body: JSON.stringify(update),
      headers: { "X-Telegram-Bot-Api-Secret-Token": SECRET },
    }),
    queue,
  } as never)
  return queue.add.mock.calls.map(([jobType]) => jobType)
}

const receive = (update: Record<string, unknown>) =>
  receiveMessage({
    ctx: { auth: { secretText: "tok" } } as never,
    data: {
      integrationType: "telegram",
      integrationIdentifier: "bot-1",
      payload: update,
    },
  })

describe("telegram business mode", () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  test("a customer's message is an incoming message", async () => {
    expect(await route(businessMessage(customer))).toEqual(["incomingMessage"])
  })

  test("the owner's own message is an echo the bot does not answer", async () => {
    expect(await route(businessMessage(owner))).toEqual(["incomingMessageEcho"])
  })

  test("keeps the business connection on the customer's conversation", async () => {
    const result = await receive(businessMessage(customer))

    expect(result.message?.messageType).toBe("incoming")
    expect(result.contact).toMatchObject({
      sourceId: "100",
      firstName: "Ada",
      channelConversationId: "bc-1",
    })
  })

  test("stores the owner's message as their reply in the customer's chat", async () => {
    const result = await receive(businessMessage(owner))

    expect(result.message?.messageType).toBe("outgoing")
    expect(result.echoOrigin).toBe("firstParty")
    expect(result.contact).toEqual({
      sourceId: "100",
      firstName: "Ada",
      lastName: undefined,
      channelConversationId: "bc-1",
    })
  })

  test("a reply goes out through the business connection when there is one", () => {
    expect(
      chatTarget({ sourceId: "100", sourceConversationId: "bc-1" }),
    ).toEqual({ chat_id: "100", business_connection_id: "bc-1" })
    expect(chatTarget({ sourceId: "100", sourceConversationId: null })).toEqual(
      { chat_id: "100" },
    )
  })
})
