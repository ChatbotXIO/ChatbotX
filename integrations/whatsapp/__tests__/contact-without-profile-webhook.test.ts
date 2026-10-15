import { createHmac } from "node:crypto"
import { beforeEach, describe, expect, test, vi } from "vitest"

const { mockLogger } = vi.hoisted(() => ({
  mockLogger: {
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  },
}))

vi.mock("../src/lib/logger", () => ({ logger: mockLogger }))
vi.mock("@chatbotx.io/business", () => ({
  whatsappVoipSignalingService: {},
}))

// The real SDK is used on purpose: the bug is its `contact?.profile.name`
// read, which a mocked middleware would hide.
const { webhookHandler } = await import("../src/handlers/webhook")

const CLIENT_SECRET = "test-app-secret"
const sign = (body: string) =>
  `sha256=${createHmac("sha256", CLIENT_SECRET).update(body).digest("hex")}`

const webhookBody = (contacts: unknown[], messages: unknown[]) => ({
  object: "whatsapp_business_account",
  entry: [
    {
      id: "waba-1",
      changes: [
        {
          field: "messages",
          value: {
            messaging_product: "whatsapp",
            metadata: {
              display_phone_number: "6285713246205",
              phone_number_id: "phone-1",
            },
            contacts,
            messages,
          },
        },
      ],
    },
  ],
})

const handle = async (body: unknown) => {
  const json = JSON.stringify(body)
  const queueAdd = vi.fn().mockResolvedValue(undefined)
  const result = await webhookHandler({
    config: {
      clientSecret: CLIENT_SECRET,
      phoneNumberId: "phone-1",
      verifyToken: "verify-token",
    },
    req: new Request("https://example.com/webhook", {
      method: "POST",
      headers: { "x-hub-signature-256": sign(json) },
      body: json,
    }),
    queue: { add: queueAdd },
  } as never)
  return { queueAdd, result }
}

type EnqueuedMessage = {
  data: {
    payload: {
      from: string
      name?: string
      message: { id: string }
      raw: {
        entry: Array<{
          changes: Array<{ value: { contacts: Record<string, unknown>[] } }>
        }>
      }
    }
  }
}

const enqueuedMessages = (queueAdd: ReturnType<typeof vi.fn>) =>
  queueAdd.mock.calls
    .filter(([name]) => name === "incomingMessage")
    .map(([, job]) => (job as EnqueuedMessage).data.payload)

describe("WhatsApp webhook: contact without profile", () => {
  beforeEach(() => vi.clearAllMocks())

  test("enqueues the message when the contact carries only wa_id and user_id", async () => {
    const { queueAdd, result } = await handle(
      webhookBody(
        [{ wa_id: "628551000185", user_id: "ID.3394119630794599" }],
        [
          {
            from: "628551000185",
            from_user_id: "ID.3394119630794599",
            id: "wamid.unsupported-1",
            timestamp: "1792044521",
            errors: [
              {
                code: 131_051,
                title: "Message type unknown",
                message: "Message type unknown",
                error_data: {
                  details: "Message type is currently not supported.",
                },
              },
            ],
            type: "unsupported",
            unsupported: { type: "unknown", raw_type: "unknown" },
          },
        ],
      ),
    )

    expect(result).toBe("ok")
    expect(mockLogger.error).not.toHaveBeenCalled()
    const [payload] = enqueuedMessages(queueAdd)
    expect(payload?.message.id).toBe("wamid.unsupported-1")
    expect(payload?.from).toBe("628551000185")
    expect(payload?.name).toBeUndefined()
    // The BSUID must survive normalization so the contact stays matchable.
    expect(payload?.raw.entry[0]?.changes[0]?.value.contacts[0]?.user_id).toBe(
      "ID.3394119630794599",
    )
  })

  test("keeps the profile name when the contact has one", async () => {
    const { queueAdd } = await handle(
      webhookBody(
        [{ wa_id: "84900000001", profile: { name: "Customer" } }],
        [
          {
            from: "84900000001",
            id: "wamid.text-1",
            timestamp: "1792044521",
            type: "text",
            text: { body: "hello" },
          },
        ],
      ),
    )

    const [payload] = enqueuedMessages(queueAdd)
    expect(payload?.name).toBe("Customer")
  })
})
