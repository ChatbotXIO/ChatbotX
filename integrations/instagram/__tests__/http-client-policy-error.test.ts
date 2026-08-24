import { beforeEach, describe, expect, test, vi } from "vitest"
import { InstagramAPIException, rescue } from "../src/exception"
import { isExpectedPolicyError, logChannelError } from "../src/lib/http-client"
import { logger } from "../src/lib/logger"

vi.mock("../src/lib/logger", () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}))

beforeEach(() => {
  vi.clearAllMocks()
})

describe("isExpectedPolicyError", () => {
  test("code 230 (user consent required) is whitelisted", () => {
    expect(isExpectedPolicyError({ code: 230 })).toBe(true)
  })

  test("code 100 + subcode 33 (object does not exist) is whitelisted", () => {
    expect(isExpectedPolicyError({ code: 100, subCode: 33 })).toBe(true)
  })

  test("code 100 without subcode 33 is NOT whitelisted", () => {
    expect(isExpectedPolicyError({ code: 100, subCode: 1 })).toBe(false)
    expect(isExpectedPolicyError({ code: 100 })).toBe(false)
  })

  test("string-encoded codes are normalized", () => {
    expect(isExpectedPolicyError({ code: "230" })).toBe(true)
    expect(isExpectedPolicyError({ code: "100", subCode: "33" })).toBe(true)
  })

  test("genuine errors are not whitelisted", () => {
    expect(isExpectedPolicyError({ code: 190 })).toBe(false)
    expect(isExpectedPolicyError({})).toBe(false)
  })
})

describe("logChannelError", () => {
  test("logs an expected policy error (code 230) at warn, not error", () => {
    logChannelError(
      { httpStatusCode: 400, code: 230, message: "User consent is required" },
      { url: "https://graph.instagram.com/v1/123", method: "GET" },
    )

    expect(logger.warn).toHaveBeenCalledTimes(1)
    expect(logger.error).not.toHaveBeenCalled()
  })

  test("logs code 100 subcode 33 at warn", () => {
    logChannelError({ httpStatusCode: 400, code: 100, subCode: 33 }, {})

    expect(logger.warn).toHaveBeenCalledTimes(1)
    expect(logger.error).not.toHaveBeenCalled()
  })

  test("logs a genuine error at error, not warn", () => {
    logChannelError(
      { httpStatusCode: 500, code: 2, message: "Service unavailable" },
      {},
    )

    expect(logger.error).toHaveBeenCalledTimes(1)
    expect(logger.warn).not.toHaveBeenCalled()
  })

  test("strips all query parameters from the logged request URL", () => {
    logChannelError(
      { httpStatusCode: 400, code: 230, message: "User consent is required" },
      {
        url: "https://graph.instagram.com/v1/123?access_token=secret&fields=id",
        method: "GET",
      },
    )

    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        url: "https://graph.instagram.com/v1/123",
        method: "GET",
      }),
      expect.any(String),
    )
    const [payload] = vi.mocked(logger.warn).mock.calls[0] ?? []
    expect(JSON.stringify(payload)).not.toContain("access_token")
    expect(JSON.stringify(payload)).not.toContain("secret")
  })
})

describe("rescue logging", () => {
  test("does not log a client-origin API exception a second time", async () => {
    const error = new InstagramAPIException(
      "Expected policy error",
      400,
      230,
      undefined,
      undefined,
      new Error("HTTP failure"),
    )

    await expect(
      rescue("me", () => Promise.reject(error)),
    ).rejects.toBeInstanceOf(InstagramAPIException)

    expect(logger.error).not.toHaveBeenCalled()
  })

  test("logs a manually constructed API exception without an origin", async () => {
    const error = new InstagramAPIException("Manual API failure", 400, 2)

    await expect(
      rescue("me", () => Promise.reject(error)),
    ).rejects.toBeInstanceOf(InstagramAPIException)

    expect(logger.error).toHaveBeenCalledTimes(1)
  })

  test("still logs non-client response transform errors", async () => {
    await expect(
      rescue("me", () => Promise.reject(new Error("Transform failed"))),
    ).rejects.toBeInstanceOf(InstagramAPIException)

    expect(logger.error).toHaveBeenCalledTimes(1)
  })
})
