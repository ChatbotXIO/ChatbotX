import { SamSegmentationError } from "@chatbotx.io/ai/sam"
import { describe, expect, test } from "vitest"
import {
  ExpectedHeavyStepError,
  isRetryableHeavyError,
} from "../src/heavy/handlers/errors"

/**
 * The SAM client tags each failure with `retryable`/`status`; the heavy worker
 * must read them so only transient Meta failures cost a second paid call.
 */
describe("SAM failures under the heavy retry policy", () => {
  test.each([
    ["HTTP 429", { code: "http_error", retryable: true, status: 429 }, true],
    ["HTTP 503", { code: "http_error", retryable: true, status: 503 }, true],
    ["HTTP 400", { code: "http_error", retryable: false, status: 400 }, false],
    ["HTTP 401", { code: "http_error", retryable: false, status: 401 }, false],
    ["a body read failure", { code: "stream_error", retryable: true }, true],
    ["response.failed", { code: "stream_error", retryable: false }, false],
    ["malformed SSE", { code: "malformed_event", retryable: false }, false],
    ["a non-SSE body", { code: "invalid_response", retryable: false }, false],
    ["an early end", { code: "incomplete", retryable: false }, false],
    ["malformed records", { code: "invalid_output", retryable: false }, false],
  ] as const)("%s is retryable=%s", (_name, options, expected) => {
    expect(
      isRetryableHeavyError(new SamSegmentationError("SAM failed", options)),
    ).toBe(expected)
  })

  test("an explicit retryable flag wins over the HTTP status", () => {
    expect(
      isRetryableHeavyError(
        new SamSegmentationError("SAM failed", {
          code: "http_error",
          retryable: false,
          status: 503,
        }),
      ),
    ).toBe(false)
  })

  test("transport failures without a code stay retryable", () => {
    expect(isRetryableHeavyError(new TypeError("fetch failed"))).toBe(true)
    expect(
      isRetryableHeavyError(new DOMException("deadline", "AbortError")),
    ).toBe(true)
  })

  test("input problems never retry", () => {
    expect(
      isRetryableHeavyError(new ExpectedHeavyStepError("Unsafe image URL")),
    ).toBe(false)
  })
})
