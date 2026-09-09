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
})
