import { createHmac } from "node:crypto"
import type { HandleRequestProps } from "@chatbotx.io/sdk"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { webhookHandler } from "../src/handlers/webhook"
import type { MessengerConfig } from "../src/schema"

const CLIENT_SECRET = "test-client-secret"

const config = {
  clientSecret: CLIENT_SECRET,
  verifyToken: "verify-token",
} as unknown as MessengerConfig

function sign(body: string): string {
  return `sha256=${createHmac("sha256", CLIENT_SECRET).update(body).digest("hex")}`
}

function buildBody(props: {
  pageId?: string
  changes?: unknown[]
  messaging?: unknown[]
}): string {
  const entry: Record<string, unknown> = {
    id: props.pageId ?? "page-1",
    time: 1_700_000_000,
  }
  if (props.changes) {
    entry.changes = props.changes
  }
  if (props.messaging) {
    entry.messaging = props.messaging
  }
  return JSON.stringify({ object: "page", entry: [entry] })
}

function makeRequest(body: string, signature: string): Request {
  return new Request("https://example.com/webhook", {
    method: "POST",
    headers: { "x-hub-signature-256": signature },
    body,
  })
}

function makeProps(
  body: string,
  signature: string,
  queue: { add: ReturnType<typeof vi.fn> },
): HandleRequestProps<MessengerConfig> {
  return {
    config,
    req: makeRequest(body, signature),
    queue: queue as never,
  } as HandleRequestProps<MessengerConfig>
}

describe("webhookHandler live_videos enqueue", () => {
  let queue: { add: ReturnType<typeof vi.fn> }

  beforeEach(() => {
    queue = { add: vi.fn().mockResolvedValue(undefined) }
  })

  it("enqueues one job per live video and status, so a redelivery adds nothing", async () => {
    const body = buildBody({
      pageId: "page-42",
      changes: [
        {
          field: "live_videos",
          value: { id: "123456", status: "live_stopped" },
        },
      ],
    })

    const result = await webhookHandler(makeProps(body, sign(body), queue))

    expect(result).toBe("ok")
    expect(queue.add).toHaveBeenCalledTimes(1)
    expect(queue.add).toHaveBeenCalledWith(
      "liveVideoStatusChange",
      {
        type: "liveVideoStatusChange",
        data: {
          integrationType: "messenger",
          integrationIdentifier: "page-42",
          liveVideoId: "123456",
          status: "live_stopped",
        },
      },
      { jobId: "live-video-123456-live_stopped" },
    )
  })

  it.each([
    { id: 123, status: "live" },
    { id: "abc", status: "live" },
    { id: "123", status: "live status!" },
    { id: "123" },
    "nonsense",
  ])("drops an unrecognised live_videos value %j without failing the webhook", async (value) => {
    const body = buildBody({ changes: [{ field: "live_videos", value }] })

    const result = await webhookHandler(makeProps(body, sign(body), queue))

    expect(result).toBe("ok")
    expect(queue.add).not.toHaveBeenCalled()
  })

  it("handles every change kind of one batched entry, not only the first", async () => {
    const body = buildBody({
      pageId: "page-42",
      changes: [
        {
          field: "feed",
          value: {
            item: "comment",
            verb: "remove",
            comment_id: "c1",
            post_id: "p1",
            from: { id: "u1", name: "U" },
            created_time: 1_700_000_000,
          },
        },
        {
          field: "live_videos",
          value: { id: "123456", status: "live" },
        },
        {
          field: "leadgen",
          value: {
            leadgen_id: "l1",
            form_id: "f1",
            page_id: "page-42",
            ad_id: "a1",
          },
        },
      ],
    })

    const result = await webhookHandler(makeProps(body, sign(body), queue))

    expect(result).toBe("ok")
    const names = queue.add.mock.calls.map((call) => call[0])
    expect(names).toEqual([
      "deleteIncomingComment",
      "liveVideoStatusChange",
      "processLeadgen",
    ])
  })
})
