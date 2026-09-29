import {
  ChannelErrorCategory,
  PERMANENT_CATEGORIES,
  RETRYABLE_CATEGORIES,
} from "@chatbotx.io/sdk"
import { describe, expect, test } from "vitest"
import { WhatsappException } from "../src/exception"
import { mapToChannelError } from "../src/lib/error-mapper"

const callingError = (code: number) =>
  new WhatsappException(
    "Business-initiated calling is not available.",
    400,
    code,
    2_593_139,
    // Meta reports calling eligibility as an OAuthException, which the generic
    // OAuth branch would otherwise read as a credential problem.
    "OAuthException",
  )

describe("mapToChannelError — calling eligibility codes", () => {
  test.each([
    [138_013, "business-initiated calling not available"],
    [138_014, "calling not enabled for this number"],
    [138_018, "app not subscribed to the calls webhook field"],
  ])("%i (%s) is PERMISSION_DENIED, not AUTH_FAILED", (code, _description) => {
    expect(mapToChannelError(callingError(code)).category).toBe(
      ChannelErrorCategory.PERMISSION_DENIED,
    )
  })

  test("an OAuthException carrying any other code still maps to AUTH_FAILED", () => {
    expect(mapToChannelError(callingError(190)).category).toBe(
      ChannelErrorCategory.AUTH_FAILED,
    )
  })

  test("code 100 keeps relying on the OAuth branch winning over its own set", () => {
    expect(mapToChannelError(callingError(100)).category).toBe(
      ChannelErrorCategory.AUTH_FAILED,
    )
  })

  test("the new category is permanent and never retried, exactly like the old one", () => {
    for (const category of [
      ChannelErrorCategory.AUTH_FAILED,
      ChannelErrorCategory.PERMISSION_DENIED,
    ]) {
      expect(PERMANENT_CATEGORIES.has(category)).toBe(true)
      expect(RETRYABLE_CATEGORIES.has(category)).toBe(false)
    }
  })
})
