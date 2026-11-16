import {
  ChannelErrorCategory,
  ChannelErrorReason,
  isAccountSendBlocked,
} from "@chatbotx.io/sdk"
import { describe, expect, test } from "vitest"
import { mapToChannelError } from "../src/lib/error-mapper"
import { ZaloException } from "../src/lib/exception"

describe("zalo error-mapper account send-block reason", () => {
  test("code -1351 is account_policy_blocked", () => {
    const mapped = mapToChannelError(new ZaloException("blocked", 400, -1351))
    expect(mapped.reason).toBe(ChannelErrorReason.ACCOUNT_POLICY_BLOCKED)
    expect(isAccountSendBlocked(mapped)).toBe(true)
  })

  test("code -248 deliberately has no reason", () => {
    const mapped = mapToChannelError(new ZaloException("content", 400, -248))
    expect(mapped.reason).toBeUndefined()
  })

  test("a recipient-level code keeps its category and has no reason", () => {
    const mapped = mapToChannelError(new ZaloException("blocked", 400, -216))
    expect(mapped.category).toBe(ChannelErrorCategory.USER_BLOCKED)
    expect(mapped.reason).toBeUndefined()
  })
})
