import { sha256Hex } from "@chatbotx.io/utils/crypto"
import { afterEach, describe, expect, it, vi } from "vitest"
import {
  baseConfig,
  contactFor,
  envelope,
  handoverValue,
  historyContext,
  makePostRequest,
  PHONE_ID,
  standbyMessage,
  standbyValue,
  summaryContext,
  templateEcho,
  textEcho,
  USER,
} from "./conversation-routing-fixtures"

const { handlePostMock, postMock } = vi.hoisted(() => ({
  handlePostMock: vi.fn<() => Promise<number>>(),
  postMock: vi.fn(),
}))

vi.mock("whatsapp-api-js/middleware/next", () => ({
  WhatsAppAPI: class {
    on: Record<string, unknown> = { message: null, sent: null, status: null }
    get = vi.fn().mockResolvedValue("ok")
    handle_post = handlePostMock
  },
}))

vi.mock("@chatbotx.io/utils/crypto", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@chatbotx.io/utils/crypto")>()),
  verifyHmacSha256Signature: vi.fn().mockResolvedValue(true),
}))

vi.mock("ky", async () => {
  const actual = await vi.importActual<typeof import("ky")>("ky")
  return {
    ...actual,
    default: { post: postMock, create: vi.fn(() => ({})) },
    HTTPError: actual.HTTPError,
  }
})

vi.mock("../src/client", () => ({ getWhatsappClient: vi.fn(() => ({})) }))

const { extractConversationRoutingPayloads, webhookHandler } = await import(
  "../src/handlers/webhook"
)
const {
  subscribeWebhook,
  WHATSAPP_BASE_SUBSCRIBED_FIELDS,
  WHATSAPP_CONVERSATION_ROUTING_FIELDS,
  WHATSAPP_SUBSCRIBED_FIELDS,
} = await import("../src/api/webhook")

afterEach(() => {
  vi.clearAllMocks()
})

// ---------------------------------------------------------------------------
// Subscription list
// ---------------------------------------------------------------------------

describe("subscribeWebhook field list", () => {
  const auth = {
    verifyToken: "v",
    tokens: { accessToken: "tok" },
    version: "v23.0",
    metadata: { wabaId: "waba-1", webhookUrl: "https://x/wh" },
  } as never
  const ok = () => ({ json: vi.fn().mockResolvedValue({ success: true }) })

  it("appends messaging_handovers and standby to the base list", async () => {
    postMock.mockReturnValueOnce(ok())
    await subscribeWebhook({ auth })
    expect(postMock.mock.calls[0]?.[1].json.subscribed_fields).toEqual([
      ...WHATSAPP_BASE_SUBSCRIBED_FIELDS,
      "messaging_handovers",
      "standby",
    ])
  })

  it("appends the routing fields after the automatic-events list", async () => {
    postMock.mockReturnValueOnce(ok())
    await subscribeWebhook({ auth, includeAutomaticEvents: true })
    expect(postMock.mock.calls[0]?.[1].json.subscribed_fields).toEqual([
      ...WHATSAPP_SUBSCRIBED_FIELDS,
      ...WHATSAPP_CONVERSATION_ROUTING_FIELDS,
    ])
  })
})

// ---------------------------------------------------------------------------
// extractConversationRoutingPayloads
// ---------------------------------------------------------------------------

