import { describe, expect, test } from "vitest"
import { ChannelError } from "../src/lib/channel-error"
import { ChannelErrorCategory } from "../src/lib/channel-error-codes"

describe("ChannelError.getErrorData", () => {
  test("USER_BLOCKED surfaces category, isPermanent, isRetryable", async () => {
    const err = new ChannelError("blocked", ChannelErrorCategory.USER_BLOCKED, {
      code: 551,
      httpStatusCode: 400,
    })
    const data = await err.getErrorData()
    expect(data.category).toBe("user_blocked")
    expect(data.isPermanent).toBe(true)
    expect(data.isRetryable).toBe(false)
    expect(data.code).toBe(551)
    expect(data.statusCode).toBe(400)
  })

  test("RATE_LIMITED is retryable, not permanent", async () => {
    const err = new ChannelError(
      "slow down",
      ChannelErrorCategory.RATE_LIMITED,
      { code: 429, httpStatusCode: 429 },
    )
    const data = await err.getErrorData()
    expect(data.category).toBe("rate_limited")
    expect(data.isRetryable).toBe(true)
    expect(data.isPermanent).toBe(false)
  })

  test("INVALID_RECIPIENT is permanent, not retryable", async () => {
    const err = new ChannelError(
      "no such user",
      ChannelErrorCategory.INVALID_RECIPIENT,
      { code: 100, httpStatusCode: 400 },
    )
    const data = await err.getErrorData()
    expect(data.category).toBe("invalid_recipient")
    expect(data.isPermanent).toBe(true)
    expect(data.isRetryable).toBe(false)
  })

  test("subCode propagates to subcode field", async () => {
    const err = new ChannelError(
      "opted out",
      ChannelErrorCategory.USER_BLOCKED,
      {
        code: 200,
        subCode: 1_545_041,
        httpStatusCode: 403,
      },
    )
    const data = await err.getErrorData()
    expect(data.subcode).toBe(1_545_041)
    expect(data.category).toBe("user_blocked")
  })
})
