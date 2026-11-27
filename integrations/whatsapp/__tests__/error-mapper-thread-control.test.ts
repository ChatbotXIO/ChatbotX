import { ChannelErrorCategory } from "@chatbotx.io/sdk"
import { describe, expect, test } from "vitest"
import { WhatsappException } from "../src/exception"
import {
  mapToChannelError,
  THREAD_CONTROL_REJECTION_CODES,
} from "../src/lib/error-mapper"

/**
 * Meta thread-control error table: 131070 "Message failed to send because
 * another app is controlling this thread now." — a Service send without
 * ownership (also on an idle thread). It is an ownership refusal.
 */
const notOwnerSend = (type?: string) =>
  new WhatsappException(
    "Message failed to send because another app is controlling this thread now.",
    400,
    131_070,
    undefined,
    type,
  )

describe("mapToChannelError — conversation routing send rejection", () => {
  test("131070 is a known thread-control rejection code", () => {
    expect(THREAD_CONTROL_REJECTION_CODES.has(131_070)).toBe(true)
  })

  test.each([
    ["OAuthException"],
    [undefined],
  ])("131070 (type %s) is PERMISSION_DENIED, not AUTH_FAILED", (type) => {
    expect(mapToChannelError(notOwnerSend(type)).category).toBe(
      ChannelErrorCategory.PERMISSION_DENIED,
    )
  })
})
