import type { CountryCode } from "libphonenumber-js"
import { describe, expect, test } from "vitest"
import {
  canPickCountry,
  changeCountry,
  joinPhoneNumber,
  moveToOwnCountry,
  splitPhoneNumber,
} from "../phone-number-parts"

/** One real-format number per region, written the way people type it there. */
const NUMBERS: {
  country: CountryCode
  international: string
  national: string
  typed: string
}[] = [
  {
    country: "US",
    international: "+14155552671",
    national: "4155552671",
    typed: "(415) 555-2671",
  },
  {
    country: "CA",
    international: "+16135550123",
    national: "6135550123",
    typed: "613-555-0123",
  },
  {
    country: "GB",
    international: "+442079460958",
    national: "2079460958",
    typed: "020 7946 0958",
  },
  {
    country: "DE",
    international: "+4915123456789",
    national: "15123456789",
    typed: "015123456789",
  },
  {
    country: "IN",
    international: "+919876543210",
    national: "9876543210",
    typed: "98765 43210",
  },
  {
    country: "BR",
    international: "+5511987654321",
    national: "11987654321",
    typed: "011 98765-4321",
  },
  {
    country: "JP",
    international: "+81312345678",
    national: "312345678",
    typed: "03-1234-5678",
  },
  {
    country: "IT",
    international: "+390612345678",
    national: "0612345678",
    typed: "06 1234 5678",
  },
  {
    country: "VN",
    international: "+84349566551",
    national: "349566551",
    typed: "0349 566 551",
  },
]

describe("splitPhoneNumber", () => {
  test.each(
    NUMBERS,
  )("splits a $country number into its country and national part", ({
    country,
    international,
    national,
  }) => {
    expect(splitPhoneNumber(international)).toEqual({
      country,
      local: national,
    })
  })

  test.each([
    ["an empty value", ""],
    ["a non-geographic number (no single country)", "+80012345678"],
    ["a number still being typed", "+4420"],
    ["a variable", "{{contact.phone}}"],
    ["a tel: link", "tel:+14155552671"],
  ])("keeps %s whole, with no country", (_name, value) => {
    expect(splitPhoneNumber(value)).toEqual({ country: null, local: value })
  })
})

describe("joinPhoneNumber", () => {
  test.each(NUMBERS)("joins a $country number typed the local way", ({
    country,
    international,
    typed,
  }) => {
    expect(joinPhoneNumber({ country, local: typed })).toBe(international)
  })

  test.each([
    ["a number typed with its own +", "GB", "+14155552671", "+14155552671"],
    ["nothing typed yet", "US", "", ""],
    ["no country", null, "+80012345678", "+80012345678"],
    ["a variable", "DE", "{{contact.phone}}", "{{contact.phone}}"],
  ])("keeps %s as typed", (_name, country, local, expected) => {
    expect(
      joinPhoneNumber({ country: country as CountryCode | null, local }),
    ).toBe(expected)
  })
})

describe("changeCountry", () => {
  test("shows a national number the way the picked country writes it", () => {
    expect(
      changeCountry({ country: null, local: "020 7946 0958" }, "GB"),
    ).toEqual({
      country: "GB",
      local: "2079460958",
    })
  })

  test("keeps the national part when switching country", () => {
    expect(
      changeCountry({ country: "DE", local: "15123456789" }, "AT"),
    ).toEqual({
      country: "AT",
      local: "15123456789",
    })
  })

  test("shows the full international number when the country is cleared", () => {
    expect(
      changeCountry({ country: "GB", local: "020 7946 0958" }, null),
    ).toEqual({
      country: null,
      local: "+442079460958",
    })
  })

  test.each([
    ["a full number", "+14155552671", "US", "4155552671"],
    ["a spaced dial code", "+ 44 20", "GB", "20"],
    ["a bracketed dial code", "+(44)20", "GB", "20"],
    ["a non-geographic number", "+80012345678", "JP", "12345678"],
    ["an unfinished dial code", "+4", "DE", ""],
  ])("moves %s under the picked country", (_name, local, next, expected) => {
    expect(
      changeCountry({ country: null, local }, next as CountryCode),
    ).toEqual({ country: next, local: expected })
  })
})

describe("canPickCountry", () => {
  test.each([
    "",
    "+",
    "4155552671",
    "+44 20-7946.0958",
    "(415) 555-2671",
  ])("accepts %j", (value) => {
    expect(canPickCountry(value)).toBe(true)
  })

  test.each([
    "call me",
    "tel:+14155552671",
    "{{contact.phone}}",
  ])("rejects %j", (value) => {
    expect(canPickCountry(value)).toBe(false)
  })
})

describe("moveToOwnCountry", () => {
  test.each([
    [
      "dialled from the US with 011",
      "US",
      "011 44 20 7946 0958",
      "GB",
      "2079460958",
    ],
    [
      "dialled from Germany with 00",
      "DE",
      "0044 20 7946 0958",
      "GB",
      "2079460958",
    ],
    [
      "dialled from Japan with 010",
      "JP",
      "010 44 20 7946 0958",
      "GB",
      "2079460958",
    ],
    [
      "dialled from the UK with 00",
      "GB",
      "00 1 415 555 2671",
      "US",
      "4155552671",
    ],
    ["typed with its own +", null, "+81312345678", "JP", "312345678"],
  ])("moves a number %s into its own country", (_name, picked, local, country, national) => {
    expect(
      moveToOwnCountry({ country: picked as CountryCode | null, local }),
    ).toEqual({ country, local: national })
  })

  test.each([
    ["a national number of the picked country", "GB", "020 7946 0958"],
    ["a number of a country sharing the dial code", "US", "613 555 0123"],
    ["a number still being typed", null, "+4420"],
    ["a variable", "US", "{{contact.phone}}"],
  ])("leaves %s where it is", (_name, picked, local) => {
    expect(
      moveToOwnCountry({ country: picked as CountryCode | null, local }),
    ).toBeNull()
  })
})
