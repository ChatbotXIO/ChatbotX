import { describe, expect, test } from "vitest"
import {
  isRetryableMetaConversionsStatus,
  MetaConversionsException,
} from "../src/exception"

describe("Meta Conversions error classification", () => {
  test("classifies only retry-safe HTTP statuses as retryable", () => {
    expect(isRetryableMetaConversionsStatus(408)).toBe(true)
    expect(isRetryableMetaConversionsStatus(409)).toBe(true)
    expect(isRetryableMetaConversionsStatus(429)).toBe(true)
    expect(isRetryableMetaConversionsStatus(500)).toBe(true)
    expect(isRetryableMetaConversionsStatus(504)).toBe(true)
    expect(isRetryableMetaConversionsStatus(400)).toBe(false)
    expect(isRetryableMetaConversionsStatus(403)).toBe(false)
  })

  test("stores retryable classification on the typed exception", () => {
    const retryableError = new MetaConversionsException({
      httpStatusCode: 429,
      message: "Rate limited",
    })
    const terminalError = new MetaConversionsException({
      httpStatusCode: 400,
      message: "Invalid parameter",
    })

    expect(retryableError.retryable).toBe(true)
    expect(terminalError.retryable).toBe(false)
  })
})
