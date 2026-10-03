import {
  type BulkThreadControlResult,
  ChannelError,
  ChannelErrorCategory,
} from "@chatbotx.io/sdk"
import { HttpResponse, http, server } from "@chatbotx.io/vitest-config/msw"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { DEFAULT_API_VERSION } from "../src/constants"
import { conversationHandlers } from "../src/handlers/conversation"
import { BUSINESS_AI_APP_ID_ENV } from "../src/lib/thread-control-config"

const ROOT = "https://graph.facebook.com/"
const OWN_APP = "app-own"
const BOT_APP = "app-bot"
const NOW = new Date("2026-10-02T12:00:00Z")
const RECENT = new Date(NOW.getTime() - 60 * 60 * 1000)
const EIGHT_DAYS_AGO = new Date(NOW.getTime() - 8 * 24 * 60 * 60 * 1000)

const ctx = {
  auth: {
    clientId: OWN_APP,
    tokens: { accessToken: "PAGE_TOKEN" },
    metadata: { pageId: "page-1" },
  },
} as never

type Sub = {
  code: number
  body: unknown
  /** `X-Business-Use-Case-Usage` carried by this sub-response itself. */
  usage?: string
} | null
type SentBatch = {
  auth: string | null
  items: { method: string; relative_url: string; body: URLSearchParams }[]
}

const contact = (id: string, lastIncomingMessageAt: Date | null = RECENT) => ({
  id,
  sourceId: `psid-${id}`,
  lastIncomingMessageAt,
})

const ok = (body: unknown): Sub => ({ code: 200, body })
const fail = (code: number, graphCode: number, subcode?: number): Sub => ({
  code,
  body: { error: { code: graphCode, error_subcode: subcode, message: "boom" } },
})

/** Answers the batch endpoint with `rounds[n]` for the n-th call and records each call. */
/** `X-Business-Use-Case-Usage` of a Page at this share of its quota. */
const usageHeader = (callCount: number, regainMinutes = 0) =>
  JSON.stringify({
    "page-1": [
      {
        type: "messenger",
        call_count: callCount,
        total_cputime: 1,
        total_time: 1,
        estimated_time_to_regain_access: regainMinutes,
      },
    ],
  })

const batchEndpoint = (rounds: Sub[][], usage: (string | null)[] = []) => {
  const sent: SentBatch[] = []
  server.use(
    http.post(ROOT, async ({ request }) => {
      const form = new URLSearchParams(await request.text())
      const items = (
        JSON.parse(form.get("batch") ?? "[]") as {
          method: string
          relative_url: string
          body: string
        }[]
      ).map((item) => ({ ...item, body: new URLSearchParams(item.body) }))
      sent.push({ auth: request.headers.get("authorization"), items })
      const answer = rounds[sent.length - 1] ?? []
      const header = usage[sent.length - 1]
      return HttpResponse.json(
        answer.map((sub) =>
          sub
            ? {
                code: sub.code,
                body: JSON.stringify(sub.body),
                // Graph reports a sub-response's headers as `[{ name, value }]`.
                ...(sub.usage
                  ? {
                      headers: [
                        { name: "X-Business-Use-Case-Usage", value: sub.usage },
                      ],
                    }
                  : {}),
              }
            : null,
        ),
        header
          ? { headers: { "x-business-use-case-usage": header } }
          : undefined,
      )
    }),
  )
  return sent
}

const bulk = async (
  action: "handToAi" | "takeFromAi",
  contacts: ReturnType<typeof contact>[],
  text?: string,
): Promise<BulkThreadControlResult> => {
  const handler = conversationHandlers.bulkUpdateThreadControl
  if (!handler) {
    throw new Error("bulkUpdateThreadControl is not registered")
  }
  return await handler({ ctx, data: { action, contacts, text } } as never)
}

