import type { ErrorLogEntry } from "@chatbotx.io/worker-config"
import { beforeEach, describe, expect, it, vi } from "vitest"

const values = vi.fn()
const insert = vi.fn(() => ({ values }))

vi.mock("@chatbotx.io/database/client", () => ({
  db: {
    get insert() {
      return insert
    },
  },
  isForeignKeyViolationError: (error: unknown) =>
    (error as { code?: string } | null)?.code === "23503",
}))

const foreignKeyViolation = () =>
  Object.assign(new Error("violates foreign key constraint"), {
    code: "23503",
  })

vi.mock("@chatbotx.io/database/schema", () => ({
  errorLogModel: { _: "ErrorLog" },
}))

vi.mock("@chatbotx.io/utils", () => ({
  createId: () => "generated-id",
}))

const loadHandler = async () => {
  const { sendErrorLog } = await import(
    "../src/default/handlers/send-error-log"
  )
  return {
    /** Most jobs carry exactly one entry; keeps the assertions readable. */
    one: (entry: ErrorLogEntry) => sendErrorLog({ entries: [entry] }),
    batch: (entries: ErrorLogEntry[]) => sendErrorLog({ entries }),
  }
}

const entry = (overrides: Partial<ErrorLogEntry> = {}): ErrorLogEntry => ({
  workspaceId: "ws-1",
  provider: "messenger",
  error: { message: "boom", httpCode: "400" },
  ...overrides,
})

describe("sendErrorLog", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
    values.mockResolvedValue(undefined)
  })

  it("writes the provider as action, not the error message", async () => {
    const { one } = await loadHandler()

    await one({
      workspaceId: "ws-1",
      provider: "messenger",
      error: { message: "(#10) outside allowed window", httpCode: "400" },
    })

    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({ action: "messenger" }),
    )
  })

  it("persists contactId when supplied", async () => {
    const { one } = await loadHandler()

    await one({
      workspaceId: "ws-1",
      contactId: "contact-9",
      provider: "whatsapp",
      error: { message: "boom", httpCode: "400" },
    })

    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({ contactId: "contact-9" }),
    )
  })

  it("writes the real httpCode instead of a hardcoded 500", async () => {
    const { one } = await loadHandler()

    await one({
      workspaceId: "ws-1",
      provider: "mailchimp",
      error: { message: "rate limited", httpCode: "429" },
    })

    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({ httpCode: "429" }),
    )
  })

  it("writes a null httpCode when the failure was not an HTTP error", async () => {
    const { one } = await loadHandler()

    await one({
      workspaceId: "ws-1",
      provider: "openai",
      error: { message: "read of undefined", httpCode: null },
    })

    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({ httpCode: null }),
    )
  })

  it("writes the message as detail and ignores a stack on older entries", async () => {
    const { one } = await loadHandler()

    await one({
      workspaceId: "ws-1",
      provider: "zalo",
      error: { message: "msg only", httpCode: null },
    })
    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({ detail: "msg only" }),
    )

    // Jobs enqueued before the stack was dropped are still in Redis.
    await one({
      workspaceId: "ws-1",
      provider: "zalo",
      error: {
        message: "msg",
        stack: "Error: msg\n  at /srv/app/f.ts:1:1",
        httpCode: null,
      },
    } as ErrorLogEntry)
    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({ detail: "msg" }),
    )
  })

  it("retries without contactId when the contact row no longer exists", async () => {
    const { one } = await loadHandler()
    values
      .mockRejectedValueOnce(foreignKeyViolation())
      .mockResolvedValueOnce(undefined)

    await one({
      workspaceId: "ws-1",
      contactId: "deleted-contact",
      provider: "telegram",
      error: { message: "boom", httpCode: "400" },
    })

    expect(values).toHaveBeenCalledTimes(2)
    expect(values).toHaveBeenLastCalledWith(
      expect.objectContaining({ contactId: null }),
    )
  })

  it("rethrows when the retry without contactId also fails", async () => {
    const { one } = await loadHandler()
    values.mockRejectedValue(foreignKeyViolation())

    await expect(
      one({
        workspaceId: "ws-1",
        contactId: "c-1",
        provider: "telegram",
        error: { message: "boom", httpCode: "400" },
      }),
    ).rejects.toThrow("violates foreign key constraint")
  })

  // A dropped connection or a pool timeout must not cost the row its contact:
  // only 23503 means the referent is genuinely gone.
  it("does not strip the contact when the failure was not a foreign-key violation", async () => {
    const { one } = await loadHandler()
    values.mockRejectedValue(new Error("connection terminated"))

    await expect(
      one({
        workspaceId: "ws-1",
        contactId: "c-1",
        provider: "telegram",
        error: { message: "boom", httpCode: "400" },
      }),
    ).rejects.toThrow("connection terminated")
    expect(values).toHaveBeenCalledTimes(1)
  })

  it("does not retry when there was no contactId to drop", async () => {
    const { one } = await loadHandler()
    values.mockRejectedValue(new Error("db down"))

    await expect(
      one({
        workspaceId: "ws-1",
        provider: "telegram",
        error: { message: "boom", httpCode: "400" },
      }),
    ).rejects.toThrow("db down")
    expect(values).toHaveBeenCalledTimes(1)
  })
  it("writes a multi-entry job as one insert, not one per entry", async () => {
    const { batch } = await loadHandler()

    await batch([
      entry({ provider: "messenger" }),
      entry({ provider: "whatsapp" }),
      entry({ provider: "telegram" }),
    ])

    expect(values).toHaveBeenCalledTimes(1)
    expect(values).toHaveBeenCalledWith([
      expect.objectContaining({ action: "messenger" }),
      expect.objectContaining({ action: "whatsapp" }),
      expect.objectContaining({ action: "telegram" }),
    ])
  })

  it("falls back to per-row inserts so one deleted contact cannot drop the batch", async () => {
    const { batch } = await loadHandler()
    values
      // The all-or-nothing batch insert trips on the second entry's contact.
      .mockRejectedValueOnce(foreignKeyViolation())
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(foreignKeyViolation())
      .mockResolvedValue(undefined)

    await batch([
      entry({ contactId: "live-contact" }),
      entry({ contactId: "deleted-contact" }),
    ])

    // batch, row 1, row 2, row 2 without its contact
    expect(values).toHaveBeenCalledTimes(4)
    expect(values).toHaveBeenLastCalledWith(
      expect.objectContaining({ contactId: null }),
    )
  })

  it("writes the rows it can before rethrowing a genuine failure", async () => {
    const { batch } = await loadHandler()
    values
      .mockRejectedValueOnce(new Error("batch failed"))
      .mockResolvedValueOnce(undefined)
      .mockRejectedValue(new Error("db down"))

    await expect(batch([entry(), entry({ contactId: "c-2" })])).rejects.toThrow(
      "db down",
    )
    // The healthy row still landed rather than waiting on the retry.
    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId: "ws-1" }),
    )
  })

  it("does nothing for an empty batch", async () => {
    const { batch } = await loadHandler()

    await batch([])

    expect(values).not.toHaveBeenCalled()
  })
})
