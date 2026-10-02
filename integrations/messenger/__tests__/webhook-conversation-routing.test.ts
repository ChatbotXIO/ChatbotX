import { createHmac } from "node:crypto"
import type { HandleRequestProps } from "@chatbotx.io/sdk"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { receiveMessage } from "../src/handlers/message/incoming-message"
import { webhookHandler } from "../src/handlers/webhook"
import { BUSINESS_AI_APP_ID_ENV } from "../src/lib/thread-control-config"
import type { MessengerConfig } from "../src/schema"

const HANDOVER_JOB_ID_RE = /^fb-tc-page-1-[0-9a-f]{64}$/
const STANDBY_HASH_JOB_ID_RE = /^fb-sb-page-1-[0-9a-f]{64}$/
const CLIENT_SECRET = "test-client-secret"
const config = {
  clientSecret: CLIENT_SECRET,
  verifyToken: "verify-token",
} as unknown as MessengerConfig

const sign = (body: string): string =>
  `sha256=${createHmac("sha256", CLIENT_SECRET).update(body).digest("hex")}`

const post = async (
  body: string,
  queue: { add: ReturnType<typeof vi.fn> },
): Promise<string> =>
  await webhookHandler({
    config,
    req: new Request("https://example.com/webhook", {
      method: "POST",
      headers: { "x-hub-signature-256": sign(body) },
      body,
    }),
    queue: queue as never,
  } as HandleRequestProps<MessengerConfig>)

const entryBody = (entry: Record<string, unknown>): string =>
  JSON.stringify({
    object: "page",
    entry: [{ id: "page-1", time: 1_700_000_000_000, ...entry }],
  })

const passItem = {
  sender: { id: "psid-1" },
  recipient: { id: "page-1" },
  timestamp: 1_755_694_800_750,
  pass_thread_control: { new_owner_app_id: "111" },
}

type AddCall = [
  string,
  { type: string; data: Record<string, unknown> },
  { jobId: string; attempts: number; removeOnFail: boolean },
]

