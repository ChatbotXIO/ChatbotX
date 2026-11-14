import {
  ChannelErrorCategory,
  ChannelErrorReason,
  isAccountSendBlocked,
} from "@chatbotx.io/sdk"
import { describe, expect, test } from "vitest"
import { WhatsappException } from "../src/exception"
import { mapToChannelError } from "../src/lib/error-mapper"

describe("whatsapp error-mapper account send-block reason", () => {
  test("code 368 is account_policy_blocked, category unchanged", () => {
    const mapped = mapToChannelError(new WhatsappException("blocked", 400, 368))
    expect(mapped.reason).toBe(ChannelErrorReason.ACCOUNT_POLICY_BLOCKED)
    expect(isAccountSendBlocked(mapped)).toBe(true)
    expect(mapped.category).toBe(ChannelErrorCategory.PERMISSION_DENIED)
  })

  test("code 131064 is account_send_restricted", () => {
    const mapped = mapToChannelError(
      new WhatsappException("limit", 400, 131_064),
    )
    expect(mapped.reason).toBe(ChannelErrorReason.ACCOUNT_SEND_RESTRICTED)
  })

  test("code 131031 deliberately has no reason", () => {
    const mapped = mapToChannelError(
      new WhatsappException("locked", 400, 131_031),
    )
    expect(mapped.reason).toBeUndefined()
  })

  test("recipient-level code 131049 has no reason", () => {
    const mapped = mapToChannelError(
      new WhatsappException("ecosystem", 400, 131_049),
    )
    expect(mapped.reason).toBeUndefined()
  })
})
