import type { ErrorLogRecordedPayload } from "@chatbotx.io/event-bus"
import { beforeEach, describe, expect, it, vi } from "vitest"

const onConflictDoNothing = vi.fn()
const values = vi.fn(() => ({ onConflictDoNothing }))
const insert = vi.fn(() => ({ values }))

vi.mock("@chatbotx.io/database/client", () => ({
  db: {
    get insert() {
      return insert
    },
  },
  // A DrizzleQueryError carries the SQLSTATE on `cause.code`; anything without
  // one is a connection-level failure, not a constraint failure.
  isDatabaseError: (error: unknown) =>
    typeof (error as { cause?: { code?: string } } | null)?.cause?.code ===
    "string",
  isForeignKeyViolationError: (error: unknown, constraint?: string) => {
    const cause = (error as { cause?: { code?: string; constraint?: string } })
      ?.cause
    return (
      cause?.code === "23503" &&
      (constraint === undefined || cause.constraint === constraint)
    )
  },
}))

vi.mock("@chatbotx.io/database/schema", () => ({
  errorLogModel: { _: "ErrorLog" },
}))

const warn = vi.fn()
const error = vi.fn()
vi.mock("../src/lib/logger", () => ({
  logger: { warn, error, info: vi.fn() },
}))

const dbError = (code: string, constraint?: string) =>
  Object.assign(new Error(`db error ${code}`), { cause: { code, constraint } })

const contactFkViolation = () =>
  dbError("23503", "ErrorLog_contactId_Contact_id_fkey")

const workspaceFkViolation = () =>
  dbError("23503", "ErrorLog_workspaceId_Workspace_id_fkey")

/** A serialization failure: a real constraint-class error, but retryable. */
const retryableDbError = () => dbError("40001")

/** No SQLSTATE: a dropped connection or a pool timeout, not a bad row. */
const connectionError = () => new Error("connection terminated")

const load = async () =>
  (await import("../src/events/error-log/handlers/write-error-log"))
    .writeErrorLogs

type Payload = ErrorLogRecordedPayload & { __eventBusMessageId?: string }

let seq = 0
const payload = (overrides: Partial<Payload> = {}): Payload => {
  seq += 1
  return {
    id: `row-${seq}`,
    workspaceId: "ws-1",
    provider: "messenger",
    error: { message: "boom", httpCode: "400" },
    __eventBusMessageId: `msg-${seq}`,
    ...overrides,
  }
}

/** The values passed to the Nth insert call. */
const written = (call = 0) => values.mock.calls[call]?.[0]