/** Runs the retry backoff (1s, 2s) at once; every other timer (ky's timeout) stays real. */
const skipRetryBackoff = () => {
  const realSetTimeout = globalThis.setTimeout
  vi.spyOn(globalThis, "setTimeout").mockImplementation(((
    fn: () => void,
    ms?: number,
  ) =>
    ms === 1000 || ms === 2000
      ? realSetTimeout(fn, 0)
      : realSetTimeout(fn, ms)) as typeof setTimeout)
}

beforeEach(() => {
  vi.stubEnv(BUSINESS_AI_APP_ID_ENV, BOT_APP)
  vi.useFakeTimers({ toFake: ["Date"], now: NOW })
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
})

describe("handToAi", () => {
  it("sends one batch of pass_thread_control calls under the Page token and reports the Business-AI owner", async () => {
    const sent = batchEndpoint([[ok({ success: true }), ok({ success: true })]])

    const result = await bulk("handToAi", [contact("1"), contact("2")])

    expect(sent).toHaveLength(1)
    expect(sent[0].auth).toBe("Bearer PAGE_TOKEN")
    expect(sent[0].items.map((item) => item.relative_url)).toEqual([
      `${DEFAULT_API_VERSION}/me/pass_thread_control`,
      `${DEFAULT_API_VERSION}/me/pass_thread_control`,
    ])
    expect(JSON.parse(sent[0].items[0].body.get("recipient") ?? "")).toEqual({
      id: "psid-1",
    })
    expect(sent[0].items[0].body.get("target_app_id")).toBe(BOT_APP)
    expect(result.results).toEqual([
      {
        contactInboxId: "1",
        status: "succeeded",
        event: "passed",
        ownerRole: "ai_agent",
        ownerAppId: BOT_APP,
        messageSourceId: null,
      },
      expect.objectContaining({ contactInboxId: "2", status: "succeeded" }),
    ])
  })

  it("reports a refused pass ({ success: false }) and a permission error per contact without throwing", async () => {
    batchEndpoint([[ok({ success: false }), fail(403, 10, 2_018_065)]])

    const { results } = await bulk("handToAi", [contact("1"), contact("2")])

    expect(results.map((r) => r.status)).toEqual(["failed", "failed"])
    expect(
      results.map((r) => (r.status === "failed" ? r.error.category : null)),
    ).toEqual([
      ChannelErrorCategory.PERMISSION_DENIED,
      ChannelErrorCategory.PERMISSION_DENIED,
    ])
  })

  it("repeats a timed-out (null) or 5xx pass, in order, until it settles: a pass is idempotent", async () => {
    skipRetryBackoff()
    const sent = batchEndpoint([
      [null, ok({ success: true }), fail(503, 2)],
      [ok({ success: true }), null],
      [ok({ success: true })],
    ])

    const { results, retryAfterMs } = await bulk("handToAi", [
      contact("1"),
      contact("2"),
      contact("3"),
    ])

    expect(sent.map((batch) => batch.items.length)).toEqual([3, 2, 1])
    expect(results.map((r) => [r.contactInboxId, r.status])).toEqual([
      ["1", "succeeded"],
      ["2", "succeeded"],
      ["3", "succeeded"],
    ])
    expect(retryAfterMs).toBeNull()
  })

  it("gives up after 3 rounds and reports the pass failed with the last error", async () => {
    skipRetryBackoff()
    const sent = batchEndpoint([[fail(503, 2)], [fail(503, 2)], [fail(503, 2)]])

    const { results } = await bulk("handToAi", [contact("1")])

    expect(sent).toHaveLength(3)
    expect(results[0]).toMatchObject({
      status: "failed",
      error: { category: ChannelErrorCategory.NETWORK_ERROR },
    })
  })
})

