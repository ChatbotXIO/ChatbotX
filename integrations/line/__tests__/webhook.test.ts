import { createHmac } from "node:crypto"
import {
  CHANNEL_AUDIENCE_EVENT_JOB_NAME,
  type ContextQueue,
  type HandleRequestProps,
} from "@chatbotx.io/sdk"
import { describe, expect, test, vi } from "vitest"
import { verifyLineSignature, webhookHandler } from "../src/handlers/webhook"
import type { LineConfig } from "../src/schema"

const SECRET = "secret-1"
const BOT = "Ubot"
const CHANNEL = "123"
const config = {
  channelId: CHANNEL,
  channelSecret: SECRET,
  botUserId: BOT,
} as unknown as LineConfig

const sign = (body: string, secret = SECRET) =>
  createHmac("sha256", secret).update(body).digest("base64")

const build = (body: unknown, opts: { signature?: string | null } = {}) => {
  const raw = typeof body === "string" ? body : JSON.stringify(body)
  const add = vi.fn()
  const headers = new Headers()
  const signature = opts.signature === undefined ? sign(raw) : opts.signature
  if (signature) {
    headers.set("X-Line-Signature", signature)
  }
  const props = {
    config,
    req: new Request("https://example.com/webhook", {
      method: "POST",
      body: raw,
      headers,
    }),
    queue: { add } as unknown as ContextQueue,
  } as unknown as HandleRequestProps<LineConfig>
  return { props, add }
}

const user = { type: "user", userId: "U1" }
const evt = (type: string, source: object = user, extra = {}) => ({
  type,
  timestamp: 1_700_000_000_000,
  source,
  replyToken: "r",
  ...extra,
})

describe("verifyLineSignature", () => {
  const body = '{"destination":"U","events":[]}'
  test("accepts a valid signature", async () => {
    expect(await verifyLineSignature(body, sign(body), SECRET)).toBe(true)
  })
  test("rejects a tampered body", async () => {
    expect(await verifyLineSignature(`${body} `, sign(body), SECRET)).toBe(
      false,
    )
  })
  test("rejects whitespace-changed (re-serialized) body", async () => {
    const pretty = JSON.stringify(JSON.parse(body), null, 2)
    expect(await verifyLineSignature(pretty, sign(body), SECRET)).toBe(false)
  })
  test("rejects a null header", async () => {
    expect(await verifyLineSignature(body, null, SECRET)).toBe(false)
  })
})

describe("webhookHandler", () => {
  test("throws on a bad signature", async () => {
    const { props, add } = build(
      { destination: BOT, events: [] },
      { signature: "bad" },
    )
    await expect(webhookHandler(props)).rejects.toMatchObject({
      httpStatusCode: 401,
    })
    expect(add).not.toHaveBeenCalled()
  })

  test("throws when destination is not the bot", async () => {
    const { props } = build({ destination: "Uother", events: [] })
    await expect(webhookHandler(props)).rejects.toMatchObject({
      httpStatusCode: 400,
    })
  })

  test("a signed body that is not JSON is a 400", async () => {
    const { props, add } = build("{not json")
    await expect(webhookHandler(props)).rejects.toMatchObject({
      httpStatusCode: 400,
      message: "Webhook body is not JSON",
    })
    expect(add).not.toHaveBeenCalled()
  })

  test("a signed body outside the LINE schema is a 400", async () => {
    const { props } = build({ events: "nope" })
    await expect(webhookHandler(props)).rejects.toMatchObject({
      httpStatusCode: 400,
    })
  })

  test("a queue failure is not turned into a client error", async () => {
    const { props, add } = build({
      destination: BOT,
      events: [
        evt("message", user, {
          message: { id: "m", type: "text", text: "hi" },
        }),
      ],
    })
    add.mockRejectedValue(new Error("redis down"))
    await expect(webhookHandler(props)).rejects.toThrow("redis down")
  })

  test("routes a mixed batch: 1 incomingMessage + 2 audience jobs", async () => {
    const { props, add } = build({
      destination: BOT,
      events: [
        evt("message", user, {
          message: { id: "1", type: "text", text: "hi" },
        }),
        evt(
          "message",
          { type: "group", groupId: "G", userId: "U1" },
          {
            message: { id: "2", type: "text", text: "yo" },
          },
        ),
        evt("follow"),
        evt("unfollow"),
        evt("join", { type: "group", groupId: "G" }),
      ],
    })
    expect(await webhookHandler(props)).toBe("OK")
    const names = add.mock.calls.map((c) => c[0])
    expect(names.filter((n) => n === "incomingMessage")).toHaveLength(1)
    expect(
      names.filter((n) => n === CHANNEL_AUDIENCE_EVENT_JOB_NAME),
    ).toHaveLength(2)
    expect(add).toHaveBeenCalledTimes(3)
    const incoming = add.mock.calls.find((c) => c[0] === "incomingMessage")?.[1]
    expect(incoming.data).toMatchObject({
      integrationType: "line",
      integrationIdentifier: CHANNEL,
    })
    const kinds = add.mock.calls
      .filter((c) => c[0] === CHANNEL_AUDIENCE_EVENT_JOB_NAME)
      .map((c) => c[1].data.event.kind)
    expect(kinds).toEqual(["follow", "unfollow"])
  })

  test("enqueues a user postback as incomingMessage", async () => {
    const { props, add } = build({
      destination: BOT,
      events: [evt("postback", user, { postback: { data: "a=1" } })],
    })
    await webhookHandler(props)
    expect(add).toHaveBeenCalledTimes(1)
    expect(add.mock.calls[0]?.[0]).toBe("incomingMessage")
  })

  test("acks an empty events array without jobs", async () => {
    const { props, add } = build({ destination: BOT, events: [] })
    expect(await webhookHandler(props)).toBe("OK")
    expect(add).not.toHaveBeenCalled()
  })
})
