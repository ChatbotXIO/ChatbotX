import { createHmac } from "node:crypto"
import { describe, expect, test, vi } from "vitest"

const { mockLogger } = vi.hoisted(() => ({
  mockLogger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}))

type MiddlewareHandlers = { sent?: () => void }

vi.mock("../src/lib/logger", () => ({ logger: mockLogger }))

vi.mock("whatsapp-api-js/middleware/next", () => ({
  WhatsAppAPI: class {
    on: MiddlewareHandlers = {}

    get = vi.fn()

    handle_post = vi.fn(() => {
      queueMicrotask(() => {
        this.on.sent?.()
      })
      return Promise.resolve(200)
    })
  },
}))

const { webhookHandler } = await import("../src/handlers/webhook")
const { extractAccountUpdatePayloads } = await import(
  "../src/lib/account-update"
)

const CLIENT_SECRET = "test-app-secret"
const ENTRY_TIME_SECONDS = Math.floor(Date.now() / 1000) - 60
const OFFBOARDED_JOB_ID_PATTERN =
  /^provider-account-whatsapp-waba-1-offboarded-/

const sign = (rawBody: string): string =>
  `sha256=${createHmac("sha256", CLIENT_SECRET).update(rawBody, "utf8").digest("hex")}`

const makeSignedPostRequest = (payload: unknown): Request => {
  const body = JSON.stringify(payload)
  return new Request("https://example.com/webhook", {
    method: "POST",
    headers: { "x-hub-signature-256": sign(body) },
    body,
  })
}

const accountUpdateBody = (
  value: Record<string, unknown>,
  entryOverrides: Record<string, unknown> = {},
) => ({
  object: "whatsapp_business_account",
  entry: [
    {
      id: "waba-1",
      time: ENTRY_TIME_SECONDS,
      changes: [{ field: "account_update", value }],
      ...entryOverrides,
    },
  ],
})

describe("extractAccountUpdatePayloads", () => {
  test("PARTNER_REMOVED becomes a revoked event with bounded disconnection info", () => {
    const [payload] = extractAccountUpdatePayloads(
      accountUpdateBody({
        event: "PARTNER_REMOVED",
        disconnection_info: {
          reason: "COMPANION_INACTIVITY",
          initiated_by: "BUSINESS",
        },
      }),
    )

    expect(payload).toEqual({
      integrationType: "whatsapp",
      account: { kind: "businessAccount", id: "waba-1" },
      event: "revoked",
      detail: { reason: "COMPANION_INACTIVITY", initiatedBy: "BUSINESS" },
      occurredAt: ENTRY_TIME_SECONDS * 1000,
    })
  })

  test("PARTNER_REMOVED without disconnection_info is still a revoked event", () => {
    const [payload] = extractAccountUpdatePayloads(
      accountUpdateBody({ event: "PARTNER_REMOVED" }),
    )

    expect(payload?.event).toBe("revoked")
    expect(payload?.detail).toEqual({
      reason: "unknown",
      initiatedBy: "unknown",
    })
  })

  test("an unexpected reason or initiated_by value is normalised to unknown", () => {
    const [payload] = extractAccountUpdatePayloads(
      accountUpdateBody({
        event: "PARTNER_REMOVED",
        disconnection_info: {
          reason: "<script>alert(1)</script>",
          initiated_by: 42,
        },
      }),
    )

    expect(payload?.detail).toEqual({
      reason: "unknown",
      initiatedBy: "unknown",
    })
  })

  test.each([
    ["ACCOUNT_OFFBOARDED", "offboarded"],
    ["ACCOUNT_RECONNECTED", "reconnected"],
  ])("%s becomes a %s event", (metaEvent, expected) => {
    const [payload] = extractAccountUpdatePayloads(
      accountUpdateBody({ event: metaEvent }),
    )

    expect(payload?.event).toBe(expected)
  })

  test.each([
    "PARTNER_ADDED",
    "ACCOUNT_RESTRICTION",
    "SOMETHING_NEW",
  ])("%s is ignored", (metaEvent) => {
    expect(
      extractAccountUpdatePayloads(accountUpdateBody({ event: metaEvent })),
    ).toEqual([])
  })

  test("a malformed change is skipped while the rest of the batch is kept", () => {
    const payloads = extractAccountUpdatePayloads({
      entry: [
        {
          id: "waba-1",
          time: ENTRY_TIME_SECONDS,
          changes: [
            { field: "account_update", value: "not-an-object" },
            { field: "account_update", value: {} },
            {
              field: "account_update",
              value: { event: "ACCOUNT_RECONNECTED" },
            },
          ],
        },
        { id: 7, changes: [] },
        "garbage",
      ],
    })

    expect(payloads.map((payload) => payload.event)).toEqual(["reconnected"])
  })

  test("an entry without a time is not trusted", () => {
    expect(
      extractAccountUpdatePayloads(
        accountUpdateBody({ event: "PARTNER_REMOVED" }, { time: undefined }),
      ),
    ).toEqual([])
  })

  test("an event time far in the future is not trusted", () => {
    const farFuture = Math.floor(Date.now() / 1000) + 3600

    expect(
      extractAccountUpdatePayloads(
        accountUpdateBody({ event: "PARTNER_REMOVED" }, { time: farFuture }),
      ),
    ).toEqual([])
  })

  test("other webhook fields are not account updates", () => {
    expect(
      extractAccountUpdatePayloads({
        entry: [
          {
            id: "waba-1",
            changes: [
              { field: "messages", value: { event: "PARTNER_REMOVED" } },
            ],
          },
        ],
      }),
    ).toEqual([])
  })
})

