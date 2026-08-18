import { beforeEach, describe, expect, test, vi } from "vitest"
import { mapToChannelError } from "../src/lib/error-mapper"
import { buildRawMessagesEnvelope } from "./raw-webhook-envelope"

vi.mock("../src/lib/logger", () => ({
  logger: { debug: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

const { logger } = await import("../src/lib/logger")
const { extractWhatsappUserIdentity, extractWhatsappStatusRecipientUserId } =
  await import("../src/lib/raw-identity")
const { resolveRecipientParams } = await import("../src/lib/recipient")
const { handleMessageStatus } = await import(
  "../src/handlers/message/message-status"
)

beforeEach(() => {
  vi.mocked(logger.warn).mockClear()
})

describe("extractWhatsappUserIdentity (raw messages payload)", () => {
  const buildRaw = buildRawMessagesEnvelope

  test("extracts BSUID and username when both present", () => {
    expect(
      extractWhatsappUserIdentity(
        buildRaw({
          wa_id: "",
          user_id: "user.9373001",
          profile: { username: "@handle" },
        }),
      ),
    ).toEqual({ sourceUserId: "user.9373001", sourceUsername: "@handle" })
  })

  test("returns {} when contacts array is absent", () => {
    expect(
      extractWhatsappUserIdentity({ entry: [{ changes: [{ value: {} }] }] }),
    ).toEqual({})
  })

  test("returns {} and logs a warning on a type-mismatched shape", () => {
    expect(extractWhatsappUserIdentity({ entry: "not-an-array" })).toEqual({})
    expect(logger.warn).toHaveBeenCalledTimes(1)
  })

  test("returns {} without throwing when raw is undefined", () => {
    expect(extractWhatsappUserIdentity(undefined)).toEqual({})
  })

  test("treats an empty-string user_id/username as absent", () => {
    expect(
      extractWhatsappUserIdentity(
        buildRaw({
          wa_id: "84900000001",
          user_id: "",
          profile: { username: "" },
        }),
      ),
    ).toEqual({})
  })
})

describe("extractWhatsappStatusRecipientUserId (raw statuses payload)", () => {
  const buildRaw = (status: Record<string, unknown>) => ({
    entry: [{ changes: [{ value: { statuses: [status] } }] }],
  })

  test("extracts recipient_user_id when the status targeted a BSUID", () => {
    expect(
      extractWhatsappStatusRecipientUserId(
        buildRaw({ recipient_id: "", recipient_user_id: "user.9373001" }),
      ),
    ).toBe("user.9373001")
  })

  test("returns undefined for a classic phone-targeted status", () => {
    expect(
      extractWhatsappStatusRecipientUserId(
        buildRaw({ recipient_id: "84900000001" }),
      ),
    ).toBeUndefined()
  })

  test("returns undefined and logs a warning on a type-mismatched shape", () => {
    expect(
      extractWhatsappStatusRecipientUserId({ entry: "not-an-array" }),
    ).toBeUndefined()
    expect(logger.warn).toHaveBeenCalledTimes(1)
  })
})

describe("resolveRecipientParams (D4 send-path resolver)", () => {
  test("phone-keyed identity sends via `to` (regression-safe)", () => {
    expect(
      resolveRecipientParams({ sourceId: "84900000001", sourceUserId: null }),
    ).toEqual({ to: "84900000001" })
  })

  test("BSUID-keyed identity (sourceId === sourceUserId) sends via `recipient`", () => {
    expect(
      resolveRecipientParams({
        sourceId: "user.9373001",
        sourceUserId: "user.9373001",
      }),
    ).toEqual({ recipient: "user.9373001" })
  })

  test("a phone-keyed row that also carries a distinct sourceUserId still sends via `to`", () => {
    // sourceId !== sourceUserId → phone-keyed row with a backfilled BSUID
    // (D2/D3 dedup case); the primary identity for sending stays the phone.
    expect(
      resolveRecipientParams({
        sourceId: "84900000001",
        sourceUserId: "user.9373001",
      }),
    ).toEqual({ to: "84900000001" })
  })

  test("no sourceUserId at all sends via `to`", () => {
    expect(resolveRecipientParams({ sourceId: "84900000001" })).toEqual({
      to: "84900000001",
    })
  })

  test("empty sourceId with a known BSUID sends via `recipient` (no address otherwise)", () => {
    // A row can end up with an empty sourceId but a stored BSUID (e.g. data
    // repair or a contact whose phone was never known). `to: ""` fails
    // outright, so the scoped id is the only valid route.
    expect(
      resolveRecipientParams({
        sourceId: "",
        sourceUserId: "VN.4416742385309647",
      }),
    ).toEqual({ recipient: "VN.4416742385309647" })
  })

  test("empty sourceId AND no sourceUserId degenerates to `to` (today's behavior)", () => {
    expect(
      resolveRecipientParams({ sourceId: "", sourceUserId: null }),
    ).toEqual({ to: "" })
  })
})

describe("WhatsApp error-mapper — 131062 (BSUID + authentication template, D5)", () => {
  test("maps 131062 to a non-retryable, categorized error", () => {
    const error = mapToChannelError({
      message: "(#131062) Business-scoped user cannot receive this template",
      code: 131_062,
    })

    expect(error.code).toBe(131_062)
    expect(error.category).toBe("payload_invalid")
    expect(error.isPermanent).toBe(true)
    expect(error.isRetryable).toBe(false)
  })
})

describe("WhatsApp handleMessageStatus — BSUID status fallback (D6)", () => {
  test("phone send status: sourceId is the phone (regression)", async () => {
    const result = await handleMessageStatus({
      ctx: {} as never,
      data: {
        integrationType: "whatsapp",
        integrationIdentifier: "inbox-1",
        payload: {
          phoneID: "phone-1",
          phone: "84900000001",
          messageId: "wamid.status-1",
          status: "delivered",
        },
      },
    })

    expect(result?.contact.sourceId).toBe("84900000001")
  })

  test("BSUID send status: empty phone falls back to recipientUserId", async () => {
    const result = await handleMessageStatus({
      ctx: {} as never,
      data: {
        integrationType: "whatsapp",
        integrationIdentifier: "inbox-1",
        payload: {
          phoneID: "phone-1",
          phone: "",
          recipientUserId: "user.9373001",
          messageId: "wamid.status-2",
          status: "delivered",
        },
      },
    })

    expect(result?.contact.sourceId).toBe("user.9373001")
  })
})