describe("a repeat round that fails outright", () => {
  const serverError = () =>
    server.use(
      http.post(ROOT, () =>
        HttpResponse.json(
          { error: { code: 2, message: "down" } },
          { status: 503 },
        ),
      ),
    )

  const answerOnce = (first: Sub[]) => {
    let calls = 0
    server.use(
      http.post(ROOT, () => {
        calls += 1
        if (calls === 1) {
          return HttpResponse.json(
            first.map((sub) =>
              sub ? { code: sub.code, body: JSON.stringify(sub.body) } : null,
            ),
          )
        }
        return HttpResponse.json(
          { error: { code: 2, message: "down" } },
          { status: 503 },
        )
      }),
    )
  }

  it("a send is never repeated within the call, so a send round 2 cannot happen", async () => {
    const sent = batchEndpoint([[null, fail(503, 2)]])

    const { results } = await bulk(
      "takeFromAi",
      [contact("1"), contact("2")],
      "hi",
    )

    expect(sent).toHaveLength(1)
    expect(results.map((r) => r.status)).toEqual(["unknown", "unknown"])
  })

  it("keeps the passes round 1 applied and fails the rest", async () => {
    skipRetryBackoff()
    answerOnce([ok({ success: true }), null])

    const { results } = await bulk("handToAi", [contact("1"), contact("2")])

    expect(results.map((r) => [r.contactInboxId, r.status])).toEqual([
      ["1", "succeeded"],
      ["2", "failed"],
    ])
  })

  it("a rate limit refusing the repeat round defers the rest and asks the caller to wait", async () => {
    skipRetryBackoff()
    let calls = 0
    server.use(
      http.post(ROOT, () => {
        calls += 1
        if (calls === 1) {
          return HttpResponse.json(
            [ok({ success: true }), null].map((sub) =>
              sub ? { code: sub.code, body: JSON.stringify(sub.body) } : null,
            ),
          )
        }
        return HttpResponse.json(
          { error: { code: 4, message: "Application request limit reached" } },
          { status: 400 },
        )
      }),
    )

    const { results, retryAfterMs } = await bulk("handToAi", [
      contact("1"),
      contact("2"),
    ])

    expect(results.map((r) => [r.contactInboxId, r.status])).toEqual([
      ["1", "succeeded"],
      ["2", "deferred"],
    ])
    // Meta: stop calling; the caller must not walk on (an hour, no estimate).
    expect(retryAfterMs).toBe(60 * 60_000)
  })

  it("a failure of the FIRST round still throws: nothing was settled", async () => {
    serverError()

    await expect(bulk("handToAi", [contact("1")])).rejects.toBeInstanceOf(
      ChannelError,
    )
  })
})