describe("webhookHandler account_update", () => {
  const handle = (payload: unknown, queueAdd: ReturnType<typeof vi.fn>) =>
    webhookHandler({
      config: { verifyToken: "verify-token", clientSecret: CLIENT_SECRET },
      req: makeSignedPostRequest(payload),
      queue: { add: queueAdd },
    } as unknown as Parameters<typeof webhookHandler>[0])

  test("enqueues one deduplicable providerAccountEvent job per event", async () => {
    const queueAdd = vi.fn().mockResolvedValue(undefined)
    const body = accountUpdateBody({ event: "ACCOUNT_OFFBOARDED" })

    await expect(handle(body, queueAdd)).resolves.toBe("ok")
    await handle(body, queueAdd)

    expect(queueAdd).toHaveBeenCalledTimes(2)
    const [name, job, options] = queueAdd.mock.calls[0] as [
      string,
      { type: string; data: Record<string, unknown> },
      { jobId: string },
    ]
    expect(name).toBe("providerAccountEvent")
    expect(job.type).toBe("providerAccountEvent")
    expect(job.data).toMatchObject({
      integrationType: "whatsapp",
      event: "offboarded",
      account: { kind: "businessAccount", id: "waba-1" },
    })
    expect(options.jobId).toMatch(OFFBOARDED_JOB_ID_PATTERN)
    // BullMQ rejects ":" in custom job ids.
    expect(options.jobId).not.toContain(":")
    // Same delivery twice → same id, so the queue collapses the redelivery.
    expect((queueAdd.mock.calls[1] as unknown[])[2]).toEqual(options)
  })

  test("an unsigned manual webhook cannot enqueue account events", async () => {
    const queueAdd = vi.fn().mockResolvedValue(undefined)
    const body = JSON.stringify(accountUpdateBody({ event: "PARTNER_REMOVED" }))

    await expect(
      webhookHandler({
        // A manual integration with no app secret: the legacy unverified path.
        config: {
          verifyToken: "verify-token",
          manualIntegration: true,
          integrationId: "int-1",
        },
        req: new Request("https://example.com/webhook", {
          method: "POST",
          body,
        }),
        queue: { add: queueAdd },
      } as unknown as Parameters<typeof webhookHandler>[0]),
    ).resolves.toBe("ok")

    expect(queueAdd).not.toHaveBeenCalled()
  })

  test("a failed enqueue of a valid event fails the webhook so Meta redelivers", async () => {
    const queueAdd = vi.fn().mockRejectedValue(new Error("redis down"))

    await expect(
      handle(accountUpdateBody({ event: "PARTNER_REMOVED" }), queueAdd),
    ).rejects.toThrow()
  })

  test("an ignored event enqueues nothing", async () => {
    const queueAdd = vi.fn().mockResolvedValue(undefined)

    await expect(
      handle(accountUpdateBody({ event: "PARTNER_ADDED" }), queueAdd),
    ).resolves.toBe("ok")
    expect(queueAdd).not.toHaveBeenCalled()
  })

  test("a batch with a malformed entry still enqueues the valid ones", async () => {
    const queueAdd = vi.fn().mockResolvedValue(undefined)
    const body = {
      entry: [
        { id: "waba-1", time: ENTRY_TIME_SECONDS, changes: "nope" },
        {
          id: "waba-2",
          time: ENTRY_TIME_SECONDS,
          changes: [
            {
              field: "account_update",
              value: { event: "ACCOUNT_RECONNECTED" },
            },
          ],
        },
      ],
    }

    await handle(body, queueAdd)

    expect(queueAdd).toHaveBeenCalledTimes(1)
    expect((queueAdd.mock.calls[0] as unknown[])[1]).toMatchObject({
      data: { account: { id: "waba-2" }, event: "reconnected" },
    })
  })
})