describe("extractConversationRoutingPayloads", () => {
  describe("standby", () => {
    it("emits one standbyMessage job per standby message, keeping field standby", () => {
      const body = envelope(
        standbyValue({
          contacts: [contactFor()],
          messages: [standbyMessage("wamid.a")],
        }),
        "standby",
      )

      const result = extractConversationRoutingPayloads(body)

      expect(result).toHaveLength(1)
      expect(result[0]).toMatchObject({
        phoneNumberId: PHONE_ID,
        kind: "standbyMessage",
        dedupeKey: "wamid.a",
        body: {
          phoneID: PHONE_ID,
          from: USER,
          name: "Test User",
          message: { id: "wamid.a" },
        },
      })
      const raw = (result[0]?.body as { raw: typeof body }).raw
      expect(raw.entry[0]?.changes[0]?.field).toBe("standby")
      // Single-item re-wrap, and contacts reachable for BSUID extraction.
      const value = raw.entry[0]?.changes[0]?.value as {
        standby: { messages: unknown[] }
        contacts: unknown[]
      }
      expect(value.standby.messages).toHaveLength(1)
      expect(value.contacts).toHaveLength(1)
    })

    it("splits a batched standby delivery and matches each contact by identity", () => {
      const body = envelope(
        standbyValue({
          contacts: [contactFor("222"), contactFor("111")],
          messages: [
            standbyMessage("wamid.1", "111"),
            standbyMessage("wamid.2", "222"),
          ],
        }),
        "standby",
      )

      const result = extractConversationRoutingPayloads(body)

      expect(result.map((item) => item.dedupeKey)).toEqual([
        "wamid.1",
        "wamid.2",
      ])
      const rawContacts = result.map(
        (item) =>
          (
            (item.body as { raw: ReturnType<typeof envelope> }).raw.entry[0]
              ?.changes[0]?.value as { contacts: Array<{ wa_id: string }> }
          ).contacts[0]?.wa_id,
      )
      expect(rawContacts).toEqual(["111", "222"])
    })

    it("emits one standbyEcho job per text echo", () => {
      const body = envelope(
        standbyValue({ message_echoes: [textEcho("wamid.echo-1")] }),
        "standby",
      )

      const result = extractConversationRoutingPayloads(body)

      expect(result).toHaveLength(1)
      expect(result[0]).toMatchObject({
        kind: "standbyEcho",
        dedupeKey: "wamid.echo-1",
        body: {
          phoneID: PHONE_ID,
          from: USER,
          message: { id: "wamid.echo-1" },
        },
      })
    })

    it("emits a standbyEcho job for a template echo carrying the definition", () => {
      const body = envelope(
        standbyValue({ message_echoes: [templateEcho("wamid.tpl")] }),
        "standby",
      )

      const result = extractConversationRoutingPayloads(body)

      expect(result).toHaveLength(1)
      expect(
        (result[0]?.body as { message: { template: unknown } }).message
          .template,
      ).toMatchObject({ name: "summer_sale_2026" })
    })

    it("drops standby statuses (receipts of other partners' messages)", () => {
      const body = envelope(
        standbyValue({
          statuses: [
            { id: "wamid.s", status: "delivered", recipient_id: USER },
            { id: "wamid.s2", status: "read", recipient_id: USER },
          ],
        }),
        "standby",
      )

      expect(extractConversationRoutingPayloads(body)).toEqual([])
    })
  })

  describe("messaging_handovers", () => {
    it.each([
      ["no context", {}],
      ["history context", { conversation_context: historyContext }],
      ["summary context", { conversation_context: summaryContext }],
    ])("emits one handover job for control_passed with %s", (_name, extra) => {
      const value = handoverValue("control_passed", {
        previous_owner_role: "ai_agent",
        new_owner_role: "escalation",
        metadata: "user asked for a human",
        ...extra,
      })

      const result = extractConversationRoutingPayloads(
        envelope(value, "messaging_handovers"),
      )

      expect(result).toEqual([
        {
          phoneNumberId: PHONE_ID,
          kind: "handover",
          body: value,
          dedupeKey: null,
        },
      ])
    })

    it("emits a handover job for control_taken", () => {
      const value = handoverValue("control_taken", {
        previous_owner_role: "customer_service",
        new_owner_role: "escalation",
      })

      const result = extractConversationRoutingPayloads(
        envelope(value, "messaging_handovers"),
      )

      expect(result).toHaveLength(1)
      expect(result[0]?.kind).toBe("handover")
    })

    it("drops a handover without recipient.phone_number_id", () => {
      const value = { type: "control_passed", sender: { phone_number: USER } }

      expect(
        extractConversationRoutingPayloads(
          envelope(value, "messaging_handovers"),
        ),
      ).toEqual([])
    })
  })

  describe("messages field", () => {
    it("is never extracted as a routing job (owner deliveries stay on incomingMessage)", () => {
      const body = envelope(
        {
          metadata: { phone_number_id: PHONE_ID },
          messages: [standbyMessage("wamid.owner")],
        },
        "messages",
      )

      expect(extractConversationRoutingPayloads(body)).toEqual([])
    })
  })

  describe("pinned number and malformed payloads", () => {
    const _routingBody = envelope(
      standbyValue({ messages: [standbyMessage("wamid.x")] }),
      "standby",
    )

    it("drops items for another number when a number is pinned", () => {
      const mixed = {
        object: "whatsapp_business_account",
        entry: [
          {
            id: "waba-1",
            changes: [
              {
                field: "standby",
                value: standbyValue(
                  { messages: [standbyMessage("w1")] },
                  "other",
                ),
              },
              {
                field: "messaging_handovers",
                value: handoverValue("control_taken", {}, "other"),
              },
              {
                field: "standby",
                value: standbyValue({ messages: [standbyMessage("w2")] }),
              },
            ],
          },
        ],
      }

      const result = extractConversationRoutingPayloads(mixed, PHONE_ID)

      expect(result.map((item) => item.dedupeKey)).toEqual(["w2"])
    })

    it.each([
      ["null", null],
      ["a string", "nope"],
      ["no entry", {}],
      ["entry not an array", { entry: "x" }],
      ["entry without changes", { entry: [{}] }],
      ["a null change", { entry: [{ changes: [null] }] }],
      [
        "standby without an object",
        envelope(
          { metadata: { phone_number_id: PHONE_ID }, standby: "x" },
          "standby",
        ),
      ],
      [
        "standby without metadata",
        envelope({ standby: { messages: [standbyMessage("w")] } }, "standby"),
      ],
      [
        "a standby message without an id",
        envelope(
          standbyValue({ messages: [{ from: USER, type: "text" }] }),
          "standby",
        ),
      ],
      [
        "a standby echo without a message",
        envelope(standbyValue({ message_echoes: [{ id: "e" }] }), "standby"),
      ],
    ])("never throws and returns nothing for %s", (_name, body) => {
      expect(extractConversationRoutingPayloads(body)).toEqual([])
    })
  })
})

