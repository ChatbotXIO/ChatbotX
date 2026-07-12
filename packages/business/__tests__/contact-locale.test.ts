import { describe, expect, test } from "vitest"
import {
  contactLocaleOptions,
  finalizeContactProfile,
  languageFromLocale,
  normalizeLocale,
  normalizeStoredTimezone,
  offsetFromStoredTimezone,
  profileFromPhoneNumber,
  timezoneFromLocaleRegion,
} from "../src/contact-locale"

describe("contact locale helpers", () => {
  test("normalizes locale separators and language keys", () => {
    expect(normalizeLocale("vi-VN")).toBe("vi_VN")
    expect(normalizeLocale("VI_vn")).toBe("vi_VN")
    expect(normalizeLocale("vi")).toBe("vi")
    expect(languageFromLocale("zh-CN")).toBe("zh")
  })

  test("derives timezones only for curated single-zone locale regions", () => {
    expect(timezoneFromLocaleRegion("vi_VN")).toBe("Asia/Ho_Chi_Minh")
    expect(timezoneFromLocaleRegion("en_US")).toBeNull()
    expect(timezoneFromLocaleRegion("pt_BR")).toBeNull()
  })

  test("derives profile fields from common phone country codes", () => {
    expect(profileFromPhoneNumber("+84901234567")).toEqual({
      locale: "vi_VN",
      language: "vi",
      timezone: "Asia/Ho_Chi_Minh",
    })
    expect(profileFromPhoneNumber("+12025550123")).toBeNull()
  })

  test("normalizes legacy offset timezones and resolves offsets from IANA zones", () => {
    expect(normalizeStoredTimezone("+07:00")).toBe("Asia/Bangkok")
    expect(normalizeStoredTimezone("7")).toBe("Asia/Bangkok")
    expect(normalizeStoredTimezone("Asia/Ho_Chi_Minh")).toBe("Asia/Ho_Chi_Minh")
    expect(offsetFromStoredTimezone("+07:00")).toBe("+7")
    expect(offsetFromStoredTimezone("7")).toBe("+7")
    expect(offsetFromStoredTimezone("Asia/Ho_Chi_Minh")).toBe("+7")
  })

  test("finalizes contact profile without overwriting present channel fields", () => {
    expect(
      finalizeContactProfile(
        {
          locale: "vi",
          timezone: "+07:00",
        },
        { phoneHint: "+84901234567" },
      ),
    ).toEqual({
      locale: "vi",
      language: "vi",
      timezone: "Asia/Bangkok",
    })
  })

  test("fills missing channel fields from phone or fallback locale", () => {
    expect(finalizeContactProfile({}, { phoneHint: "+84901234567" })).toEqual({
      locale: "vi_VN",
      language: "vi",
      timezone: "Asia/Ho_Chi_Minh",
    })
    expect(finalizeContactProfile({}, { fallbackLocale: "vi_VN" })).toEqual({
      locale: "vi_VN",
      language: "vi",
      timezone: "Asia/Ho_Chi_Minh",
    })
  })

  test("does not store languages outside the curated contact language list", () => {
    expect(finalizeContactProfile({ locale: "tr_TR" })).toEqual({
      locale: "tr_TR",
      language: undefined,
      timezone: undefined,
    })
  })

  test("exposes locale filter options for every phone-derived locale", () => {
    expect(contactLocaleOptions.map((option) => option.value)).toEqual(
      expect.arrayContaining(["ar_AE", "en_GB", "en_SG", "vi_VN"]),
    )
  })
})
