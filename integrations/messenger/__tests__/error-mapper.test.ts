import { ChannelErrorCategory } from "@chatbotx.io/sdk"
import { describe, expect, test } from "vitest"
import { MessengerException } from "../src/exception"
import {
  isDisconnectSafeError,
  mapToChannelError,
} from "../src/lib/error-mapper"

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

describe("messenger error-mapper isDisconnectSafeError", () => {
  test("code 100 'App is not installed' (no subcode) is safe to disconnect", () => {
    const exc = new MessengerException(
      "(#100) App is not installed: 419370077795677",
      400,
      100,
      null,
      "OAuthException",
    )
    expect(isDisconnectSafeError(exc)).toBe(true)
  })

  test("code 100 + subcode 33 (object does not exist) is safe to disconnect", () => {
    const exc = new MessengerException(
      "Unsupported get request. Object with ID '1' does not exist",
      400,
      100,
      33,
      "GraphMethodException",
    )
    expect(isDisconnectSafeError(exc)).toBe(true)
  })

  test("code 803 (alias does not exist) is safe to disconnect", () => {
    const exc = new MessengerException(
      "(#803) Some of the aliases you requested do not exist: 1",
      404,
      803,
    )
    expect(isDisconnectSafeError(exc)).toBe(true)
  })

  test.each([
    10, 200, 210,
  ])("permission-lost code %i is safe to disconnect", (code) => {
    const exc = new MessengerException("Permissions error", 403, code)
    expect(isDisconnectSafeError(exc)).toBe(true)
  })

  test("revoked page token (190 + subcode 458) stays safe to disconnect", () => {
    const exc = new MessengerException(
      "Error validating access token",
      401,
      190,
      458,
      "OAuthException",
    )
    expect(isDisconnectSafeError(exc)).toBe(true)
  })

  test("code 100 with an unrelated message is NOT safe to disconnect", () => {
    const exc = new MessengerException("(#100) Invalid parameter", 400, 100)
    expect(isDisconnectSafeError(exc)).toBe(false)
  })

  test.each([
    1, 2, 4, 17, 32, 613,
  ])("transient code %i is NOT safe to disconnect", (code) => {
    const exc = new MessengerException("Transient", 500, code)
    expect(isDisconnectSafeError(exc)).toBe(false)
  })

  test("code 190 without a subcode is NOT safe to disconnect", () => {
    const exc = new MessengerException(
      "Bad token",
      401,
      190,
      null,
      "OAuthException",
    )
    expect(isDisconnectSafeError(exc)).toBe(false)
  })

  test("non-Messenger errors are NOT safe to disconnect", () => {
    expect(isDisconnectSafeError(new Error("boom"))).toBe(false)
    expect(isDisconnectSafeError(undefined)).toBe(false)
  })
})
