import { AuthException, ChannelErrorCategory } from "@chatbotx.io/sdk"
import { describe, expect, test } from "vitest"
import { LineAPIException } from "../src/exception"
import { mapToChannelError } from "../src/lib/error-mapper"

describe("LINE mapToChannelError", () => {
  test("429 monthly limit is a permanent quota error", () => {
    const err = mapToChannelError(
      new LineAPIException("You have reached your monthly limit.", 429),
    )
    expect(err.category).toBe(ChannelErrorCategory.QUOTA_EXCEEDED)
    expect(err.isRetryable).toBe(false)
  })

  test("other 429 is rate limited", () => {
    const err = mapToChannelError(
      new LineAPIException("Too many requests", 429),
    )
    expect(err.category).toBe(ChannelErrorCategory.RATE_LIMITED)
  })

  test("400 not-a-friend is user blocked", () => {
    const err = mapToChannelError(
      new LineAPIException(
        "The user hasn't added the LINE Official Account as a friend.",
        400,
      ),
    )
    expect(err.category).toBe(ChannelErrorCategory.USER_BLOCKED)
  })

  test("other 400 is payload invalid", () => {
    const err = mapToChannelError(new LineAPIException("Invalid message", 400))
    expect(err.category).toBe(ChannelErrorCategory.PAYLOAD_INVALID)
  })

  test("401 is auth failed", () => {
    expect(mapToChannelError(new LineAPIException("x", 401)).category).toBe(
      ChannelErrorCategory.AUTH_FAILED,
    )
  })

  test("AuthException from lineFetch is auth failed", () => {
    const err = mapToChannelError(
      new AuthException("Authentication failed", "lineAuthError", 401),
    )
    expect(err.category).toBe(ChannelErrorCategory.AUTH_FAILED)
  })

  test("network error", () => {
    const err = mapToChannelError(new TypeError("fetch failed"))
    expect(err.category).toBe(ChannelErrorCategory.NETWORK_ERROR)
  })
})
