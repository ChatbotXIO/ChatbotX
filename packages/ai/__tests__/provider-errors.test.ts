import { APICallError } from "ai"
import { describe, expect, test } from "vitest"
import { isInvalidApiKeyError } from "../src/core/provider-errors"

const apiCallError = (statusCode: number, responseBody?: string) =>
  new APICallError({
    message: "provider rejected the request",
    url: "https://api.example.com/v1/embeddings",
    requestBodyValues: {},
    statusCode,
    responseBody,
  })

describe("isInvalidApiKeyError", () => {
  test.each([401, 403])("is true for a %i from the provider", (statusCode) => {
    expect(isInvalidApiKeyError(apiCallError(statusCode))).toBe(true)
  })

  test("is true for Gemini's 400 that names an invalid key", () => {
    const body = JSON.stringify({
      error: {
        code: 400,
        status: "INVALID_ARGUMENT",
        details: [{ reason: "API_KEY_INVALID" }],
      },
    })

    expect(isInvalidApiKeyError(apiCallError(400, body))).toBe(true)
  })

  test("is false for a 400 about anything else", () => {
    expect(
      isInvalidApiKeyError(apiCallError(400, '{"error":"bad input"}')),
    ).toBe(false)
  })

  test.each([429, 500, 503])("is false for a retryable %i", (statusCode) => {
    expect(isInvalidApiKeyError(apiCallError(statusCode))).toBe(false)
  })

  test("is false for errors that are not provider API calls", () => {
    expect(isInvalidApiKeyError(new Error("Incorrect API key"))).toBe(false)
    expect(isInvalidApiKeyError(undefined)).toBe(false)
  })
})
