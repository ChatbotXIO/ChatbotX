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

describe("webhookHandler inbox_labels enqueue", () => {
  let queue: { add: ReturnType<typeof vi.fn> }

  beforeEach(() => {
    queue = { add: vi.fn().mockResolvedValue(undefined) }
  })

  it("enqueues channelLabelChange when an inbox_labels change is present", async () => {
    const body = buildBody({
      pageId: "page-42",
      changes: [
        {
          field: "inbox_labels",
          value: {
            user: { id: "psid-1" },
            action: "add_label",
            label: { id: "label-1" },
          },
        },
      ],
    })

    const result = await webhookHandler(makeProps(body, sign(body), queue))

    expect(result).toBe("ok")
    expect(queue.add).toHaveBeenCalledTimes(1)
    expect(queue.add).toHaveBeenCalledWith("channelLabelChange", {
      type: "channelLabelChange",
      data: {
        integrationType: "messenger",
        integrationIdentifier: "page-42",
        payload: JSON.parse(body),
      },
    })
  })

  it("enqueues for create_label/delete_label/remove_label actions too", async () => {
    for (const action of ["create_label", "delete_label", "remove_label"]) {
      queue.add.mockClear()
      const body = buildBody({
        changes: [
          {
            field: "inbox_labels",
            value: {
              action,
              label: { id: "label-1", page_label_name: "VIP" },
            },
          },
        ],
      })

      await webhookHandler(makeProps(body, sign(body), queue))

      expect(queue.add).toHaveBeenCalledExactlyOnceWith(
        "channelLabelChange",
        expect.objectContaining({ type: "channelLabelChange" }),
      )
    }
  })

  it("does not enqueue channelLabelChange for plain messaging events", async () => {
    const body = buildBody({
      messaging: [
        {
          sender: { id: "psid-1" },
          recipient: { id: "page-1" },
          timestamp: 1_700_000_000,
          message: { mid: "m-1", text: "hi" },
        },
      ],
    })

    await webhookHandler(makeProps(body, sign(body), queue))

    const labelCalls = queue.add.mock.calls.filter(
      ([name]) => name === "channelLabelChange",
    )
    expect(labelCalls).toHaveLength(0)
  })

  it("rejects an invalid signature without enqueuing", async () => {
    const body = buildBody({
      changes: [
        {
          field: "inbox_labels",
          value: { action: "add_label", label: { id: "label-1" } },
        },
      ],
    })

    await expect(
      webhookHandler(makeProps(body, "sha256=deadbeef", queue)),
    ).rejects.toThrow()

    expect(queue.add).not.toHaveBeenCalled()
  })
})

describe("webhookHandler leadgen enqueue", () => {
  let queue: { add: ReturnType<typeof vi.fn> }

  beforeEach(() => {
    queue = { add: vi.fn().mockResolvedValue(undefined) }
  })

  it("enqueues processLeadgen with the form and adgroup ids from the webhook", async () => {
    const body = buildBody({
      pageId: "page-42",
      changes: [
        {
          field: "leadgen",
          value: {
            leadgen_id: "lead-1",
            page_id: "page-42",
            form_id: "form-1",
            adgroup_id: "adgroup-1",
            ad_id: "ad-1",
            created_time: 1_440_120_384,
          },
        },
      ],
    })

    await webhookHandler(makeProps(body, sign(body), queue))

    expect(queue.add).toHaveBeenCalledExactlyOnceWith("processLeadgen", {
      type: "processLeadgen",
      data: {
        integrationType: "messenger",
        integrationIdentifier: "page-42",
        leadgenId: "lead-1",
        formId: "form-1",
        adgroupId: "adgroup-1",
      },
    })
  })

  it("falls back to the ad id when the webhook carries no adgroup id", async () => {
    const body = buildBody({
      changes: [
        {
          field: "leadgen",
          value: {
            leadgen_id: "lead-3",
            page_id: "page-1",
            form_id: "form-3",
            ad_id: "ad-9",
          },
        },
      ],
    })

    await webhookHandler(makeProps(body, sign(body), queue))

    const [, job] = queue.add.mock.calls[0] as [
      string,
      { data: Record<string, unknown> },
    ]
    expect(job.data.adgroupId).toBe("ad-9")
  })

  it("omits the adgroup id when the webhook does not carry one", async () => {
    const body = buildBody({
      changes: [
        {
          field: "leadgen",
          value: { leadgen_id: "lead-2", page_id: "page-1", form_id: "form-2" },
        },
      ],
    })

    await webhookHandler(makeProps(body, sign(body), queue))

    const [, job] = queue.add.mock.calls[0] as [
      string,
      { data: Record<string, unknown> },
    ]
    expect(job.data.adgroupId).toBeUndefined()
  })
})
