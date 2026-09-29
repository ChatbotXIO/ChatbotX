import { HTTPError, type NormalizedOptions } from "ky"
import { beforeEach, describe, expect, test, vi } from "vitest"
import { MessengerAPIException, rescue } from "../src/exception"
import {
  isDataTooLargeGraphError,
  isExpectedPolicyError,
  logChannelError,
  shouldRetryGraphRequest,
} from "../src/lib/http-client"
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

describe("isDataTooLargeGraphError", () => {
  const sentence =
    "Please reduce the amount of data you're asking for, then retry your request"

  test("code 1, no subcode, with Meta's 'reduce the amount of data' sentence", () => {
    expect(isDataTooLargeGraphError({ code: 1, message: sentence })).toBe(true)
    expect(
      isDataTooLargeGraphError({
        code: "1",
        subCode: null,
        message: `(#1) ${sentence}`,
      }),
    ).toBe(true)
  })

  test("generic code 1 ('API Unknown', documented as transient) is not", () => {
    expect(
      isDataTooLargeGraphError({
        code: 1,
        message: "An unknown error occurred",
      }),
    ).toBe(false)
    expect(isDataTooLargeGraphError({ code: 1 })).toBe(false)
  })

  test("a subcode, or any other code, is not", () => {
    expect(
      isDataTooLargeGraphError({ code: 1, subCode: 99, message: sentence }),
    ).toBe(false)
    expect(isDataTooLargeGraphError({ code: 2, message: sentence })).toBe(false)
    expect(isDataTooLargeGraphError({})).toBe(false)
  })
})

// Meta's "Please reduce the amount of data you're asking for" comes back as a
// 5xx, which the client would otherwise retry three times — and the same
// request never succeeds on retry. The only remedy is a smaller page, which
// the caller (`fetchDirectPages`) handles, so the client must give up at once.
describe("shouldRetryGraphRequest", () => {
  const httpError = (status: number, body: unknown) => {
    const error = new HTTPError(
      new Response(JSON.stringify(body), { status }),
      new Request("https://graph.facebook.com/v23.0/me/accounts"),
      {} as NormalizedOptions,
    )
    error.data = body
    return error
  }

  test("refuses to retry a code-1 'reduce the amount of data' 500", async () => {
    const error = httpError(500, {
      error: {
        code: 1,
        message:
          "Please reduce the amount of data you're asking for, then retry your request",
      },
    })

    await expect(
      shouldRetryGraphRequest({ error, retryCount: 1 }),
    ).resolves.toBe(false)
  })

  test("leaves every other failure to ky's default status-code policy", async () => {
    await expect(
      shouldRetryGraphRequest({
        error: httpError(500, { error: { code: 2, message: "Service down" } }),
        retryCount: 1,
      }),
    ).resolves.toBeUndefined()
    // Generic code 1 is Meta's transient "API Unknown": still retried.
    await expect(
      shouldRetryGraphRequest({
        error: httpError(500, {
          error: { code: 1, message: "An unknown error occurred" },
        }),
        retryCount: 1,
      }),
    ).resolves.toBeUndefined()
    await expect(
      shouldRetryGraphRequest({
        error: new Error("socket hang up"),
        retryCount: 1,
      }),
    ).resolves.toBeUndefined()
  })
})

describe("logChannelError", () => {
  test("logs an expected policy error (code 230) at warn, not error", () => {
    logChannelError(
      { httpStatusCode: 400, code: 230, message: "User consent is required" },
      { url: "https://graph.facebook.com/v1/123", method: "GET" },
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
        url: "https://graph.facebook.com/v1/123?access_token=secret&fields=id",
        method: "GET",
      },
    )

    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        url: "https://graph.facebook.com/v1/123",
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
    const error = new MessengerAPIException(
      "Expected policy error",
      400,
      230,
      undefined,
      undefined,
      new Error("HTTP failure"),
    )

    await expect(
      rescue("me", () => Promise.reject(error)),
    ).rejects.toBeInstanceOf(MessengerAPIException)

    expect(logger.error).not.toHaveBeenCalled()
  })

  test("logs a manually constructed API exception without an origin", async () => {
    const error = new MessengerAPIException("Manual API failure", 400, 2)

    await expect(
      rescue("me", () => Promise.reject(error)),
    ).rejects.toBeInstanceOf(MessengerAPIException)

    expect(logger.error).toHaveBeenCalledTimes(1)
  })

  test("still logs non-client response transform errors", async () => {
    await expect(
      rescue("me", () => Promise.reject(new Error("Transform failed"))),
    ).rejects.toBeInstanceOf(MessengerAPIException)

    expect(logger.error).toHaveBeenCalledTimes(1)
  })
})
