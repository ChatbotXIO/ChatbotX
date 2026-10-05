import { ChannelErrorCategory } from "@chatbotx.io/sdk"
import { describe, expect, test } from "vitest"
import { isRevokedTokenError, mapToChannelError } from "../src/lib/error-mapper"
import { ZaloException } from "../src/lib/exception"

describe("zalo error-mapper USER_BLOCKED detection", () => {
  test("code -216 maps to USER_BLOCKED", () => {
    const exc = new ZaloException("User blocked OA", 400, -216)
    const mapped = mapToChannelError(exc)
    expect(mapped.category).toBe(ChannelErrorCategory.USER_BLOCKED)
    expect(mapped.isPermanent).toBe(true)
  })

  test("code -139 maps to USER_BLOCKED", () => {
    const exc = new ZaloException("Refused template", 400, -139)
    const mapped = mapToChannelError(exc)
    expect(mapped.category).toBe(ChannelErrorCategory.USER_BLOCKED)
  })
})

describe("zalo revoked token detection", () => {
  test("recognizes the invalid access token code", () => {
    expect(
      isRevokedTokenError(new ZaloException("Invalid token", 400, -124)),
    ).toBe(true)
  })

  test("does not treat unrelated provider failures as revoked", () => {
    expect(isRevokedTokenError(new ZaloException("Unavailable", 503, -1))).toBe(
      false,
    )
  })
})
