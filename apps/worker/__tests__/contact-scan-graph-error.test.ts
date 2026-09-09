import { SdkException } from "@chatbotx.io/sdk"
import { describe, expect, it } from "vitest"
import { classifyGraphSdkError } from "../src/integration/handlers/contact-scan/graph-error"

describe("classifyGraphSdkError", () => {
  describe("flat SdkException fields (the real wrapped-exception shape)", () => {
    it("classifies a 429 httpStatusCode as retryable", () => {
      const error = new SdkException("graph error", "someCode", 429)
      expect(classifyGraphSdkError(error)).toBe("retryable")
    })

    it("classifies a 500 httpStatusCode as retryable", () => {
      const error = new SdkException("graph error", "someCode", 500)
      expect(classifyGraphSdkError(error)).toBe("retryable")
    })

    it("classifies Graph code 4 (app-level rate limit) as retryable without a 429/5xx status", () => {
      const error = new SdkException("graph error", 4, 400)
      expect(classifyGraphSdkError(error)).toBe("retryable")
    })

    it("classifies Graph code 613 (custom rate limit) as retryable", () => {
      const error = new SdkException("graph error", 613, 400)
      expect(classifyGraphSdkError(error)).toBe("retryable")
    })

    it("classifies OAuthException type as tokenInvalid", () => {
      const error = new SdkException(
        "graph error",
        "unrecognized",
        401,
        null,
        "OAuthException",
      )
      expect(classifyGraphSdkError(error)).toBe("tokenInvalid")
    })

    it("classifies Graph code 190 (expired token) as tokenInvalid", () => {
      const error = new SdkException("graph error", 190, 401)
      expect(classifyGraphSdkError(error)).toBe("tokenInvalid")
    })

    it("classifies Graph code 10 (permission denied) as graphPermission", () => {
      const error = new SdkException("graph error", 10, 403)
      expect(classifyGraphSdkError(error)).toBe("graphPermission")
    })

    it("classifies a Graph code in the 200-series permission range as graphPermission", () => {
      const error = new SdkException("graph error", 200, 403)
      expect(classifyGraphSdkError(error)).toBe("graphPermission")
    })

    it("classifies an unrecognized code/status as unknown", () => {
      const error = new SdkException("graph error", 999, 400)
      expect(classifyGraphSdkError(error)).toBe("unknown")
    })
  })

  describe("duck-typed flat fields (not an SdkException instance)", () => {
    it("classifies a plain object with httpStatusCode 429 as retryable", () => {
      const error = { httpStatusCode: 429 }
      expect(classifyGraphSdkError(error)).toBe("retryable")
    })

    it("classifies a plain object with code 190 + OAuthException as tokenInvalid", () => {
      const error = { code: 190, type: "OAuthException" }
      expect(classifyGraphSdkError(error)).toBe("tokenInvalid")
    })
  })

  describe("raw-origin fallback (a never-wrapped shape, or the raw error nested via getOriginError())", () => {
    it("classifies a raw ky-style { response: { status } } object with no flat fields as retryable", () => {
      const error = { response: { status: 503 } }
      expect(classifyGraphSdkError(error)).toBe("retryable")
    })

    it("classifies via getOriginError() when the flat fields alone don't indicate retryable", () => {
      const error = Object.assign(new Error("wrapped"), {
        httpStatusCode: 400,
        code: 999,
        getOriginError: () => ({ response: { status: 503 } }),
      })
      expect(classifyGraphSdkError(error)).toBe("retryable")
    })

    it("does not let a non-retryable getOriginError() override an unrecognized flat shape", () => {
      const error = Object.assign(new Error("wrapped"), {
        httpStatusCode: 400,
        code: 999,
        getOriginError: () => ({ response: { status: 404 } }),
      })
      expect(classifyGraphSdkError(error)).toBe("unknown")
    })
  })

  describe("non-object / unrecognized errors", () => {
    it("classifies a plain Error with no Graph fields as unknown", () => {
      expect(classifyGraphSdkError(new Error("boom"))).toBe("unknown")
    })

    it("classifies null as unknown", () => {
      expect(classifyGraphSdkError(null)).toBe("unknown")
    })

    it("classifies undefined as unknown", () => {
      expect(classifyGraphSdkError(undefined)).toBe("unknown")
    })
  })
})
