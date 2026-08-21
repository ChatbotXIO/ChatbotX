import { beforeEach, describe, expect, test, vi } from "vitest"
import { receiveMessage } from "../src/handlers/message/incomming-message"
import { buildRawMessagesEnvelope } from "./raw-webhook-envelope"

vi.mock("../src/lib/logger", () => ({
  logger: { debug: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

vi.mock("../src/client", () => ({
  getWhatsappClient: vi.fn(() => ({})),
}))

const { logger } = await import("../src/lib/logger")

const buildRaw = (contact: {
  waId?: string
  userId?: string
  username?: string
}) =>
  buildRawMessagesEnvelope({
    wa_id: contact.waId ?? "",
    user_id: contact.userId,
    profile: { username: contact.username },
  })

const buildProps = (props: {
  from: string
  raw?: unknown
  message?: Record<string, unknown>
}) =>
  ({
    ctx: {
      auth: { tokens: { accessToken: "test-token" } },
      storagePrefix: "workspace-1",
    },
    data: {
      integrationType: "whatsapp",
      integrationIdentifier: "inbox-1",
      payload: {
        phoneID: "phone-1",
        from: props.from,
        name: "Adopter",
        raw: props.raw,
        message: {
          id: "wamid.test-1",
          type: "text",
          text: { body: "hi" },
          ...props.message,
        },
      },
    },
  }) as never

beforeEach(() => {
  vi.mocked(logger.warn).mockClear()
})

describe("WhatsApp receiveMessage — BSUID contact identity (D2/P3)", () => {
  test("username adopter with hidden phone: sourceId falls back to the BSUID, sourceUserId/sourceUsername populated", async () => {
    const result = await receiveMessage(
      buildProps({
        from: "",
        raw: buildRaw({
          waId: "",
          userId: "user.9373001",
          username: "@handle",
        }),
      }),
    )

    expect(result.contact.sourceId).toBe("user.9373001")
    expect(result.contact.sourceUserId).toBe("user.9373001")
    expect(result.contact.sourceUsername).toBe("@handle")
  })

  test("phone visible within the 30-day window: sourceId stays the phone, sourceUserId is still backfilled", async () => {
    const result = await receiveMessage(
      buildProps({
        from: "84901234567",
        raw: buildRaw({ waId: "84901234567", userId: "user.9373002" }),
      }),
    )

    expect(result.contact.sourceId).toBe("84901234567")
    expect(result.contact.sourceUserId).toBe("user.9373002")
  })

  test("classic payload (no username adoption): new columns are absent, no regression", async () => {
    const result = await receiveMessage(
      buildProps({
        from: "84901234567",
        raw: buildRaw({ waId: "84901234567" }),
      }),
    )

    expect(result.contact.sourceId).toBe("84901234567")
    expect(result.contact.sourceUserId).toBeUndefined()
    expect(result.contact.sourceUsername).toBeUndefined()
  })

  test("type-mismatched raw payload: identical to today, warning logged, no throw", async () => {
    // `entry` present but with the wrong type — genuinely fails safeParse,
    // unlike a shape that merely omits optional fields (see next test).
    const result = await receiveMessage(
      buildProps({
        from: "84901234567",
        raw: { entry: "not-an-array" },
      }),
    )

    expect(result.contact.sourceId).toBe("84901234567")
    expect(result.contact.sourceUserId).toBeUndefined()
    expect(logger.warn).toHaveBeenCalledTimes(1)
  })

  test("unrecognized-but-well-typed raw payload (e.g. missing contacts array): no warning, resolves to absent identity", async () => {
    const result = await receiveMessage(
      buildProps({ from: "84901234567", raw: { unexpected: "shape" } }),
    )

    expect(result.contact.sourceId).toBe("84901234567")
    expect(result.contact.sourceUserId).toBeUndefined()
    expect(logger.warn).not.toHaveBeenCalled()
  })

  test("absent raw payload: identical to today, no throw, no warning", async () => {
    const result = await receiveMessage(
      buildProps({ from: "84901234567", raw: undefined }),
    )

    expect(result.contact.sourceId).toBe("84901234567")
    expect(result.contact.sourceUserId).toBeUndefined()
    // Ordinary absence (a caller that never threads `raw` through) must not
    // be treated as malformed — regression pinned after it broke an
    // unrelated pre-existing test's warn-call-count assertion.
    expect(logger.warn).not.toHaveBeenCalled()
  })

  test("empty from AND no BSUID anywhere: sourceId is empty string, identical to today's degenerate case", async () => {
    const result = await receiveMessage(
      buildProps({ from: "", raw: buildRaw({ waId: "" }) }),
    )

    expect(result.contact.sourceId).toBe("")
  })
})
