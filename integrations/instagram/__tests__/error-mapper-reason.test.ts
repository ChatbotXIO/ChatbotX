import {
  ChannelErrorCategory,
  ChannelErrorReason,
  isAccountSendBlocked,
  isRateLimited,
} from "@chatbotx.io/sdk"
import { describe, expect, test } from "vitest"
import { InstagramException } from "../src/exception"
import { mapToChannelError } from "../src/lib/error-mapper"

describe("instagram error-mapper account send-block reason", () => {
  test("code 100 + subcode 2534029 is account_policy_blocked", () => {
    const mapped = mapToChannelError(
      new InstagramException("blocked", 400, 100, 2_534_029),
    )
    expect(mapped.reason).toBe(ChannelErrorReason.ACCOUNT_POLICY_BLOCKED)
    expect(isAccountSendBlocked(mapped)).toBe(true)
    expect(mapped.category).toBe(ChannelErrorCategory.PAYLOAD_INVALID)
  })

  test("code 100 with another subcode has no reason", () => {
    const mapped = mapToChannelError(
      new InstagramException("bad param", 400, 100, 33),
    )
    expect(mapped.reason).toBeUndefined()
  })

  test("subcode 2534029 under another code has no reason", () => {
    const mapped = mapToChannelError(
      new InstagramException("other", 400, 200, 2_534_029),
    )
    expect(mapped.reason).toBeUndefined()
  })
})

describe("instagram error-mapper rate-limit codes", () => {
  test.each([
    4, 17, 613,
  ])("code %i keeps the RATE_LIMITED category and carries the reason", (code) => {
    const mapped = mapToChannelError(new InstagramException("limit", 429, code))
    expect(mapped.category).toBe(ChannelErrorCategory.RATE_LIMITED)
    expect(mapped.reason).toBe(ChannelErrorReason.RATE_LIMITED)
    expect(isRateLimited(mapped)).toBe(true)
  })

  test.each([
    80_002,
  ])("code %i is rate limited by reason only, so sends keep their category", (code) => {
    const mapped = mapToChannelError(new InstagramException("limit", 400, code))
    expect(isRateLimited(mapped)).toBe(true)
    expect(mapped.reason).toBe(ChannelErrorReason.RATE_LIMITED)
    expect(mapped.category).not.toBe(ChannelErrorCategory.RATE_LIMITED)
  })

  test("an unrelated code is not rate limited", () => {
    const mapped = mapToChannelError(new InstagramException("bad", 400, 100))
    expect(isRateLimited(mapped)).toBe(false)
  })
})
