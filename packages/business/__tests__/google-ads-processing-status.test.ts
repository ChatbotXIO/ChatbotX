import type { GoogleAdsRequestStatus } from "@chatbotx.io/integration-google-ads"
import { describe, expect, test } from "vitest"
import {
  classifyRequestStatus,
  isRetryableProcessingReason,
} from "../src/google-ads/processing-status"

const status = (
  requestStatus: string,
  reasons: string[] = [],
): GoogleAdsRequestStatus => ({
  requestStatus,
  recordCount: 1,
  errorCounts: reasons.map((reason) => ({ reason, recordCount: 1 })),
  warningCounts: [],
})

describe("isRetryableProcessingReason", () => {
  test("retries the documented prefixed transient reasons", () => {
    expect(
      isRetryableProcessingReason("PROCESSING_ERROR_REASON_INTERNAL_ERROR"),
    ).toBe(true)
    expect(
      isRetryableProcessingReason("PROCESSING_ERROR_REASON_TOO_RECENT_CLICK"),
    ).toBe(true)
  })

  test("also accepts the unprefixed form", () => {
    expect(isRetryableProcessingReason("INTERNAL_ERROR")).toBe(true)
    expect(isRetryableProcessingReason("TOO_RECENT_CLICK")).toBe(true)
    expect(
      isRetryableProcessingReason(
        "PROCESSING_ERROR_REASON_DESTINATION_TOO_RECENTLY_CREATED",
      ),
    ).toBe(true)
  })

  test("does not retry terminal reasons", () => {
    for (const reason of [
      "PROCESSING_ERROR_REASON_INVALID_GCLID",
      "PROCESSING_ERROR_REASON_EVENT_TOO_OLD",
      "PROCESSING_ERROR_REASON_DUPLICATE_GCLID",
      "PROCESSING_ERROR_REASON_DENIED_CONSENT",
      "PROCESSING_ERROR_REASON_CLICK_NOT_FOUND",
      "PROCESSING_ERROR_REASON_UNSPECIFIED",
      "DEADLINE_EXCEEDED",
      "",
    ]) {
      expect(isRetryableProcessingReason(reason)).toBe(false)
    }
  })
})

describe("classifyRequestStatus", () => {
  test("SUCCESS", () => {
    const success = status("SUCCESS")
    expect(classifyRequestStatus([success])).toEqual({
      kind: "success",
      status: success,
    })
  })

  test("PROCESSING", () => {
    expect(classifyRequestStatus([status("PROCESSING")])).toEqual({
      kind: "processing",
    })
  })

  test("FAILED with only transient reasons is retryable", () => {
    const failed = status("FAILED", [
      "PROCESSING_ERROR_REASON_INTERNAL_ERROR",
      "PROCESSING_ERROR_REASON_TOO_RECENT_CLICK",
    ])
    expect(classifyRequestStatus([failed])).toEqual({
      kind: "failed",
      retryable: true,
      status: failed,
    })
  })

  test("FAILED with any permanent reason is not retryable", () => {
    const failed = status("FAILED", [
      "PROCESSING_ERROR_REASON_INTERNAL_ERROR",
      "PROCESSING_ERROR_REASON_INVALID_GCLID",
    ])
    expect(classifyRequestStatus([failed])).toMatchObject({
      kind: "failed",
      retryable: false,
    })
  })

  test("FAILED with EVENT_TOO_OLD is terminal, not retryable", () => {
    const failed = status("FAILED", ["PROCESSING_ERROR_REASON_EVENT_TOO_OLD"])
    expect(classifyRequestStatus([failed])).toEqual({
      kind: "failed",
      retryable: false,
      status: failed,
    })
  })

  test("FAILED without error counts is not retryable", () => {
    expect(classifyRequestStatus([status("FAILED")])).toMatchObject({
      kind: "failed",
      retryable: false,
    })
  })

  test("PARTIAL_SUCCESS is a failure for a one-event request", () => {
    const partial = status("PARTIAL_SUCCESS", [
      "PROCESSING_ERROR_REASON_INVALID_GCLID",
    ])
    expect(classifyRequestStatus([partial])).toEqual({
      kind: "failed",
      retryable: false,
      status: partial,
    })
  })

  test.each([
    ["bare transaction id", ["DUPLICATE_TRANSACTION_ID"]],
    [
      "prefixed transaction id",
      ["PROCESSING_ERROR_REASON_DUPLICATE_TRANSACTION_ID"],
    ],
    ["bare gclid", ["DUPLICATE_GCLID"]],
    ["prefixed gclid", ["PROCESSING_ERROR_REASON_DUPLICATE_GCLID"]],
    [
      "both kinds mixed bare and prefixed",
      ["DUPLICATE_GCLID", "PROCESSING_ERROR_REASON_DUPLICATE_TRANSACTION_ID"],
    ],
  ])("FAILED with only duplicate reasons (%s) is a duplicate", (_label, reasons) => {
    const failed = status("FAILED", reasons)
    expect(classifyRequestStatus([failed])).toEqual({
      kind: "duplicate",
      status: failed,
    })
    const partial = status("PARTIAL_SUCCESS", reasons)
    expect(classifyRequestStatus([partial])).toEqual({
      kind: "duplicate",
      status: partial,
    })
  })

  test.each([
    ["DENIED_CONSENT", "PROCESSING_ERROR_REASON_DENIED_CONSENT"],
    ["INVALID_CLICK", "INVALID_CLICK"],
    ["INTERNAL_ERROR", "INTERNAL_ERROR"],
  ])("a duplicate mixed with %s keeps the other reason's precedence", (_label, other) => {
    const failed = status("FAILED", ["DUPLICATE_TRANSACTION_ID", other])
    expect(classifyRequestStatus([failed])).toMatchObject({ kind: "failed" })
  })

  test("a SUCCESS status is never a duplicate", () => {
    expect(
      classifyRequestStatus([status("SUCCESS", ["DUPLICATE_GCLID"])]),
    ).toMatchObject({ kind: "success" })
  })

  test("zero entries is unknown", () => {
    expect(classifyRequestStatus([])).toEqual({ kind: "unknown" })
  })

  test("multiple entries is unknown", () => {
    expect(
      classifyRequestStatus([status("SUCCESS"), status("SUCCESS")]),
    ).toEqual({ kind: "unknown" })
  })

  test("an unrecognised status is unknown", () => {
    expect(classifyRequestStatus([status("REQUEST_STATUS_UNKNOWN")])).toEqual({
      kind: "unknown",
    })
  })
})
