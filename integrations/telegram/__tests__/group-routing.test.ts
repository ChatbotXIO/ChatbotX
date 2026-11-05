import { describe, expect, test, vi } from "vitest"
import { webhookHandler } from "../src/handlers/webhook"

const user = { id: 100, is_bot: false, first_name: "Ada", username: "ada" }

const SECRET = "s3cret-token"

const run = async (
  update: Record<string, unknown>,
  options: { secret?: string | null; configured?: boolean } = {},
) => {
  const queue = { add: vi.fn().mockResolvedValue(undefined) }
  const presented = options.secret === undefined ? SECRET : options.secret
  await webhookHandler({
    config: {
      botId: "bot-1",
      ...(options.configured === false ? {} : { webhookSecretToken: SECRET }),
    },
    req: new Request("https://example.test/telegram", {
      method: "POST",
      body: JSON.stringify({ update_id: 1, ...update }),
      headers: presented
        ? { "X-Telegram-Bot-Api-Secret-Token": presented }
        : {},
    }),
    queue,
  } as never)
  return queue.add
}

const message = (chat: Record<string, unknown>, extra = {}) => ({
  message: {
    message_id: 55,
    from: user,
    chat,
    date: 1_760_000_000,
    text: "hello group",
    ...extra,
  },
})

describe("telegram webhook group routing", () => {
  test("a group message goes to the audience job, never to incomingMessage", async () => {
    const add = await run(
      message({ id: -1001, type: "supergroup", title: "Fans" }),
    )
    expect(add).toHaveBeenCalledTimes(1)
    expect(add).toHaveBeenCalledWith("channelAudienceEvent", {
      type: "channelAudienceEvent",
      data: {
        integrationType: "telegram",
        integrationIdentifier: "bot-1",
        event: {
          kind: "groupMessage",
          user: { sourceId: "100", firstName: "Ada", username: "ada" },
          chatId: "-1001",
          messageId: "55",
          textLength: "hello group".length,
          occurredAt: new Date(1_760_000_000_000).toISOString(),
        },
      },
    })
  })

  test("a group message without a scorable sender is dropped", async () => {
    const add = await run(
      message(
        { id: -1001, type: "group" },
        { from: { ...user, is_bot: true } },
      ),
    )
    expect(add).not.toHaveBeenCalled()
  })

  test("a private message still goes to incomingMessage", async () => {
    const add = await run(message({ id: 100, type: "private" }))
    expect(add.mock.calls[0]?.[0]).toBe("incomingMessage")
    expect(add.mock.calls[0]?.[1]).toMatchObject({
      type: "incomingMessage",
    })
  })

  test("chat_member join/leave become groupJoin/groupLeave", async () => {
    const memberUpdate = (oldStatus: string, newStatus: string) => ({
      chat_member: {
        chat: { id: -1001, type: "channel", title: "News" },
        from: user,
        date: 1_760_000_000,
        old_chat_member: { user, status: oldStatus },
        new_chat_member: { user, status: newStatus },
      },
    })
    const joined = await run(memberUpdate("left", "member"))
    expect(joined).toHaveBeenCalledWith(
      "channelAudienceEvent",
      expect.objectContaining({
        data: expect.objectContaining({
          event: expect.objectContaining({
            kind: "groupJoin",
            chatId: "-1001",
          }),
        }),
      }),
    )
    const left = await run(memberUpdate("member", "kicked"))
    expect(left).toHaveBeenCalledWith(
      "channelAudienceEvent",
      expect.objectContaining({
        data: expect.objectContaining({
          event: expect.objectContaining({ kind: "groupLeave" }),
        }),
      }),
    )
    const promoted = await run(memberUpdate("member", "administrator"))
    expect(promoted).not.toHaveBeenCalled()
  })

  test("my_chat_member records the bot's status in the chat", async () => {
    const add = await run({
      my_chat_member: {
        chat: { id: -1001, type: "supergroup", title: "Fans" },
        from: user,
        date: 1_760_000_000,
        old_chat_member: { user: { ...user, is_bot: true }, status: "member" },
        new_chat_member: {
          user: { ...user, is_bot: true },
          status: "administrator",
        },
      },
    })
    expect(add).toHaveBeenCalledWith("channelAudienceEvent", {
      type: "channelAudienceEvent",
      data: expect.objectContaining({
        event: {
          kind: "botChatStatus",
          chat: { id: "-1001", type: "supergroup", title: "Fans" },
          status: "administrator",
          occurredAt: new Date(1_760_000_000_000).toISOString(),
        },
      }),
    })
  })
})

describe("telegram webhook secret token", () => {
  const groupMessage = message({ id: -1001, type: "supergroup" })

  test("rejects an update with a wrong secret when the bot has one", async () => {
    await expect(run(groupMessage, { secret: "forged" })).rejects.toThrow(
      "Invalid webhook secret token",
    )
    await expect(run(groupMessage, { secret: null })).rejects.toThrow(
      "Invalid webhook secret token",
    )
  })

  test("a legacy bot without a stored secret keeps DMs but never scores group activity", async () => {
    const groupAdd = await run(groupMessage, {
      configured: false,
      secret: null,
    })
    expect(groupAdd).not.toHaveBeenCalled()

    const dmAdd = await run(message({ id: 100, type: "private" }), {
      configured: false,
      secret: null,
    })
    expect(dmAdd.mock.calls[0]?.[0]).toBe("incomingMessage")
    expect(dmAdd.mock.calls[0]?.[1]).toMatchObject({
      type: "incomingMessage",
    })
  })
})