describe("webhookHandler conversation routing", () => {
  let queue: { add: ReturnType<typeof vi.fn> }

  beforeEach(() => {
    queue = { add: vi.fn().mockResolvedValue(undefined) }
  })

  const calls = (): AddCall[] => queue.add.mock.calls as AddCall[]

  it("enqueues a handover job with WhatsApp job options and a deterministic id", async () => {
    const body = entryBody({ messaging: [passItem] })
    await post(body, queue)
    await post(body, queue)

    const [first, second] = calls()
    expect(first?.[0]).toBe("threadControlEvent")
    expect(first?.[1].data).toMatchObject({
      integrationType: "messenger",
      integrationIdentifier: "page-1",
      payload: { kind: "handover", body: passItem },
    })
    expect(first?.[2]).toMatchObject({
      attempts: 5,
      backoff: { type: "exponential", delay: 10_000 },
      removeOnFail: true,
    })
    expect(first?.[2].jobId).toMatch(HANDOVER_JOB_ID_RE)
    expect(second?.[2].jobId).toBe(first?.[2].jobId)
  })

  it("enqueues app_roles and request items as their own kinds", async () => {
    await post(
      entryBody({
        messaging: [
          {
            recipient: { id: "page-1" },
            timestamp: 1,
            app_roles: { "111": ["primary_receiver"] },
          },
          {
            sender: { id: "psid-1" },
            timestamp: 1,
            request_thread_control: { requested_owner_app_id: "333" },
          },
        ],
      }),
      queue,
    )
    const kinds = calls().map(
      (call) => (call[1].data.payload as { kind: string }).kind,
    )
    expect(kinds).toEqual(["appRoles", "handoverRequest"])
    expect(calls().every((call) => call[0] === "threadControlEvent")).toBe(true)
  })

  it("enqueues a standby message keyed by mid, distinct from the owner path", async () => {
    await post(
      entryBody({
        standby: [
          {
            sender: { id: "psid-1" },
            recipient: { id: "page-1" },
            timestamp: 1_755_694_800_750,
            message: { mid: "m.abc", text: "hi" },
          },
        ],
      }),
      queue,
    )
    expect(calls()).toHaveLength(1)
    expect(calls()[0]?.[2].jobId).toBe("fb-sb-page-1-m.abc")
    expect(calls()[0]?.[1].data.payload).toMatchObject({
      kind: "standbyMessage",
    })
  })

  it("tolerates a standby postback with its payload stripped and drops receipts", async () => {
    await post(
      entryBody({
        standby: [
          {
            sender: { id: "psid-1" },
            recipient: { id: "page-1" },
            timestamp: 1,
            postback: {},
          },
          {
            sender: { id: "psid-1" },
            recipient: { id: "page-1" },
            timestamp: 1,
            read: { watermark: 1 },
          },
        ],
      }),
      queue,
    )
    expect(calls()).toHaveLength(1)
    expect(calls()[0]?.[2].jobId).toMatch(STANDBY_HASH_JOB_ID_RE)
  })

  it("keeps the good items of a batch when one item is malformed", async () => {
    await expect(
      post(
        entryBody({
          messaging: [
            { sender: "broken", timestamp: "x", message: 42 },
            passItem,
            { pass_thread_control: {} },
          ],
          standby: [{ nonsense: true, message: {} }],
        }),
        queue,
      ),
    ).resolves.toBe("ok")

    const kinds = calls().map(
      (call) => (call[1].data.payload as { kind: string } | undefined)?.kind,
    )
    expect(kinds).toEqual(["handover", "handover"])
  })

  it("still processes a good entry when a sibling entry is malformed", async () => {
    const body = JSON.stringify({
      object: "page",
      entry: [{ id: 123 }, { id: "page-1", time: 1, messaging: [passItem] }],
    })
    await expect(post(body, queue)).resolves.toBe("ok")
    expect(calls()).toHaveLength(1)
  })

  describe("the Business-AI hand-back notice (admin_text)", () => {
    const notice = {
      sender: { id: "psid-1" },
      recipient: { id: "page-1" },
      timestamp: 1_790_920_217_103,
      message: { admin_text: "Tác nhân AI đã chuyển đoạn chat này cho bạn." },
    }

    it("is enqueued once as a handover, never as an ordinary message", async () => {
      await post(entryBody({ messaging: [notice] }), queue)

      expect(calls().map((call) => call[0])).toEqual(["threadControlEvent"])
      expect(calls()[0]?.[1].data).toMatchObject({
        integrationType: "messenger",
        integrationIdentifier: "page-1",
        payload: { kind: "handover", body: notice },
      })
      expect(calls()[0]?.[2].jobId).toMatch(HANDOVER_JOB_ID_RE)
    })

    it("a redelivery collapses onto the same job id", async () => {
      const body = entryBody({ messaging: [notice] })
      await post(body, queue)
      await post(body, queue)

      const [first, second] = calls()
      expect(first?.[2].jobId).toBe(second?.[2].jobId)
    })

    it("its standby copy stores nothing and enqueues nothing", async () => {
      await post(entryBody({ standby: [notice] }), queue)

      expect(queue.add).not.toHaveBeenCalled()
    })
  })

  it("does not route an ordinary message as a routing item", async () => {
    await post(
      entryBody({
        messaging: [
          {
            sender: { id: "psid-1" },
            recipient: { id: "page-1" },
            timestamp: 1,
            message: { mid: "m.1", text: "hello" },
          },
        ],
      }),
      queue,
    )
    expect(calls().map((call) => call[0])).toEqual(["incomingMessage"])
  })
  describe("hop_context through the standby rewrap", () => {
    const standbyItem = {
      sender: { id: "psid-1" },
      recipient: { id: "page-1" },
      timestamp: 1_755_694_800_750,
      message: { mid: "m.hop", text: "hi" },
    }

    /** Posts the webhook, then feeds the enqueued job body to receiveMessage. */
    const receiveEnqueuedStandby = async (entry: Record<string, unknown>) => {
      await post(entryBody({ standby: [standbyItem], ...entry }), queue)
      const payload = (
        calls()[0]?.[1].data.payload as { body: unknown } | undefined
      )?.body
      return {
        payload,
        result: await receiveMessage({
          ctx: { auth: { metadata: { pageId: "page-1" } } } as never,
          data: {
            integrationType: "messenger",
            integrationIdentifier: "inbox-1",
            payload,
          },
        }),
      }
    }

    afterEach(() => {
      vi.unstubAllEnvs()
    })

    it("records the Business-AI app as owner end to end", async () => {
      vi.stubEnv(BUSINESS_AI_APP_ID_ENV, "app-bot")

      const { payload, result } = await receiveEnqueuedStandby({
        hop_context: { is_ai_thread_owner: true },
      })

      expect(payload).toMatchObject({
        entry: [{ hop_context: { is_ai_thread_owner: true } }],
      })
      expect(result.threadControl).toMatchObject({
        delivery: "standby",
        ownerAppId: "app-bot",
      })
    })

    it("leaves the owner unstated when hop_context is absent", async () => {
      vi.stubEnv(BUSINESS_AI_APP_ID_ENV, "app-bot")

      const { payload, result } = await receiveEnqueuedStandby({})

      expect(payload).not.toHaveProperty("entry.0.hop_context")
      expect(result.threadControl).toMatchObject({ delivery: "standby" })
      expect(result.threadControl).not.toHaveProperty("ownerAppId")
    })
  })
})
