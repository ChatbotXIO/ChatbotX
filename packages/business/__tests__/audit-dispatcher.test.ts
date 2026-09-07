import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({ warn: vi.fn() }))

vi.mock("../src/logger", () => ({ logger: { warn: mocks.warn } }))

const { dispatchAuditRecordSafely } = await import("../src/audit/dispatcher")

type GlobalWithAuditDispatcher = typeof globalThis & {
  __chatbotxAuditRecord?: (input: unknown) => Promise<void> | void
}

const globalWithDispatcher = globalThis as GlobalWithAuditDispatcher

describe("dispatchAuditRecordSafely", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    globalWithDispatcher.__chatbotxAuditRecord = undefined
  })

  test("dispatches through the registered recorder and does not log", async () => {
    const recorder = vi.fn().mockResolvedValue(undefined)
    globalWithDispatcher.__chatbotxAuditRecord = recorder

    await dispatchAuditRecordSafely(
      { action: "connect", detail: "connected a new channel" },
      "should not be logged",
    )

    expect(recorder).toHaveBeenCalledWith({
      action: "connect",
      detail: "connected a new channel",
    })
    expect(mocks.warn).not.toHaveBeenCalled()
  })

  test("logs and swallows when the recorder rejects — never rejects itself", async () => {
    globalWithDispatcher.__chatbotxAuditRecord = vi
      .fn()
      .mockRejectedValue(new Error("recorder down"))

    await expect(
      dispatchAuditRecordSafely(
        { action: "connect", detail: "x" },
        "audit dispatch failed after connect",
      ),
    ).resolves.toBeUndefined()

    expect(mocks.warn).toHaveBeenCalledWith(
      { err: expect.any(Error) },
      "audit dispatch failed after connect",
    )
  })

  test("logs and swallows when the recorder throws synchronously", async () => {
    globalWithDispatcher.__chatbotxAuditRecord = vi.fn(() => {
      throw new Error("sync boom")
    })

    await expect(
      dispatchAuditRecordSafely(
        { action: "connect", detail: "x" },
        "audit dispatch failed",
      ),
    ).resolves.toBeUndefined()

    expect(mocks.warn).toHaveBeenCalledOnce()
  })
})
