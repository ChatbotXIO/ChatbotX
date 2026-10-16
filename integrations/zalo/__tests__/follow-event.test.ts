import { createHash } from "node:crypto"
import { describe, expect, test, vi } from "vitest"
import { parseZaloFollowEvent, webhookHandler } from "../src/handlers/webhook"
import { zaloWebhookEventSchema } from "../src/schema/webhook"

const followPayload = (eventName: "follow" | "unfollow", extra = {}) => ({
  app_id: "app-1",
  oa_id: "oa-1",
  user_id_by_app: "app-user-9",
  event_name: eventName,
  timestamp: "1760000000000",
  follower: { id: "user-9" },
  ...extra,
})

describe("parseZaloFollowEvent", () => {
  test("maps a follow (QR source kept) to a follow audience job", () => {
    const parsed = parseZaloFollowEvent(
      zaloWebhookEventSchema.parse(followPayload("follow", { source: "qr" })),
    )
    expect(parsed).toEqual({
      integrationType: "zalo",
      integrationIdentifier: "oa-1",
      event: {
        kind: "follow",
        user: { sourceId: "user-9" },
        occurredAt: new Date(1_760_000_000_000).toISOString(),
        source: "qr",
      },
    })
  })

  test("maps an unfollow to an unfollow audience job", () => {
    const parsed = parseZaloFollowEvent(
      zaloWebhookEventSchema.parse(followPayload("unfollow")),
    )
    expect(parsed?.event.kind).toBe("unfollow")
  })

  test("returns null for message events and follow events missing the follower", () => {
    expect(
      parseZaloFollowEvent(
        zaloWebhookEventSchema.parse({
          app_id: "app-1",
          event_name: "user_send_text",
          sender: { id: "u" },
          recipient: { id: "oa-1" },
        }),
      ),
    ).toBeNull()
    expect(
      parseZaloFollowEvent(
        zaloWebhookEventSchema.parse({
          ...followPayload("follow"),
          follower: undefined,
        }),
      ),
    ).toBeNull()
  })
})

describe("zalo webhookHandler follow events", () => {
  const SECRET = "oa-secret"
  const sign = (raw: string, payload: { app_id: string; timestamp: string }) =>
    `mac=${createHash("sha256")
      .update(`${payload.app_id}${raw}${payload.timestamp}${SECRET}`)
      .digest("hex")}`

  const run = async (
    body: { app_id: string; timestamp: string },
    signature: "valid" | "missing" | "wrong" = "valid",
  ) => {
    const queue = { add: vi.fn().mockResolvedValue(undefined) }
    const raw = JSON.stringify(body)
    const headers: Record<string, string> = {}
    if (signature === "valid") {
      headers["X-ZEvent-Signature"] = sign(raw, body)
    } else if (signature === "wrong") {
      headers["X-ZEvent-Signature"] = "mac=deadbeef"
    }
    const result = await webhookHandler({
      config: { clientId: "app-1", verifyToken: SECRET },
      req: new Request("https://example.test/zalo", {
        method: "POST",
        body: raw,
        headers,
      }),
      queue,
    } as never)
    return { result, queue }
  }

  test.each([
    "missing",
    "wrong",
  ] as const)("drops a follow with a %s signature (forged follows must not score)", async (signature) => {
    const { result, queue } = await run(followPayload("follow"), signature)
    expect(result).toBe("ok")
    expect(queue.add).not.toHaveBeenCalled()
  })

  test("queues a channelAudienceEvent instead of throwing Missing sender", async () => {
    const { result, queue } = await run(followPayload("follow"))
    expect(result).toBe("ok")
    expect(queue.add).toHaveBeenCalledWith("channelAudienceEvent", {
      type: "channelAudienceEvent",
      data: expect.objectContaining({
        integrationIdentifier: "oa-1",
        event: expect.objectContaining({ kind: "follow" }),
      }),
    })
  })

  test("acks a malformed follow without queuing", async () => {
    const { result, queue } = await run({
      ...followPayload("unfollow"),
      follower: undefined,
    })
    expect(result).toBe("ok")
    expect(queue.add).not.toHaveBeenCalled()
  })
})
