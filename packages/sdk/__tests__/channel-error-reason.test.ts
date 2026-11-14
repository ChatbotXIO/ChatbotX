import { describe, expect, test } from "vitest"
import {
  ChannelError,
  ChannelErrorCategory,
  ChannelErrorReason,
  isAccountSendBlocked,
  isRateLimited,
  ThreadControlTakeRefusedError,
} from "../src"
import { parsedErrorSchema } from "../src/lib/schemas"

describe("ChannelError reason", () => {
  test("survives getErrorData and parsedErrorSchema", async () => {
    const error = new ChannelError("blocked", ChannelErrorCategory.UNKNOWN, {
      code: 2022,
      reason: ChannelErrorReason.ACCOUNT_POLICY_BLOCKED,
    })

    const data = await error.getErrorData()

    expect(data.reason).toBe(ChannelErrorReason.ACCOUNT_POLICY_BLOCKED)
    expect(parsedErrorSchema.parse(data).reason).toBe(
      ChannelErrorReason.ACCOUNT_POLICY_BLOCKED,
    )
  })

  test("is absent when not assigned", async () => {
    const error = new ChannelError("x", ChannelErrorCategory.UNKNOWN)
    expect((await error.getErrorData()).reason).toBeUndefined()
  })

  test("survives ThreadControlTakeRefusedError.fromChannelError", () => {
    const origin = new ChannelError(
      "x",
      ChannelErrorCategory.PERMISSION_DENIED,
      {
        reason: ChannelErrorReason.ACCOUNT_SEND_RESTRICTED,
      },
    )

    expect(ThreadControlTakeRefusedError.fromChannelError(origin).reason).toBe(
      ChannelErrorReason.ACCOUNT_SEND_RESTRICTED,
    )
  })
})

describe("reason predicates", () => {
  test("isAccountSendBlocked covers both account reasons only", () => {
    expect(
      isAccountSendBlocked({
        reason: ChannelErrorReason.ACCOUNT_POLICY_BLOCKED,
      }),
    ).toBe(true)
    expect(
      isAccountSendBlocked({
        reason: ChannelErrorReason.ACCOUNT_SEND_RESTRICTED,
      }),
    ).toBe(true)
    expect(
      isAccountSendBlocked({ reason: ChannelErrorReason.RATE_LIMITED }),
    ).toBe(false)
    expect(isAccountSendBlocked({})).toBe(false)
  })

  test("isRateLimited accepts category or reason", () => {
    expect(isRateLimited({ category: ChannelErrorCategory.RATE_LIMITED })).toBe(
      true,
    )
    expect(isRateLimited({ reason: ChannelErrorReason.RATE_LIMITED })).toBe(
      true,
    )
    expect(isRateLimited({ category: ChannelErrorCategory.UNKNOWN })).toBe(
      false,
    )
  })
})
