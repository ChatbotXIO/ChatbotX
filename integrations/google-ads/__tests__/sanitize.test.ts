import { describe, expect, test } from "vitest"
import { GoogleAdsException } from "../src/exception"
import { sanitizeGoogleAdsError } from "../src/lib/sanitize"

const CLICK_ID = "Cj0KCQiA1234567890abcdef"

describe("sanitizeGoogleAdsError", () => {
  test("redacts a click id Google echoes back inside an error detail", () => {
    const error = new GoogleAdsException({
      httpStatusCode: 400,
      message: `Invalid gclid ${CLICK_ID}`,
      details: [`unparseable ${CLICK_ID}`],
    })

    const result = sanitizeGoogleAdsError(error, { secrets: [CLICK_ID] })

    expect(result.message).not.toContain(CLICK_ID)
    expect(result.httpCode).toBe("400")
  })

  test("redacts bearer and Google access tokens", () => {
    const { message } = sanitizeGoogleAdsError(
      new Error("Authorization: Bearer ya29.A0AbCdEf-gh_ij failed"),
    )

    expect(message).not.toContain("ya29")
    expect(message).not.toContain("A0AbCdEf")
  })

  test("redacts key=value credentials and private keys", () => {
    const { message } = sanitizeGoogleAdsError(
      new Error(
        'gclid=ABCDEF123456 {"developer-token":"dev-secret"} -----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----',
      ),
    )

    expect(message).not.toContain("ABCDEF123456")
    expect(message).not.toContain("dev-secret")
    expect(message).not.toContain("BEGIN PRIVATE KEY")
  })

  test("never throws on a non-error input and truncates long messages", () => {
    const result = sanitizeGoogleAdsError("x".repeat(5000))

    expect(result.message).toHaveLength(1000)
    expect(result.httpCode).toBe("500")
  })

  test("exposes the Google reason", () => {
    const error = new GoogleAdsException({
      httpStatusCode: 403,
      reason: "DEVELOPER_TOKEN_NOT_APPROVED",
      details: [],
    })

    expect(sanitizeGoogleAdsError(error).reason).toBe(
      "DEVELOPER_TOKEN_NOT_APPROVED",
    )
  })

  describe("customer-matching data", () => {
    const DIGEST = "a".repeat(32) + "0123456789abcdef".repeat(2)

    test("redacts a SHA-256 digest, an e-mail address and an E.164 phone", () => {
      const { message } = sanitizeGoogleAdsError(
        new Error(
          `bad identifier ${DIGEST} for Customer.Name+tag@Example.co.uk or +84901234567`,
        ),
      )

      expect(message).not.toContain(DIGEST)
      expect(message).not.toContain("Customer.Name")
      expect(message).not.toContain("Example.co.uk")
      expect(message).not.toContain("+84901234567")
    })

    test("keeps ids that are not matching data readable", () => {
      const transactionId = `gads-v2-123-e-${"b".repeat(32)}`
      const { message } = sanitizeGoogleAdsError(
        new Error(
          `${transactionId} at 2026-10-08T14:30:00+0700 field userData.userIdentifiers[0]`,
        ),
      )

      expect(message).toContain(transactionId)
      expect(message).toContain("+0700")
      expect(message).toContain("userData.userIdentifiers[0]")
    })

    test("scans a very long run without an @ in linear time", () => {
      const longRun = "a".repeat(200_000)
      const startedAt = performance.now()

      const { message } = sanitizeGoogleAdsError(new Error(longRun))

      expect(performance.now() - startedAt).toBeLessThan(500)
      expect(message).toHaveLength(1000)
    })

    test("still redacts an address after a long run of local-part characters", () => {
      const { message } = sanitizeGoogleAdsError(
        new Error(`${"a".repeat(50)} x.y+z@mail.example.com`),
      )

      expect(message).not.toContain("mail.example.com")
    })

    test("does not redact a 64-character run inside a longer token", () => {
      const longer = "c".repeat(70)

      expect(sanitizeGoogleAdsError(new Error(longer)).message).toBe(longer)
    })
  })
})