describe("webhookHandler routing enqueue", () => {
  it("enqueues one threadControlEvent job per item with distinct prefixes", async () => {
    const handover = handoverValue("control_passed", {
      new_owner_role: "escalation",
      conversation_context: summaryContext,
    })
    const body = {
      object: "whatsapp_business_account",
      entry: [
        {
          id: "waba-1",
          changes: [
            {
              field: "standby",
              value: standbyValue({
                contacts: [contactFor()],
                messages: [standbyMessage("wamid.m1")],
                message_echoes: [textEcho("wamid.e1")],
                statuses: [{ id: "wamid.st", status: "read" }],
              }),
            },
            { field: "messaging_handovers", value: handover },
          ],
        },
      ],
    }
    const queueAdd = vi.fn().mockResolvedValue(undefined)

    await webhookHandler({
      config: baseConfig,
      req: makePostRequest(body),
      queue: { add: queueAdd } as never,
    })

    const handoverHash = await sha256Hex(JSON.stringify(handover))
    const jobs = queueAdd.mock.calls.map(([name, data, options]) => ({
      name,
      kind: data.data.payload.kind,
      identifier: data.data.integrationIdentifier,
      integrationType: data.data.integrationType,
      jobId: options.jobId,
      removeOnFail: options.removeOnFail,
    }))
    // Longer retry than the queue default: the handover resume flow is a
    // one-shot side effect Meta will not redeliver after our 200.
    for (const [, , options] of queueAdd.mock.calls) {
      expect(options).toMatchObject({
        attempts: 5,
        backoff: { type: "exponential", delay: 10_000 },
      })
    }
    expect(jobs).toEqual([
      {
        name: "threadControlEvent",
        kind: "standbyMessage",
        identifier: PHONE_ID,
        integrationType: "whatsapp",
        jobId: "wa-sb-phone-1-wamid.m1",
        removeOnFail: true,
      },
      {
        name: "threadControlEvent",
        kind: "standbyEcho",
        identifier: PHONE_ID,
        integrationType: "whatsapp",
        jobId: "wa-sbe-phone-1-wamid.e1",
        removeOnFail: true,
      },
      {
        name: "threadControlEvent",
        kind: "handover",
        identifier: PHONE_ID,
        integrationType: "whatsapp",
        jobId: `wa-tc-phone-1-${handoverHash}`,
        removeOnFail: true,
      },
    ])
    // Never as incomingMessage, and no SDK dispatch for standby.
    expect(handlePostMock).not.toHaveBeenCalled()
  })

  it("redelivery of the same item yields the same job id", async () => {
    const body = envelope(
      standbyValue({ message_echoes: [textEcho("wamid.same")] }),
      "standby",
    )
    const queueAdd = vi.fn().mockResolvedValue(undefined)
    const queue = { add: queueAdd } as never

    await webhookHandler({
      config: baseConfig,
      req: makePostRequest(body),
      queue,
    })
    await webhookHandler({
      config: baseConfig,
      req: makePostRequest(body),
      queue,
    })

    expect(queueAdd.mock.calls[0]?.[2].jobId).toBe(
      queueAdd.mock.calls[1]?.[2].jobId,
    )
  })

  it("pinned-number mismatch enqueues nothing and still acknowledges", async () => {
    const body = envelope(
      standbyValue({ messages: [standbyMessage("wamid.o")] }, "other-phone"),
      "standby",
    )
    const queueAdd = vi.fn().mockResolvedValue(undefined)

    await expect(
      webhookHandler({
        config: { ...(baseConfig as object), phoneNumberId: PHONE_ID } as never,
        req: makePostRequest(body),
        queue: { add: queueAdd } as never,
      }),
    ).resolves.toBe("ok")

    expect(queueAdd).not.toHaveBeenCalled()
  })

  it("a malformed routing payload still acknowledges", async () => {
    const queueAdd = vi.fn().mockResolvedValue(undefined)

    await expect(
      webhookHandler({
        config: baseConfig,
        req: makePostRequest(
          envelope(
            { metadata: { phone_number_id: PHONE_ID }, standby: 1 },
            "standby",
          ),
        ),
        queue: { add: queueAdd } as never,
      }),
    ).resolves.toBe("ok")

    expect(queueAdd).not.toHaveBeenCalled()
  })

  it("propagates an enqueue failure so Meta redelivers", async () => {
    const body = envelope(
      standbyValue({ messages: [standbyMessage("wamid.f")] }),
      "standby",
    )
    const queueAdd = vi.fn().mockRejectedValue(new Error("redis down"))

    await expect(
      webhookHandler({
        config: baseConfig,
        req: makePostRequest(body),
        queue: { add: queueAdd } as never,
      }),
    ).rejects.toThrow()
  })
})
