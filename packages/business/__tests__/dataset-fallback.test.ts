import { SdkException } from "@chatbotx.io/sdk"
import { describe, expect, test, vi } from "vitest"
import {
  createDatasetWithFallback,
  isMetaAuthorizationError,
} from "../src/meta-conversions/dataset-fallback"

// Mirrors `MetaConversionsException` (extends Error, sets code/httpStatusCode
// as own fields) so the detector is exercised against a real class instance,
// not just a plain object — guarding against exception-shape drift.
class MetaLikeError extends Error {
  code: number
  httpStatusCode: number

  constructor(code: number, httpStatusCode: number) {
    super(`(#${code})`)
    this.code = code
    this.httpStatusCode = httpStatusCode
  }
}

describe("isMetaAuthorizationError", () => {
  test.each([
    10, 100, 190, 200,
  ])("treats Meta error code %i as an authorization error", (code) => {
    expect(isMetaAuthorizationError({ code })).toBe(true)
  })

  test("treats a numeric-string code as an authorization error", () => {
    expect(isMetaAuthorizationError({ code: "100" })).toBe(true)
  })

  test.each([
    401, 403,
  ])("treats HTTP %i as an authorization error", (status) => {
    expect(isMetaAuthorizationError({ httpStatusCode: status })).toBe(true)
  })

  test("ignores non-authorization codes and statuses", () => {
    expect(isMetaAuthorizationError({ code: 1, httpStatusCode: 400 })).toBe(
      false,
    )
    expect(isMetaAuthorizationError({ httpStatusCode: 500 })).toBe(false)
  })

  test("ignores non-object errors", () => {
    expect(isMetaAuthorizationError(null)).toBe(false)
    expect(isMetaAuthorizationError("boom")).toBe(false)
    expect(isMetaAuthorizationError(undefined)).toBe(false)
  })

  test("classifies real exception class instances by their code/httpStatusCode", () => {
    // WhatsApp path: WhatsappConversionsApiException -> WhatsappException ->
    // SdkException, which stores code/httpStatusCode. A #100 is an auth error;
    // a 429 rate limit is not.
    expect(isMetaAuthorizationError(new SdkException("(#100)", 100, 400))).toBe(
      true,
    )
    expect(
      isMetaAuthorizationError(new SdkException("rate limited", 4, 429)),
    ).toBe(false)

    // Meta Conversions path: exception extends Error with its own fields.
    expect(isMetaAuthorizationError(new MetaLikeError(190, 400))).toBe(true)
    expect(isMetaAuthorizationError(new MetaLikeError(1, 400))).toBe(false)
  })
})

const authError = Object.assign(new Error("(#100) Missing Permission"), {
  code: 100,
  httpStatusCode: 400,
})

describe("createDatasetWithFallback", () => {
  test("returns the primary result without retrying on success", async () => {
    const create = vi.fn().mockResolvedValue("dataset-1")

    await expect(
      createDatasetWithFallback({
        primaryToken: "primary",
        fallbackToken: "fallback",
        create,
      }),
    ).resolves.toBe("dataset-1")

    expect(create).toHaveBeenCalledTimes(1)
    expect(create).toHaveBeenCalledWith("primary")
  })

  test("retries once with the fallback token on an authorization error", async () => {
    const create = vi
      .fn()
      .mockRejectedValueOnce(authError)
      .mockResolvedValueOnce("dataset-1")

    await expect(
      createDatasetWithFallback({
        primaryToken: "primary",
        fallbackToken: "fallback",
        create,
      }),
    ).resolves.toBe("dataset-1")

    expect(create).toHaveBeenNthCalledWith(1, "primary")
    expect(create).toHaveBeenNthCalledWith(2, "fallback")
  })

  test("does not retry when there is no fallback token", async () => {
    const create = vi.fn().mockRejectedValue(authError)

    await expect(
      createDatasetWithFallback({
        primaryToken: "primary",
        fallbackToken: null,
        create,
      }),
    ).rejects.toBe(authError)

    expect(create).toHaveBeenCalledTimes(1)
  })

  test("does not retry when the fallback equals the primary token", async () => {
    const create = vi.fn().mockRejectedValue(authError)

    await expect(
      createDatasetWithFallback({
        primaryToken: "same",
        fallbackToken: "same",
        create,
      }),
    ).rejects.toBe(authError)

    expect(create).toHaveBeenCalledTimes(1)
  })

  test("does not retry on a non-authorization error", async () => {
    const transient = Object.assign(new Error("rate limited"), {
      code: 4,
      httpStatusCode: 429,
    })
    const create = vi.fn().mockRejectedValue(transient)

    await expect(
      createDatasetWithFallback({
        primaryToken: "primary",
        fallbackToken: "fallback",
        create,
      }),
    ).rejects.toBe(transient)

    expect(create).toHaveBeenCalledTimes(1)
  })

  test("propagates the fallback error when both attempts fail", async () => {
    const fallbackError = Object.assign(new Error("(#100) again"), {
      code: 100,
      httpStatusCode: 400,
    })
    const create = vi
      .fn()
      .mockRejectedValueOnce(authError)
      .mockRejectedValueOnce(fallbackError)

    await expect(
      createDatasetWithFallback({
        primaryToken: "primary",
        fallbackToken: "fallback",
        create,
      }),
    ).rejects.toBe(fallbackError)

    expect(create).toHaveBeenCalledTimes(2)
  })
})
