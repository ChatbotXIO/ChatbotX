import { createHmac } from "node:crypto"
import { beforeEach, describe, expect, test, vi } from "vitest"

const { middlewareHandlePost, mockLogger } = vi.hoisted(() => ({
  middlewareHandlePost: vi.fn(),
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

vi.mock("whatsapp-api-js/middleware/next", () => ({
  WhatsAppAPI: class {
    on: {
      message?: (args: unknown) => void
      sent?: () => void
      status?: (args: unknown) => void
    } = {}

    get = vi.fn()

    async handle_post(req: Request): Promise<number> {
      middlewareHandlePost(req)
      const body = JSON.parse(await req.text()) as {
        entry?: Array<{
          changes?: Array<{
            value?: {
              metadata?: { phone_number_id?: string }
              messages?: Record<string, unknown>[]
            }
          }>
        }>
      }
      const value = body.entry?.[0]?.changes?.[0]?.value
      const message = value?.messages?.[0]
      queueMicrotask(() => {
        if (message) {
          this.on.message?.({
            phoneID: value?.metadata?.phone_number_id,
            from: message.from,
            name: undefined,
            message,
            raw: {},
          })
          return
        }
        this.on.sent?.()
      })
      return 200
    }
  },
}))

const { webhookHandler } = await import("../src/handlers/webhook")

const CLIENT_SECRET = "test-app-secret"
const sign = (body: string) =>
  `sha256=${createHmac("sha256", CLIENT_SECRET).update(body).digest("hex")}`

const systemMessage = (overrides: Record<string, unknown> = {}) => ({
  id: "wamid.system-1",
  from: "84900000001",
  type: "system",
  system: { type: "user_changed_number", wa_id: "84900000002" },
  ...overrides,
})

const textMessage = (overrides: Record<string, unknown> = {}) => ({
  id: "wamid.text-1",
  from: "84900000001",
  type: "text",
  text: { body: "hello" },
  ...overrides,
})

const webhookBody = (messages: unknown[], phoneNumberId = "phone-1") => ({
  object: "whatsapp_business_account",
  entry: [
    {
      id: "waba-1",
      changes: [
        {
          field: "messages",
          value: {
            messaging_product: "whatsapp",
            metadata: { phone_number_id: phoneNumberId },
            contacts: [{ wa_id: "84900000001", profile: { name: "Customer" } }],
            messages,
          },
        },
      ],
    },
  ],
})

const handle = async (input: {
  messages: unknown[]
  phoneNumberId?: string
  pinnedPhoneNumberId?: string
  queueAdd?: ReturnType<typeof vi.fn>
}) => {
  const body = JSON.stringify(
    webhookBody(input.messages, input.phoneNumberId ?? "phone-1"),
  )
  const queueAdd = input.queueAdd ?? vi.fn().mockResolvedValue(undefined)
  const result = await webhookHandler({
    config: {
      clientSecret: CLIENT_SECRET,
      phoneNumberId: input.pinnedPhoneNumberId,
      verifyToken: "verify-token",
    },
    req: new Request("https://example.com/webhook", {
      method: "POST",
      headers: { "x-hub-signature-256": sign(body) },
      body,
    }),
    queue: { add: queueAdd },
  } as never)
  return { queueAdd, result }
}

describe("WhatsApp identity-change system webhook", () => {
  beforeEach(() => vi.clearAllMocks())

  test("enqueues an identity job and never sends the system item to the SDK", async () => {
    const { queueAdd } = await handle({ messages: [systemMessage()] })

    expect(middlewareHandlePost).not.toHaveBeenCalled()
    expect(queueAdd).toHaveBeenCalledTimes(1)
    expect(queueAdd).toHaveBeenCalledWith(
      "whatsappIdentityChange",
      {
        type: "whatsappIdentityChange",
        data: {
          integrationType: "whatsapp",
          integrationIdentifier: "phone-1",
          payload: {
            phoneNumberId: "phone-1",
            messageId: "wamid.system-1",
            timestamp: undefined,
            change: {
              kind: "phoneChanged",
              previousPhone: "84900000001",
              newPhone: "84900000002",
              userId: undefined,
            },
          },
        },
      },
      { jobId: "wa-sys-phone-1-wamid.system-1", removeOnFail: true },
    )
  })

  test("enqueues the official user_changed_user_id payload", async () => {
    const { queueAdd } = await handle({
      messages: [
        systemMessage({
          system: {
            body: "User Customer changed from bsuid-old to bsuid-new",
            type: "user_changed_user_id",
            wa_id: "84900000002",
            user_id: "bsuid-new",
          },
        }),
      ],
    })

    expect(queueAdd).toHaveBeenCalledWith(
      "whatsappIdentityChange",
      expect.objectContaining({
        data: expect.objectContaining({
          payload: expect.objectContaining({
            change: {
              kind: "userIdChanged",
              previousUserId: "bsuid-old",
              userId: "bsuid-new",
              previousParentUserId: undefined,
              parentUserId: undefined,
              previousPhone: "84900000001",
              newPhone: "84900000002",
            },
          }),
        }),
      }),
      expect.anything(),
    )
  })

  test("mixed batches enqueue one identity job and one incoming message job", async () => {
    const { queueAdd } = await handle({
      messages: [systemMessage(), textMessage()],
    })

    expect(middlewareHandlePost).toHaveBeenCalledTimes(1)
    expect(queueAdd.mock.calls.map((call) => call[0])).toEqual([
      "whatsappIdentityChange",
      "incomingMessage",
    ])
  })

  test("an all-system change does not fall back to the SDK", async () => {
    await handle({
      messages: [systemMessage(), systemMessage({ id: "wamid.2" })],
    })
    expect(middlewareHandlePost).not.toHaveBeenCalled()
  })

  test.each([
    {
      name: "empty wa_id",
      message: systemMessage({
        system: { type: "user_changed_number", wa_id: "" },
      }),
    },
    {
      name: "unsupported type",
      message: systemMessage({ system: { type: "unsupported" } }),
    },
  ])("$name is skipped without reaching the SDK", async ({ message }) => {
    const { queueAdd } = await handle({ messages: [message] })
    expect(queueAdd).not.toHaveBeenCalled()
    expect(middlewareHandlePost).not.toHaveBeenCalled()
  })

  test("uses BullMQ-safe deterministic job id segments", async () => {
    const { queueAdd } = await handle({
      phoneNumberId: "phone:id with spaces",
      messages: [systemMessage({ id: "wamid:unsafe/id" })],
    })
    const jobId = queueAdd.mock.calls[0][2].jobId as string
    expect(jobId).toBe("wa-sys-phone_id_with_spaces-wamid_unsafe_id")
    expect(jobId).not.toContain(":")
  })

  test("drops identity jobs for a mismatched pinned phone_number_id", async () => {
    const { queueAdd } = await handle({
      messages: [systemMessage()],
      phoneNumberId: "phone-forged",
      pinnedPhoneNumberId: "phone-pinned",
    })
    expect(queueAdd).not.toHaveBeenCalled()
  })

  test("identity enqueue failures propagate so Meta can redeliver", async () => {
    const enqueueError = new Error("redis unavailable")
    const queueAdd = vi.fn().mockRejectedValue(enqueueError)

    await expect(
      handle({ messages: [systemMessage()], queueAdd }),
    ).rejects.toThrow("Failed to handle webhook")
    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.objectContaining({ err: enqueueError }),
      "Whatsapp identity change enqueue failed",
    )
  })
})
