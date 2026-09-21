import { ChannelErrorCategory } from "@chatbotx.io/sdk"
import { describe, expect, test } from "vitest"
import { InstagramException } from "../src/exception"
import {
  isNotThreadOwnerError,
  isRevokedTokenError,
  mapToChannelError,
} from "../src/lib/error-mapper"

// `(#3) Application does not have the capability to make this API call.` — Meta
// sends it as an OAuthException, but it is a capability/endpoint problem, not a
// token problem. Before this was mapped, it fell through to the
// `type === "OAuthException"` fallback and was reported as AUTH_FAILED, which
// pointed operators at a reconnect that could never help.
describe("instagram-facebook error-mapper — code 3 (capability)", () => {
  const capabilityError = () =>
    new InstagramException(
      "(#3) Application does not have the capability to make this API call.",
      400,
      3,
      null,
      "OAuthException",
    )

  test("maps to PERMISSION_DENIED, not AUTH_FAILED", () => {
    const mapped = mapToChannelError(capabilityError())

    expect(mapped.category).toBe(ChannelErrorCategory.PERMISSION_DENIED)
  })

  test("is permanent, so callers never retry it", () => {
    const mapped = mapToChannelError(capabilityError())

    expect(mapped.isPermanent).toBe(true)
    expect(mapped.isRetryable).toBe(false)
  })

  test("is not treated as a revoked token", () => {
    expect(isRevokedTokenError(capabilityError())).toBe(false)
  })
})

describe("instagram-facebook error-mapper — revoked token detection", () => {
  test("code 190 with a revoked subcode is a revoked token", () => {
    const exc = new InstagramException(
      "Error validating access token",
      401,
      190,
      463,
      "OAuthException",
    )

    expect(isRevokedTokenError(exc)).toBe(true)
  })

  // Ambiguous on purpose: Meta also emits bare 190 for transient session
  // problems, and treating those as revoked caused false-positive disconnects.
  test("code 190 without a subcode is not a revoked token", () => {
    const exc = new InstagramException(
      "Error validating access token",
      401,
      190,
      null,
      "OAuthException",
    )

    expect(isRevokedTokenError(exc)).toBe(false)
  })

  test("a non-Instagram error is never a revoked token", () => {
    expect(isRevokedTokenError(new Error("boom"))).toBe(false)
  })
})

// Handover Protocol (s171): the Instagram inbox takes the thread as soon as a
// human replies from the app, and every later Send API call is refused with
// code 200 + error_subcode 2534037 until the thread is taken back.
describe("instagram-facebook error-mapper — not-the-thread-owner detection", () => {
  const notOwner = (subCode: number | null) =>
    new InstagramException(
      "(#100 - 2534037) The action is invalid since it's not the thread owner",
      400,
      200,
      subCode,
      "OAuthException",
    )

  test("code 200 + subcode 2534037 is a handover case", () => {
    expect(isNotThreadOwnerError(notOwner(2_534_037))).toBe(true)
  })

  test("code 200 with another subcode, or none, is not", () => {
    expect(isNotThreadOwnerError(notOwner(1234))).toBe(false)
    expect(isNotThreadOwnerError(notOwner(null))).toBe(false)
  })

  test("a revoked token is not a handover case", () => {
    const exc = new InstagramException(
      "expired",
      401,
      190,
      463,
      "OAuthException",
    )
    expect(isNotThreadOwnerError(exc)).toBe(false)
  })
})