describe("takeFromAi", () => {
  it("sends the text with the HUMAN_AGENT tag and reports OUR app as owner with the message id", async () => {
    const sent = batchEndpoint([
      [ok({ recipient_id: "psid-1", message_id: "m_1" })],
    ])

    const { results } = await bulk(
      "takeFromAi",
      [contact("1")],
      "A person is here",
    )

    const body = sent[0].items[0].body
    expect(sent[0].items[0].relative_url).toBe(
      `${DEFAULT_API_VERSION}/me/messages`,
    )
    expect(body.get("messaging_type")).toBe("MESSAGE_TAG")
    expect(body.get("tag")).toBe("HUMAN_AGENT")
    expect(JSON.parse(body.get("recipient") ?? "")).toEqual({ id: "psid-1" })
    expect(JSON.parse(body.get("message") ?? "")).toMatchObject({
      text: "A person is here",
    })
    expect(results).toEqual([
      {
        contactInboxId: "1",
        status: "succeeded",
        event: "serviceSent",
        ownerRole: null,
        ownerAppId: OWN_APP,
        messageSourceId: "m_1",
      },
    ])
  })

  it("never repeats a send that may have been delivered (null or 5xx sub-response): unknown, one call", async () => {
    const sent = batchEndpoint([[null, fail(500, 2)]])

    const { results } = await bulk(
      "takeFromAi",
      [contact("1"), contact("2")],
      "hi",
    )

    expect(sent).toHaveLength(1)
    expect(results.map((r) => r.status)).toEqual(["unknown", "unknown"])
  })

  it("a rate-limited send is deferred, not repeated: Meta refused it before sending", async () => {
    const sent = batchEndpoint([
      [ok({ recipient_id: "psid-1", message_id: "m_1" }), fail(400, 613)],
    ])

    const { results, retryAfterMs } = await bulk(
      "takeFromAi",
      [contact("1"), contact("2")],
      "hi",
    )

    expect(sent).toHaveLength(1)
    expect(results.map((r) => r.status)).toEqual(["succeeded", "deferred"])
    expect(retryAfterMs).toBe(60 * 60_000)
  })

  it("reports a definite refusal (user blocked) as failed and does not repeat it", async () => {
    const sent = batchEndpoint([[fail(400, 551)]])

    const { results } = await bulk("takeFromAi", [contact("1")], "hi")

    expect(sent).toHaveLength(1)
    expect(results[0]).toMatchObject({
      status: "failed",
      error: { category: ChannelErrorCategory.USER_BLOCKED },
    })
  })

  it("keeps a contact past Meta's 7-day window out of the batch and reports it failed", async () => {
    const sent = batchEndpoint([
      [ok({ recipient_id: "psid-2", message_id: "m_3" })],
    ])

    const { results } = await bulk(
      "takeFromAi",
      [contact("1", EIGHT_DAYS_AGO), contact("2")],
      "hi",
    )

    expect(sent[0].items).toHaveLength(1)
    expect(sent[0].items[0].body.get("recipient")).toContain("psid-2")
    expect(results.map((r) => [r.contactInboxId, r.status])).toEqual([
      ["1", "failed"],
      ["2", "succeeded"],
    ])
  })

  it("rejects a takeover without text before any call", async () => {
    const sent = batchEndpoint([[]])

    await expect(bulk("takeFromAi", [contact("1")], "")).rejects.toThrow("text")
    expect(sent).toHaveLength(0)
  })
})

describe("Meta's quota (X-Business-Use-Case-Usage and rate-limit codes)", () => {
  it.each([
    [80_006, "Messenger business use case"],
    [80_001, "Pages business use case"],
    [32, "Page"],
    [4, "app"],
    [17, "user"],
  ])("a %i (%s) limit defers the contact and stops: no repeat round", async (code) => {
    const sent = batchEndpoint([[ok({ success: true }), fail(400, code)]])

    const { results, retryAfterMs } = await bulk("handToAi", [
      contact("1"),
      contact("2"),
    ])

    expect(sent).toHaveLength(1)
    expect(results.map((r) => r.status)).toEqual(["succeeded", "deferred"])
    expect(retryAfterMs).toBe(60 * 60_000)
  })

  it("waits as long as Meta's estimate when it gives one", async () => {
    batchEndpoint([[fail(400, 80_006)]], [usageHeader(100, 17)])

    const { retryAfterMs } = await bulk("handToAi", [contact("1")])

    expect(retryAfterMs).toBe(17 * 60_000)
  })

  it("below half of the Page's quota the run carries on", async () => {
    batchEndpoint([[ok({ success: true })]], [usageHeader(49)])

    expect((await bulk("handToAi", [contact("1")])).retryAfterMs).toBeNull()
  })

  it("reads the quota from a sub-response when the call itself carries none", async () => {
    batchEndpoint([[{ ...ok({ success: true }), usage: usageHeader(92) }]])

    expect((await bulk("handToAi", [contact("1")])).retryAfterMs).toBe(
      60 * 60_000,
    )
  })

  it("the most pressed reading wins between the call's and its sub-responses'", async () => {
    batchEndpoint(
      [
        [
          { ...ok({ success: true }), usage: usageHeader(50) },
          { ...ok({ success: true }), usage: usageHeader(10) },
        ],
      ],
      [usageHeader(20)],
    )

    expect(
      (await bulk("handToAi", [contact("1"), contact("2")])).retryAfterMs,
    ).toBe(60_000)
  })

  it("from half of the quota it pauses a minute, leaving the rest to the bot and the inbox", async () => {
    batchEndpoint([[ok({ success: true })]], [usageHeader(50)])

    expect((await bulk("handToAi", [contact("1")])).retryAfterMs).toBe(60_000)
  })

  it("near exhaustion (90%) it waits an hour, as Meta advises to stop calling", async () => {
    batchEndpoint([[ok({ success: true })]], [usageHeader(92)])

    expect((await bulk("handToAi", [contact("1")])).retryAfterMs).toBe(
      60 * 60_000,
    )
  })

  it("a low quota also cancels the repeat round: the rest is deferred, not sent", async () => {
    const sent = batchEndpoint(
      [[ok({ success: true }), null]],
      [usageHeader(80)],
    )

    const { results } = await bulk("handToAi", [contact("1"), contact("2")])

    expect(sent).toHaveLength(1)
    expect(results.map((r) => r.status)).toEqual(["succeeded", "deferred"])
  })

  it("a top-level rate limit (the whole call refused) is mapped so the caller can tell it apart", async () => {
    server.use(
      http.post(ROOT, () =>
        HttpResponse.json(
          { error: { code: 80_006, message: "limit" } },
          { status: 400 },
        ),
      ),
    )

    await expect(bulk("handToAi", [contact("1")])).rejects.toMatchObject({
      category: ChannelErrorCategory.RATE_LIMITED,
    })
  })
})

