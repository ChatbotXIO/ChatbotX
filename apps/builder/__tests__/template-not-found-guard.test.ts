// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"

const { logError } = vi.hoisted(() => ({ logError: vi.fn() }))

vi.mock("@/lib/log", () => ({ logger: { error: logError } }))

const { ChatbotXException } = await import("@chatbotx.io/business/errors")
const { nullAndLogOnError, nullOnNotFound } = await import(
  "../src/features/templates/lib/not-found-guard"
)

const notFound = () => new ChatbotXException("missing", "notFound", 404)

beforeEach(() => vi.clearAllMocks())

describe("nullOnNotFound", () => {
  test("maps only the not-found error to null, without logging it", async () => {
    await expect(nullOnNotFound(Promise.reject(notFound()), "x")).resolves.toBe(
      null,
    )
    expect(logError).not.toHaveBeenCalled()
  })

  test("logs any other failure under the err key and rethrows it", async () => {
    const outage = new Error("db down")

    await expect(
      nullOnNotFound(Promise.reject(outage), "loading failed"),
    ).rejects.toBe(outage)
    expect(logError).toHaveBeenCalledWith({ err: outage }, "loading failed")
  })

  test("passes a value through", async () => {
    await expect(nullOnNotFound(Promise.resolve(7), "x")).resolves.toBe(7)
  })
})

describe("nullAndLogOnError", () => {
  test("returns null for an outage after logging it", async () => {
    const outage = new Error("boom")

    await expect(
      nullAndLogOnError(Promise.reject(outage), "secondary failed"),
    ).resolves.toBe(null)
    expect(logError).toHaveBeenCalledWith({ err: outage }, "secondary failed")
  })

  test("returns null for not-found silently", async () => {
    await expect(
      nullAndLogOnError(Promise.reject(notFound()), "x"),
    ).resolves.toBe(null)
    expect(logError).not.toHaveBeenCalled()
  })
})
