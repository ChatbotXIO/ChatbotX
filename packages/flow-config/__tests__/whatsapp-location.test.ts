import { describe, expect, test } from "vitest"
import {
  formatWhatsappLocationCoordinate,
  isWhatsappLocationUnset,
  parseWhatsappLocationCoordinate,
  whatsappLocationFormErrors,
  whatsappLocationFormSchema,
  whatsappLocationStepDefaultFn,
  whatsappLocationStepSchema,
} from "../src"

const EXPONENT_NOTATION = /e/i

describe("whatsappLocationStepSchema", () => {
  test("accepts a step built by the default factory", () => {
    const step = whatsappLocationStepDefaultFn({
      latitude: 15.56,
      longitude: 108.48,
    })

    expect(whatsappLocationStepSchema.safeParse(step).success).toBe(true)
  })

  test("rejects the unconfigured default of 0, 0", () => {
    const step = whatsappLocationStepDefaultFn()

    expect(whatsappLocationStepSchema.safeParse(step).success).toBe(false)
  })

  test.each([
    { latitude: 91, longitude: 0 },
    { latitude: -91, longitude: 0 },
    { latitude: 0, longitude: 181 },
    { latitude: 0, longitude: -181 },
  ])("rejects out-of-range coordinates %o", (coords) => {
    const step = whatsappLocationStepDefaultFn(coords)

    expect(whatsappLocationStepSchema.safeParse(step).success).toBe(false)
  })
})

describe("whatsappLocationFormSchema", () => {
  const valid = {
    name: "Mường Thanh",
    address: "Tam Kỳ",
    latitude: "15.561419980411108",
    longitude: "108.4867823491902",
  }

  test("accepts the values from the design mock-up", () => {
    expect(whatsappLocationFormSchema.safeParse(valid).success).toBe(true)
  })

  test("allows blank name and address", () => {
    const result = whatsappLocationFormSchema.safeParse({
      ...valid,
      name: "",
      address: "",
    })

    expect(result.success).toBe(true)
  })

  test.each(["", "abc", "91", "NaN"])("rejects latitude %j", (latitude) => {
    expect(
      whatsappLocationFormSchema.safeParse({ ...valid, latitude }).success,
    ).toBe(false)
  })

  test("accepts a decimal comma and rejects exponent notation", () => {
    expect(
      whatsappLocationFormSchema.safeParse({ ...valid, latitude: "10,5" })
        .success,
    ).toBe(true)
    expect(
      whatsappLocationFormSchema.safeParse({ ...valid, latitude: "1e1" })
        .success,
    ).toBe(false)
  })

  test("rejects a longitude beyond 180", () => {
    expect(
      whatsappLocationFormSchema.safeParse({ ...valid, longitude: "200" })
        .success,
    ).toBe(false)
  })
})

describe("isWhatsappLocationUnset", () => {
  test("treats only the 0, 0 default as unset", () => {
    expect(isWhatsappLocationUnset({ latitude: 0, longitude: 0 })).toBe(true)
    expect(isWhatsappLocationUnset({ latitude: 0, longitude: 10 })).toBe(false)
    expect(isWhatsappLocationUnset({ latitude: 10, longitude: 0 })).toBe(false)
  })

  test("the dialog rejects 0, 0 but accepts a point on the equator", () => {
    const base = { name: "", address: "" }

    expect(
      whatsappLocationFormSchema.safeParse({
        ...base,
        latitude: "0",
        longitude: "0",
      }).success,
    ).toBe(false)
    expect(
      whatsappLocationFormSchema.safeParse({
        ...base,
        latitude: "0",
        longitude: "32.5",
      }).success,
    ).toBe(true)
  })
})

describe("whatsapp location dialog errors and coordinate text", () => {
  const valid = { name: "", address: "", latitude: "10", longitude: "20" }
  const messagesFor = (values: typeof valid) => {
    const result = whatsappLocationFormSchema.safeParse(values)
    return result.success ? [] : result.error.issues.map((i) => i.message)
  }

  test("reports a code per invalid field", () => {
    expect(messagesFor({ ...valid, latitude: "91" })).toEqual([
      whatsappLocationFormErrors.invalidLatitude,
    ])
    expect(messagesFor({ ...valid, longitude: "" })).toEqual([
      whatsappLocationFormErrors.invalidLongitude,
    ])
    expect(messagesFor({ ...valid, name: "x".repeat(1001) })).toEqual([
      whatsappLocationFormErrors.tooLong,
    ])
    expect(messagesFor({ ...valid, latitude: "0", longitude: "0" })).toEqual([
      whatsappLocationFormErrors.locationRequired,
    ])
  })

  test.each([
    1e-7, -1.5e-7, 1e-21, 5e-324, 15.561_419_980_411_108,
    -122.161_535_820_493_94, 90, -0.5, 0,
  ])("round-trips %d through the dialog text", (value) => {
    const text = formatWhatsappLocationCoordinate(value)

    expect(text).not.toMatch(EXPONENT_NOTATION)
    expect(parseWhatsappLocationCoordinate(text)).toBe(value)
  })
})
