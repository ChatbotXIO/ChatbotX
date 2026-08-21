import { describe, expect, test } from "vitest"
import { z } from "zod"
import {
  dateToExpirationTimeMs,
  expirationTimeMsToDate,
  flowValidationCodes,
  isConfiguredExpirationTimeMs,
  isFutureExpirationTimeMs,
  validateLimitedTimeOfferParams,
  type WaTemplateParams,
} from "../src"

describe("expirationTimeMsToDate", () => {
  test("converts a finite epoch-ms number to a Date", () => {
    const date = expirationTimeMsToDate(1_700_000_000_000)
    expect(date).toBeInstanceOf(Date)
    expect(date?.getTime()).toBe(1_700_000_000_000)
  })

  test("returns undefined for undefined, NaN, and non-finite values", () => {
    expect(expirationTimeMsToDate(undefined)).toBeUndefined()
    expect(expirationTimeMsToDate(Number.NaN)).toBeUndefined()
    expect(expirationTimeMsToDate(Number.POSITIVE_INFINITY)).toBeUndefined()
  })

  test("treats the seeded 0 default as unset, never the 1970 epoch", () => {
    expect(expirationTimeMsToDate(0)).toBeUndefined()
    expect(expirationTimeMsToDate(-1)).toBeUndefined()
  })
})

describe("isConfiguredExpirationTimeMs", () => {
  test("true only for finite positive values", () => {
    expect(isConfiguredExpirationTimeMs(1_700_000_000_000)).toBe(true)
    expect(isConfiguredExpirationTimeMs(0)).toBe(false)
    expect(isConfiguredExpirationTimeMs(undefined)).toBe(false)
    expect(isConfiguredExpirationTimeMs(Number.NaN)).toBe(false)
  })
})

describe("validateLimitedTimeOfferParams", () => {
  const validate = (params: WaTemplateParams) => {
    const schema = z
      .custom<WaTemplateParams>()
      .superRefine((value, ctx) => validateLimitedTimeOfferParams(value, ctx))
    return schema.safeParse(params)
  }

  test("rejects an LTO template whose expiration is still the seeded 0", () => {
    const result = validate({ limited_time_offer: { expiration_time_ms: 0 } })
    expect(result.success).toBe(false)
    expect(result.error?.issues[0]?.message).toBe(
      flowValidationCodes.waTemplateLtoExpirationRequired,
    )
  })

  test("accepts a configured expiration — including a PAST one (legacy resend)", () => {
    expect(
      validate({ limited_time_offer: { expiration_time_ms: 1000 } }).success,
    ).toBe(true)
  })

  test("templates without an LTO component are untouched", () => {
    expect(validate({}).success).toBe(true)
  })
})

describe("dateToExpirationTimeMs", () => {
  test("round-trips through expirationTimeMsToDate", () => {
    const ms = 1_700_000_123_456
    const date = expirationTimeMsToDate(ms)
    expect(date && dateToExpirationTimeMs(date)).toBe(ms)
  })
})

describe("isFutureExpirationTimeMs", () => {
  const now = new Date("2026-08-21T00:00:00.000Z")

  test("true when the expiration is after now", () => {
    expect(isFutureExpirationTimeMs(now.getTime() + 60_000, now)).toBe(true)
  })

  test("false when the expiration is before or equal to now", () => {
    expect(isFutureExpirationTimeMs(now.getTime() - 60_000, now)).toBe(false)
    expect(isFutureExpirationTimeMs(now.getTime(), now)).toBe(false)
  })

  test("false when undefined (never treated as future)", () => {
    expect(isFutureExpirationTimeMs(undefined, now)).toBe(false)
  })
})
