import {
  ChannelError,
  ChannelErrorCategory,
  ChannelErrorReason,
  SdkException,
} from "@chatbotx.io/sdk"
import { describe, expect, it } from "vitest"
import { classifyChannelErrorForScan } from "../src/integration/handlers/contact-scan/graph-error"

// The classifier owns no provider codes: it reads what the channel's mapper
// decided. A stub mapper makes each decision observable on its own.
const mapperReturning =
  (
    category: ChannelErrorCategory,
    extra: { reason?: ChannelErrorReason; httpStatusCode?: number } = {},
  ) =>
  () =>
    new ChannelError("mapped", category, extra)

const classify = (
  error: unknown,
  category: ChannelErrorCategory,
  extra: { reason?: ChannelErrorReason; httpStatusCode?: number } = {},
) =>
  classifyChannelErrorForScan({
    error,
    mapToChannelError: mapperReturning(category, extra),
  })

describe("classifyChannelErrorForScan", () => {
  it("a RATE_LIMITED category is rateLimited", () => {
    expect(classify(new Error("x"), ChannelErrorCategory.RATE_LIMITED)).toBe(
      "rateLimited",
    )
  })

  it("the rate_limited reason alone (no category) is rateLimited", () => {
    expect(
      classify(new Error("x"), ChannelErrorCategory.UNKNOWN, {
        reason: ChannelErrorReason.RATE_LIMITED,
      }),
    ).toBe("rateLimited")
  })

  it("a bare HTTP 429 is rateLimited even when the mapper knows no code", () => {
    expect(
      classify(new Error("x"), ChannelErrorCategory.UNKNOWN, {
        httpStatusCode: 429,
      }),
    ).toBe("rateLimited")
  })

  it("a network failure category is retryable", () => {
    expect(classify(new Error("x"), ChannelErrorCategory.NETWORK_ERROR)).toBe(
      "retryable",
    )
  })

  it("a 5xx SdkException is retryable even if the mapper says unknown", () => {
    expect(
      classify(
        new SdkException("graph", "code", 503),
        ChannelErrorCategory.UNKNOWN,
      ),
    ).toBe("retryable")
  })

  it("AUTH_FAILED is tokenInvalid", () => {
    expect(classify(new Error("x"), ChannelErrorCategory.AUTH_FAILED)).toBe(
      "tokenInvalid",
    )
  })

  it("PERMISSION_DENIED is graphPermission", () => {
    expect(
      classify(new Error("x"), ChannelErrorCategory.PERMISSION_DENIED),
    ).toBe("graphPermission")
  })

  it("anything else is unknown", () => {
    expect(classify(new Error("x"), ChannelErrorCategory.UNKNOWN)).toBe(
      "unknown",
    )
    expect(classify(null, ChannelErrorCategory.PAYLOAD_INVALID)).toBe("unknown")
  })

  it("a rate limit wins over a retryable status", () => {
    expect(
      classify(
        new SdkException("graph", 4, 500),
        ChannelErrorCategory.RATE_LIMITED,
      ),
    ).toBe("rateLimited")
  })

  describe("request timeouts (the shape that used to fail a whole scan run)", () => {
    const timeoutError = (): Error =>
      Object.assign(new Error("Request timed out: GET /conversations"), {
        name: "TimeoutError",
      })

    it("a wrapped timeout (stamped 400 by the integration) is retryable, not unknown", () => {
      const wrapped = new SdkException(
        "Request timed out",
        "messengerError",
        400,
      )
      wrapped.setOriginError(timeoutError())
      expect(classify(wrapped, ChannelErrorCategory.UNKNOWN)).toBe("retryable")
    })

    it("a bare, never-wrapped timeout is retryable", () => {
      expect(classify(timeoutError(), ChannelErrorCategory.UNKNOWN)).toBe(
        "retryable",
      )
    })
  })
})
