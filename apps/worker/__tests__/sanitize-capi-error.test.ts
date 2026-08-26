import { describe, expect, test } from "vitest"
import { sanitizeCapiError } from "../src/integration/handlers/meta-conversions/sanitize-capi-error"

describe("sanitizeCapiError", () => {
  test("reduces a plain Error to message only", () => {
    expect(sanitizeCapiError(new Error("invalid token"))).toEqual({
      message: "invalid token",
    })
  })

  test("includes a string/number code when present on the error", () => {
    const withCode = Object.assign(new Error("rate limited"), { code: 429 })
    expect(sanitizeCapiError(withCode)).toEqual({
      message: "rate limited",
      code: 429,
    })
  })

  test("NEVER includes any other own-enumerable property of the error (e.g. origin carrying an Authorization header)", () => {
    const sensitiveOrigin = {
      request: {
        headers: { Authorization: "Bearer super-secret-manual-capi-token" },
      },
    }
    const dangerousError = Object.assign(new Error("Graph API rejected"), {
      code: "OAuthException",
      subCode: 190,
      origin: sensitiveOrigin,
      contact: { email: "user@example.com", phoneNumber: "+15551234567" },
    })

    const sanitized = sanitizeCapiError(dangerousError)

    expect(sanitized).toEqual({
      message: "Graph API rejected",
      code: "OAuthException",
    })

    const serialized = JSON.stringify(sanitized)
    expect(serialized).not.toContain("super-secret-manual-capi-token")
    expect(serialized).not.toContain("Authorization")
    expect(serialized).not.toContain("user@example.com")
    expect(serialized).not.toContain("+15551234567")
    expect(serialized).not.toContain("subCode")
    expect(serialized).not.toContain("origin")
  })

  test("handles a non-Error thrown value without throwing", () => {
    expect(sanitizeCapiError("plain string failure")).toEqual({
      message: "plain string failure",
    })
    expect(sanitizeCapiError({ some: "object" })).toEqual({
      message: "Unknown error",
    })
    expect(sanitizeCapiError(undefined)).toEqual({ message: "Unknown error" })
  })

  test("omits code when the error's code is neither a string nor a number", () => {
    const withObjectCode = Object.assign(new Error("weird"), {
      code: { nested: true },
    })
    expect(sanitizeCapiError(withObjectCode)).toEqual({ message: "weird" })
  })
})