describe("whole-call failures", () => {
  it("a token Meta rejects inside the batch keeps what did succeed and reports the rest AUTH_FAILED", async () => {
    skipRetryBackoff()
    const sent = batchEndpoint([
      [ok({ success: true }), fail(401, 190, 463), null],
    ])

    const { results } = await bulk("handToAi", [
      contact("1"),
      contact("2"),
      contact("3"),
    ])

    // No repeat round after a dead token.
    expect(sent).toHaveLength(1)
    expect(results.map((r) => r.status)).toEqual([
      "succeeded",
      "failed",
      "failed",
    ])
    expect(
      results.map((r) => (r.status === "failed" ? r.error.category : r.status)),
    ).toEqual([
      "succeeded",
      ChannelErrorCategory.AUTH_FAILED,
      ChannelErrorCategory.AUTH_FAILED,
    ])
  })

  it("a failed batch call (token revoked at the top level) throws", async () => {
    server.use(
      http.post(ROOT, () =>
        HttpResponse.json(
          { error: { code: 190, error_subcode: 460, message: "expired" } },
          { status: 401 },
        ),
      ),
    )

    await expect(bulk("handToAi", [contact("1")])).rejects.toMatchObject({
      code: 190,
      // Mapped, so the worker recognizes a revoked token and ends the run.
      category: ChannelErrorCategory.AUTH_FAILED,
    })
  })

  it("a response that does not answer every sub-request throws", async () => {
    batchEndpoint([[ok({ success: true })]])

    await expect(
      bulk("handToAi", [contact("1"), contact("2")]),
    ).rejects.toThrow("Malformed Graph batch response")
  })

  it("refuses more than 50 contacts", async () => {
    const sent = batchEndpoint([[]])

    await expect(
      bulk(
        "handToAi",
        Array.from({ length: 51 }, (_, index) => contact(String(index))),
      ),
    ).rejects.toThrow("at most 50")
    expect(sent).toHaveLength(0)
  })

  it("an empty batch makes no call", async () => {
    const sent = batchEndpoint([[]])

    await expect(bulk("handToAi", [])).resolves.toEqual({
      results: [],
      retryAfterMs: null,
    })
    expect(sent).toHaveLength(0)
  })
})

describe("bulkThreadControlLimits", () => {
  it("advertises a Graph batch of 50, a one-second gap and an hour's pause after a refused call", async () => {
    const handler = conversationHandlers.bulkThreadControlLimits
    if (!handler) {
      throw new Error("bulkThreadControlLimits is not registered")
    }

    await expect(handler({ ctx } as never)).resolves.toEqual({
      maxBatchSize: 50,
      batchGapMs: 1000,
      rateLimitPauseMs: 60 * 60_000,
    })
  })
})
