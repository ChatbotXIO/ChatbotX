import { SdkException } from "@chatbotx.io/sdk"
import { describe, expect, it } from "vitest"
import { isRetryable } from "../src/integration/handlers/shared/http-retry"

describe("isRetryable", () => {
  describe("wrapped SdkException (flat httpStatusCode — the shape Messenger/Instagram rescue() throws)", () => {
    it("retries a 429", () => {
      expect(isRetryable(new SdkException("rate limited", 4, 429))).toBe(true)
    })

    it("retries a 500", () => {
      expect(isRetryable(new SdkException("server error", 1, 500))).toBe(true)
    })

    it("retries a 503", () => {
      expect(isRetryable(new SdkException("unavailable", 1, 503))).toBe(true)
    })

    it("does not retry a 400 (the default/permanent case)", () => {
      expect(isRetryable(new SdkException("bad request", 100, 400))).toBe(false)
    })

    it("does not retry a 190 OAuth token error (403)", () => {
      expect(isRetryable(new SdkException("token expired", 190, 403))).toBe(
        false,
      )
    })
  })

  describe("raw ky-style HTTP error (response.status)", () => {
    it("retries a 429", () => {
      expect(isRetryable({ response: { status: 429 } })).toBe(true)
    })

    it("retries a 502", () => {
      expect(isRetryable({ response: { status: 502 } })).toBe(true)
    })

    it("does not retry a 404", () => {
      expect(isRetryable({ response: { status: 404 } })).toBe(false)
    })
  })

  describe("non-HTTP errors", () => {
    it("does not retry a plain Error", () => {
      expect(isRetryable(new Error("boom"))).toBe(false)
    })

    it("does not retry null/undefined/strings", () => {
      expect(isRetryable(null)).toBe(false)
      expect(isRetryable(undefined)).toBe(false)
      expect(isRetryable("nope")).toBe(false)
    })
  })

  describe("statusless transport failures (timeout / dropped socket)", () => {
    // Spelled out here on purpose instead of importing the implementation's
    // sets: a fixture derived from the same constant can never catch a typo in
    // it. A mis-keyed entry (`EAI_FAIL` for `EAI_AGAIN`) stops matching these
    // literals and fails the suite, instead of silently never retrying that
    // failure mode in production.
    const TIMEOUT_ERROR_NAMES = ["TimeoutError", "AbortError"]
    const TRANSIENT_NETWORK_CODES = [
      "ECONNRESET",
      "ECONNREFUSED",
      "ETIMEDOUT",
      "EPIPE",
      "EAI_AGAIN",
      "UND_ERR_CONNECT_TIMEOUT",
      "UND_ERR_SOCKET",
      "UND_ERR_HEADERS_TIMEOUT",
      "UND_ERR_BODY_TIMEOUT",
    ]

    const named = (name: string): Error =>
      Object.assign(
        new Error("Request timed out: GET /v25.0/1/conversations"),
        { name },
      )

    const coded = (code: string): Error =>
      Object.assign(new Error(`socket failure: ${code}`), { code })

    it.each(TIMEOUT_ERROR_NAMES)("retries a bare %s", (name) => {
      expect(isRetryable(named(name))).toBe(true)
    })

    it.each(
      TIMEOUT_ERROR_NAMES,
    )("retries a wrapped SdkException whose origin error is a %s", (name) => {
      // The real shape: `rescue()` cannot map a timeout to a status, so it
      // stamps the permanent-looking FALLBACK_HTTP_STATUS (400) and keeps
      // the timeout only as `getOriginError()`.
      const wrapped = new SdkException("Request timed out: GET …", 100, 400)
      wrapped.setOriginError(named(name))
      expect(isRetryable(wrapped)).toBe(true)
    })

    it.each(TRANSIENT_NETWORK_CODES)("retries a bare %s", (code) => {
      expect(isRetryable(coded(code))).toBe(true)
    })

    it.each(
      TRANSIENT_NETWORK_CODES,
    )("retries a %s carried as the cause of a fetch TypeError", (code) => {
      expect(
        isRetryable(
          Object.assign(new TypeError("fetch failed"), { cause: coded(code) }),
        ),
      ).toBe(true)
    })

    it("still does not retry a wrapped 400 whose origin error is permanent", () => {
      const wrapped = new SdkException("bad request", 100, 400)
      wrapped.setOriginError(new Error("boom"))
      expect(isRetryable(wrapped)).toBe(false)
    })

    it("does not retry an unrelated socket-looking code", () => {
      expect(isRetryable(coded("ENOTFOUND"))).toBe(false)
    })
  })
})