describe("writeErrorLogs", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    seq = 0
    onConflictDoNothing.mockResolvedValue(undefined)
  })

  it("writes the provider as action, not the error message", async () => {
    const writeErrorLogs = await load()

    await writeErrorLogs([
      payload({
        provider: "messenger",
        error: { message: "(#10) outside allowed window", httpCode: "400" },
      }),
    ])

    expect(written()).toEqual([
      expect.objectContaining({ action: "messenger" }),
    ])
  })

  it("uses the producer's row id so a redelivery cannot duplicate", async () => {
    const writeErrorLogs = await load()

    await writeErrorLogs([payload({ id: "minted-by-producer" })])

    expect(written()).toEqual([
      expect.objectContaining({ id: "minted-by-producer" }),
    ])
    // Idempotent against that id.
    expect(onConflictDoNothing).toHaveBeenCalled()
  })

  it("never writes the event-bus metadata key into the row", async () => {
    const writeErrorLogs = await load()

    await writeErrorLogs([payload({ __eventBusMessageId: "msg-99" })])

    expect(written()[0]).not.toHaveProperty("__eventBusMessageId")
  })

  it("persists contactId when supplied", async () => {
    const writeErrorLogs = await load()

    await writeErrorLogs([payload({ contactId: "contact-9" })])

    expect(written()).toEqual([
      expect.objectContaining({ contactId: "contact-9" }),
    ])
  })

  it("writes the real httpCode instead of a hardcoded 500", async () => {
    const writeErrorLogs = await load()

    await writeErrorLogs([
      payload({
        provider: "mailchimp",
        error: { message: "rate limited", httpCode: "429" },
      }),
    ])

    expect(written()).toEqual([expect.objectContaining({ httpCode: "429" })])
  })

  it("writes a null httpCode when the failure was not an HTTP error", async () => {
    const writeErrorLogs = await load()

    await writeErrorLogs([
      payload({
        provider: "openai",
        error: { message: "read of undefined", httpCode: null },
      }),
    ])

    expect(written()).toEqual([expect.objectContaining({ httpCode: null })])
  })

  it("writes the message as detail", async () => {
    const writeErrorLogs = await load()

    await writeErrorLogs([
      payload({
        provider: "zalo",
        error: { message: "msg only", httpCode: null },
      }),
    ])

    expect(written()).toEqual([expect.objectContaining({ detail: "msg only" })])
  })

  it("writes a batch as one insert, not one per payload", async () => {
    const writeErrorLogs = await load()

    await writeErrorLogs([
      payload({ provider: "messenger" }),
      payload({ provider: "whatsapp" }),
      payload({ provider: "telegram" }),
    ])

    expect(values).toHaveBeenCalledTimes(1)
    expect(written()).toEqual([
      expect.objectContaining({ action: "messenger" }),
      expect.objectContaining({ action: "whatsapp" }),
      expect.objectContaining({ action: "telegram" }),
    ])
  })

  it("retries without contactId when the contact row no longer exists", async () => {
    const writeErrorLogs = await load()
    onConflictDoNothing
      .mockRejectedValueOnce(contactFkViolation())
      .mockRejectedValueOnce(contactFkViolation())
      .mockResolvedValue(undefined)

    const result = await writeErrorLogs([
      payload({ contactId: "deleted-contact" }),
    ])

    // batch, row, row without its contact
    expect(values).toHaveBeenCalledTimes(3)
    expect(written(2)).toEqual([expect.objectContaining({ contactId: null })])
    // The row landed, so nothing is handed back for retry.
    expect(result).toBeUndefined()
  })

  it("falls back to per-row inserts so one deleted contact cannot drop the batch", async () => {
    const writeErrorLogs = await load()
    onConflictDoNothing
      // The all-or-nothing batch insert trips on the second payload's contact.
      .mockRejectedValueOnce(contactFkViolation())
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(contactFkViolation())
      .mockResolvedValue(undefined)

    const result = await writeErrorLogs([
      payload({ contactId: "live-contact" }),
      payload({ contactId: "deleted-contact" }),
    ])

    // batch, row 1, row 2, row 2 without its contact
    expect(values).toHaveBeenCalledTimes(4)
    expect(written(3)).toEqual([expect.objectContaining({ contactId: null })])
    expect(result).toBeUndefined()
  })

  // A deleted workspace fails identically on every redelivery. Reporting it
  // would burn five reclaims (~15 min) and then dead-letter it silently.
  it("drops a row whose workspace is gone rather than retrying it forever", async () => {
    const writeErrorLogs = await load()
    onConflictDoNothing
      .mockRejectedValueOnce(workspaceFkViolation())
      .mockRejectedValueOnce(workspaceFkViolation())

    const result = await writeErrorLogs([payload()])

    expect(result).toBeUndefined()
    expect(warn).toHaveBeenCalled()
  })

  it("does not strip the contact when the failure was not a foreign-key violation", async () => {
    const writeErrorLogs = await load()
    onConflictDoNothing
      .mockRejectedValueOnce(retryableDbError())
      .mockRejectedValue(connectionError())

    const result = await writeErrorLogs([
      payload({ contactId: "c-1", __eventBusMessageId: "msg-a" }),
    ])

    // batch, then the single row — never a third call dropping the contact.
    expect(values).toHaveBeenCalledTimes(2)
    expect(result).toEqual({ failedMessageIds: ["msg-a"] })
  })

  // Splitting the batch would repeat the same failure N times.
  it("reports the whole batch without splitting when the failure is not a constraint", async () => {
    const writeErrorLogs = await load()
    onConflictDoNothing.mockRejectedValue(connectionError())

    const result = await writeErrorLogs([
      payload({ __eventBusMessageId: "msg-a" }),
      payload({ __eventBusMessageId: "msg-b" }),
    ])

    expect(values).toHaveBeenCalledTimes(1)
    expect(result).toEqual({ failedMessageIds: ["msg-a", "msg-b"] })
    expect(error).toHaveBeenCalled()
  })

  it("reports only the rows that failed, so the ones that landed are never replayed", async () => {
    const writeErrorLogs = await load()
    onConflictDoNothing
      // Constraint failure on the batch forces the per-row path.
      .mockRejectedValueOnce(contactFkViolation())
      .mockResolvedValueOnce(undefined)
      .mockRejectedValue(retryableDbError())

    const result = await writeErrorLogs([
      payload({ __eventBusMessageId: "msg-a" }),
      payload({ __eventBusMessageId: "msg-b" }),
    ])

    expect(result).toEqual({ failedMessageIds: ["msg-b"] })
  })

  it("never throws, so a failure cannot fail the whole batch by escaping", async () => {
    const writeErrorLogs = await load()
    onConflictDoNothing.mockRejectedValue(connectionError())

    await expect(writeErrorLogs([payload()])).resolves.toEqual({
      failedMessageIds: ["msg-1"],
    })
  })

  it("reports the batch unwritten when the watchdog has already aborted", async () => {
    const writeErrorLogs = await load()
    onConflictDoNothing.mockRejectedValueOnce(contactFkViolation())
    const controller = new AbortController()
    controller.abort()

    const result = await writeErrorLogs(
      [payload({ __eventBusMessageId: "msg-a" })],
      controller.signal,
    )

    // Aborted before the per-row fallback ran.
    expect(values).toHaveBeenCalledTimes(1)
    expect(result).toEqual({ failedMessageIds: ["msg-a"] })
  })

  it("does nothing for an empty batch", async () => {
    const writeErrorLogs = await load()

    await writeErrorLogs([])

    expect(values).not.toHaveBeenCalled()
  })
})
