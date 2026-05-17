import { ChannelErrorCategory } from "@chatbotx.io/sdk"
import { describe, expect, test } from "vitest"
import { MessengerException } from "../src/exception"
import { mapToChannelError } from "../src/lib/error-mapper"

describe("messenger error-mapper USER_BLOCKED detection", () => {
  test("code 551 maps to USER_BLOCKED", () => {
    const exc = new MessengerException(
      "This person isn't available right now",
      400,
      551,
    )
    const mapped = mapToChannelError(exc)
    expect(mapped.category).toBe(ChannelErrorCategory.USER_BLOCKED)
    expect(mapped.isPermanent).toBe(true)
    expect(mapped.isRetryable).toBe(false)
  })

  test("code 200 + subcode 1545041 maps to USER_BLOCKED", () => {
    const exc = new MessengerException(
      "User opted out of messages",
      403,
      200,
      1_545_041,
    )
    const mapped = mapToChannelError(exc)
    expect(mapped.category).toBe(ChannelErrorCategory.USER_BLOCKED)
  })

  test("code 200 without USER_BLOCKED subcode falls through to PERMISSION_DENIED", () => {
    const exc = new MessengerException("Permission error", 403, 200)
    const mapped = mapToChannelError(exc)
    expect(mapped.category).toBe(ChannelErrorCategory.PERMISSION_DENIED)
  })

  test("USER_BLOCKED error surfaces category in getErrorData", async () => {
    const exc = new MessengerException("blocked", 400, 551)
    const mapped = mapToChannelError(exc)
    const data = await mapped.getErrorData()
    expect(data.category).toBe("user_blocked")
    expect(data.isPermanent).toBe(true)
  })
})
