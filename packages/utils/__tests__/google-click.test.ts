import { describe, expect, it } from "vitest"
import {
  consumeGoogleClickRef,
  customerIdSchema,
  decodeInvisibleGoogleClick,
  extractInvisibleGoogleClick,
  formatCustomerId,
  GOOGLE_ADS_CHANNEL_VALUES,
  GOOGLE_CLICK_REFERRAL_KEYS,
  GOOGLE_INVISIBLE_BASE_CODE_POINT,
  GOOGLE_INVISIBLE_CHAR_SET,
  GOOGLE_INVISIBLE_END_CODE_POINT,
  googleAdsChannels,
  googleAdsConversionErrorCodes,
  hasGoogleClick,
  hasRfc3339Shape,
  INVISIBLE_RUN_PATTERN,
  isGoogleAdsMatchTemplate,
  isLeadLikeCategory,
  isRfc3339WithZone,
  parseConversionTime,
  parseGoogleClickRef,
  stripConsumedRuns,
  toGoogleClickReferral,
} from "../src/google-click"

const encode = (text: string): string =>
  [...text]
    .map((char) =>
      String.fromCodePoint(
        GOOGLE_INVISIBLE_BASE_CODE_POINT +
          GOOGLE_INVISIBLE_CHAR_SET.indexOf(char),
      ),
    )
    .join("")

// Percent-encoded starter-message prefix copied verbatim from Google's
// "Testing and Validation" URL (Technical Onboarding, May 2025).
const GOOGLE_DOC_TEST_URL_TEXT =
  "%F3%A0%84%BF%F3%A0%85%82%F3%A0%84%A0%F3%A0%84%9C%F3%A0%84%A5%F3%A0%84%A2%F3%A0%84%9D%F3%A0%85%82%F3%A0%85%84%F3%A0%85%82%F3%A0%84%80%F3%A0%84%81%F3%A0%84%82%F3%A0%84%83%F3%A0%84%84%F3%A0%84%85%F3%A0%84%86%F3%A0%84%87%F3%A0%84%88%F3%A0%84%89%F3%A0%84%8A%F3%A0%84%8B%F3%A0%84%8C%F3%A0%84%8D%F3%A0%84%8E%F3%A0%84%8F%F3%A0%84%90%F3%A0%84%91%F3%A0%84%92%F3%A0%84%93%F3%A0%84%94%F3%A0%84%95%F3%A0%84%96%F3%A0%84%97%F3%A0%84%98%F3%A0%84%99%F3%A0%84%9A%F3%A0%84%9B%F3%A0%84%9C%F3%A0%84%9D%F3%A0%84%9E%F3%A0%84%9F%F3%A0%84%A0%F3%A0%84%A1%F3%A0%84%A2%F3%A0%84%A3%F3%A0%84%A4%F3%A0%84%A5%F3%A0%84%A6%F3%A0%84%A7%F3%A0%84%A8%F3%A0%84%A9%F3%A0%84%AA%F3%A0%84%AB%F3%A0%84%AC%F3%A0%84%AD%F3%A0%84%AE%F3%A0%84%AF%F3%A0%84%B0%F3%A0%84%B1%F3%A0%84%B2%F3%A0%84%B3%F3%A0%84%B4%F3%A0%84%B5%F3%A0%84%B6%F3%A0%84%B7%F3%A0%84%B8%F3%A0%84%B9%F3%A0%84%BA%F3%A0%84%BB%F3%A0%84%BC%F3%A0%84%BD%F3%A0%84%BE%F3%A0%85%82%F3%A0%85%80"

const GCLID = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_"

describe("invisible alphabet", () => {
  it("has 70 unique characters and the documented code point range", () => {
    expect(GOOGLE_INVISIBLE_CHAR_SET).toHaveLength(70)
    expect(new Set(GOOGLE_INVISIBLE_CHAR_SET).size).toBe(70)
    expect(GOOGLE_INVISIBLE_BASE_CODE_POINT).toBe(0xe_01_00)
    expect(GOOGLE_INVISIBLE_END_CODE_POINT).toBe(0xe_01_46)
  })
})

describe("decodeInvisibleGoogleClick", () => {
  it("joins a payload split across runs inside the text, like Google's reference decoder", () => {
    const json = JSON.stringify({ gclid: GCLID, campaignid: 123 })
    const half = Math.floor(json.length / 2)
    const text = `${encode(json.slice(0, half))}Hello ${encode(json.slice(half))}world`
    const { payload, consumed } = decodeInvisibleGoogleClick(text)
    expect(payload).toMatchObject({
      clickIdType: "gclid",
      clickId: GCLID,
      campaignId: "123",
    })
    expect(consumed).toHaveLength(2)
    expect(stripConsumedRuns(text, consumed)).toBe("Hello world")
  })

  it("falls back to a single run when joining all runs is not a payload", () => {
    const unrelated = encode("zz")
    const text = `${unrelated}Hi ${encode(JSON.stringify({ gclid: GCLID }))}`
    const { payload, consumed } = decodeInvisibleGoogleClick(text)
    expect(payload?.clickId).toBe(GCLID)
    expect(stripConsumedRuns(text, consumed)).toBe(`${unrelated}Hi `)
  })

  it("decodes Google's documented gclid vector", () => {
    const text = `${encode(JSON.stringify({ gclid: GCLID }))}Hello, how can I help you`
    const { payload, consumed } = decodeInvisibleGoogleClick(text)
    expect(payload).toEqual({
      clickIdType: "gclid",
      clickId: GCLID,
      campaignId: undefined,
      adGroupId: undefined,
      adId: undefined,
    })
    expect(stripConsumedRuns(text, consumed)).toBe("Hello, how can I help you")
  })

  it("decodes the literal test URL from Google's documentation", () => {
    const text = `${decodeURIComponent(GOOGLE_DOC_TEST_URL_TEXT)}Hello, how can I help you`
    expect(decodeInvisibleGoogleClick(text).payload?.clickId).toBe(GCLID)
  })

  it.each([
    ["gclid", "gclid"],
    ["gbraid", "gbraid"],
  ] as const)("reads the %s test URL of the Nov 2025 document, whose ad ids are camelCase", (key, clickIdType) => {
    const id = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_"
    const text = `${encode(`{"${key}":"${id}","campaignId":123,"adGroupId":456,"creativeId":789}`)}Hello, how can I help you`
    const { payload, consumed } = decodeInvisibleGoogleClick(text)
    expect(payload).toEqual({
      clickIdType,
      clickId: id,
      campaignId: "123",
      adGroupId: "456",
      adId: "789",
    })
    expect(stripConsumedRuns(text, consumed)).toBe("Hello, how can I help you")
  })

  it("falls back to creativeId when adid is present but unusable", () => {
    const text = encode(`{"gclid":"${GCLID}","adid":"abc","creativeId":2}`)
    expect(decodeInvisibleGoogleClick(text).payload?.adId).toBe("2")
  })

  it("keeps the click, stamped now, when the provider timestamp is out of range", () => {
    const text = encode(`{"gclid":"${GCLID}"}`)
    const { googleReferral } = extractInvisibleGoogleClick(
      text,
      new Date(Number.NaN),
    )
    expect(googleReferral?.gclid).toBe(GCLID)
    expect(
      Number.isNaN(Date.parse(googleReferral?.googleClickReceivedAt ?? "")),
    ).toBe(false)
  })

  it("prefers adid over creativeId when both are present", () => {
    const text = encode(`{"gclid":"${GCLID}","adid":1,"creativeId":2}`)
    expect(decodeInvisibleGoogleClick(text).payload?.adId).toBe("1")
  })

  it("decodes the extended vector with ad identifiers", () => {
    const id = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_"
    const text = encode(
      `{"gclid":"${id}","campaignid":123,"adgroupid":456,"adid":789}`,
    )
    expect(decodeInvisibleGoogleClick(text).payload).toMatchObject({
      clickIdType: "gclid",
      clickId: id,
      campaignId: "123",
      adGroupId: "456",
      adId: "789",
    })
  })

  it("decodes gbraid", () => {
    const text = encode(`{"gbraid":"${GCLID}"}`)
    expect(decodeInvisibleGoogleClick(text).payload?.clickIdType).toBe("gbraid")
  })

  it("decodes a run in the middle of visible text and strips only that run", () => {
    const text = `Hi ${encode(`{"gclid":"${GCLID}"}`)}there`
    const { payload, consumed } = decodeInvisibleGoogleClick(text)
    expect(payload?.clickId).toBe(GCLID)
    expect(stripConsumedRuns(text, consumed)).toBe("Hi there")
  })

  it("returns nothing and leaves text untouched for plain text", () => {
    const { payload, consumed } = decodeInvisibleGoogleClick("hello")
    expect(payload).toBeNull()
    expect(stripConsumedRuns("hello", consumed)).toBe("hello")
  })

  it("does not strip an invisible run that is not valid JSON", () => {
    const text = `${encode("not json")}hello`
    const { payload, consumed } = decodeInvisibleGoogleClick(text)
    expect(payload).toBeNull()
    expect(stripConsumedRuns(text, consumed)).toBe(text)
  })

  it("rejects a payload whose click id is too short", () => {
    expect(
      decodeInvisibleGoogleClick(encode('{"gclid":"short"}')).payload,
    ).toBeNull()
  })

  it("leaves ideographic variation selectors in Japanese text untouched", () => {
    const text = "葛\u{E0100}城"
    const { payload, consumed } = decodeInvisibleGoogleClick(text)
    expect(payload).toBeNull()
    expect(stripConsumedRuns(text, consumed)).toBe(text)
  })

  it("picks the run that parses when several runs exist", () => {
    const text = `${encode("zz")}x${encode(`{"gclid":"${GCLID}"}`)}`
    const { payload, consumed } = decodeInvisibleGoogleClick(text)
    expect(payload?.clickId).toBe(GCLID)
    expect(stripConsumedRuns(text, consumed)).toBe(`${encode("zz")}x`)
  })

  it("prefers the longest valid run and consumes only that range", () => {
    const short = encode(`{"gclid":"${GCLID.slice(0, 12)}"}`)
    const long = encode(`{"gclid":"${GCLID}"}`)
    const text = `${short}-${long}`
    const { payload, consumed } = decodeInvisibleGoogleClick(text)
    expect(payload?.clickId).toBe(GCLID)
    expect(stripConsumedRuns(text, consumed)).toBe(`${short}-`)
  })

  it("returns nothing for valid JSON that is not a usable object", () => {
    for (const json of ["123", '["gclid"]', "null"]) {
      const text = `${encode(json)}hi`
      const { payload, consumed } = decodeInvisibleGoogleClick(text)
      expect(payload).toBeNull()
      expect(stripConsumedRuns(text, consumed)).toBe(text)
    }
  })

  it("drops non-numeric ad identifiers", () => {
    const text = encode(
      `{"gclid":"${GCLID}","campaignid":-1,"adgroupid":"abc","adid":""}`,
    )
    expect(decodeInvisibleGoogleClick(text).payload).toMatchObject({
      campaignId: undefined,
      adGroupId: undefined,
      adId: undefined,
    })
    expect(parseGoogleClickRef(`gclid:${GCLID},adid:`)?.adId).toBeUndefined()
  })

  it("matches exactly the alphabet code point range", () => {
    const last = String.fromCodePoint(GOOGLE_INVISIBLE_END_CODE_POINT - 1)
    expect(last.codePointAt(0)).toBe(0xe_01_45)
    expect(last.match(INVISIBLE_RUN_PATTERN)).not.toBeNull()
    expect(
      String.fromCodePoint(GOOGLE_INVISIBLE_END_CODE_POINT).match(
        INVISIBLE_RUN_PATTERN,
      ),
    ).toBeNull()
  })

  it("ignores code points just outside the alphabet range", () => {
    const outside = String.fromCodePoint(GOOGLE_INVISIBLE_END_CODE_POINT)
    expect(decodeInvisibleGoogleClick(outside).payload).toBeNull()
  })
})

describe("parseGoogleClickRef", () => {
  it("parses gclid with extra keys, case-insensitively", () => {
    expect(
      parseGoogleClickRef(`gclid:${GCLID},CampaignId:1,adgroupid:2,adid:3`),
    ).toMatchObject({
      clickIdType: "gclid",
      clickId: GCLID,
      campaignId: "1",
      adGroupId: "2",
      adId: "3",
    })
  })

  it("parses gbraid and URL-encoded refs", () => {
    expect(
      parseGoogleClickRef(encodeURIComponent(`gbraid:${GCLID},adid:9`)),
    ).toMatchObject({ clickIdType: "gbraid", adId: "9" })
  })

  it("returns null for an empty id, a legacy raw id or a flow ref", () => {
    expect(parseGoogleClickRef("gclid:")).toBeNull()
    expect(parseGoogleClickRef(GCLID)).toBeNull()
    expect(parseGoogleClickRef("f_abc123")).toBeNull()
    expect(parseGoogleClickRef("")).toBeNull()
  })

  it("survives malformed percent-encoding", () => {
    expect(parseGoogleClickRef("%E0%A4%A")).toBeNull()
  })
})

describe("toGoogleClickReferral / hasGoogleClick", () => {
  const receivedAt = new Date("2026-10-05T01:02:03.000Z")

  it("writes all six keys and nulls the other click id", () => {
    const referral = toGoogleClickReferral(
      { clickIdType: "gbraid", clickId: GCLID, adId: "7" },
      receivedAt,
    )
    expect(Object.keys(referral).sort()).toEqual(
      [...GOOGLE_CLICK_REFERRAL_KEYS].sort(),
    )
    expect(referral).toMatchObject({
      gclid: null,
      gbraid: GCLID,
      googleAdId: "7",
      googleCampaignId: null,
      googleClickReceivedAt: "2026-10-05T01:02:03.000Z",
    })
  })

  it("detects a click on either id", () => {
    expect(hasGoogleClick({ gclid: GCLID })).toBe(true)
    expect(hasGoogleClick({ gbraid: GCLID })).toBe(true)
    expect(hasGoogleClick({ gclid: null, gbraid: null })).toBe(false)
    expect(hasGoogleClick(null)).toBe(false)
  })
})

describe("isLeadLikeCategory", () => {
  it("treats lead categories as lead-like and purchases as not", () => {
    expect(isLeadLikeCategory("QUALIFIED_LEAD")).toBe(true)
    expect(isLeadLikeCategory("PURCHASE")).toBe(false)
  })
})

describe("customer id helpers", () => {
  it("formats a 10-digit id", () => {
    expect(formatCustomerId("1234567890")).toBe("123-456-7890")
    expect(formatCustomerId("abc")).toBe("abc")
  })

  it("normalises dashes and spaces and rejects bad ids", () => {
    expect(customerIdSchema.parse("123-456-7890")).toBe("1234567890")
    expect(customerIdSchema.safeParse("12345").success).toBe(false)
  })
})

const RECEIVED_AT = new Date("2026-10-01T00:00:00.000Z")

describe("googleAdsChannels", () => {
  it("is derived from the single channel list", () => {
    expect(googleAdsChannels.options).toEqual([...GOOGLE_ADS_CHANNEL_VALUES])
    expect(googleAdsChannels.safeParse("email").success).toBe(false)
  })
})

describe("consumeGoogleClickRef", () => {
  it("consumes a Google ref: ref becomes null and the referral is built", () => {
    const result = consumeGoogleClickRef(`gclid:${GCLID},adid:3`, RECEIVED_AT)
    expect(result.ref).toBeNull()
    expect(result.googleReferral).toEqual(
      toGoogleClickReferral(
        parseGoogleClickRef(`gclid:${GCLID},adid:3`) as never,
        RECEIVED_AT,
      ),
    )
  })

  it.each([
    ["an ordinary reflink", "f_abc123"],
    ["an empty ref", ""],
  ])("keeps %s for the ref router", (_name, ref) => {
    expect(consumeGoogleClickRef(ref, RECEIVED_AT)).toEqual({
      ref,
      googleReferral: null,
    })
  })

  it.each([null, undefined])("maps %s to a null ref", (ref) => {
    expect(consumeGoogleClickRef(ref, RECEIVED_AT)).toEqual({
      ref: null,
      googleReferral: null,
    })
  })
})

describe("extractInvisibleGoogleClick", () => {
  it("strips only the consumed run and builds the referral", () => {
    const text = `${encode(JSON.stringify({ gclid: GCLID }))}Hello`
    const result = extractInvisibleGoogleClick(text, RECEIVED_AT)
    expect(result.text).toBe("Hello")
    expect(result.googleReferral?.gclid).toBe(GCLID)
    expect(result.googleReferral?.googleClickReceivedAt).toBe(
      RECEIVED_AT.toISOString(),
    )
  })

  it("returns plain text untouched (including unrelated variation selectors)", () => {
    const text = "\u845B\u{E0100}\u57CE hi"
    expect(extractInvisibleGoogleClick(text, RECEIVED_AT)).toEqual({
      text,
      googleReferral: null,
    })
  })
})

describe("isRfc3339WithZone", () => {
  it.each([
    "2026-10-08T14:30:00Z",
    "2026-10-08T14:30:00+07:00",
    "2026-10-08T14:30:00-05:30",
    "2026-10-08T14:30:00.123Z",
    "2024-02-29T00:00:00Z",
    "2026-10-08t14:30:00z",
  ])("accepts %s", (value) => {
    expect(isRfc3339WithZone(value)).toBe(true)
  })

  it.each([
    "2026-10-08T14:30:00",
    "2026-10-08 14:30:00Z",
    "2026-10-08",
    "2026-10-08T14:30Z",
    "2026-02-30T10:00:00Z",
    "2025-02-29T10:00:00Z",
    "2026-13-01T10:00:00Z",
    "2026-10-08T24:00:00Z",
    "2026-10-08T14:60:00Z",
    "2026-10-08T14:30:60Z",
    "2026-10-08T14:30:00+24:00",
    "2026-10-08T14:30:00+07:60",
    "2026-10-08T14:30:00+0700",
    "2026-10-08T14:30:00.Z",
    "not a date",
    "",
  ])("rejects %j", (value) => {
    expect(isRfc3339WithZone(value)).toBe(false)
  })
})

describe("parseConversionTime", () => {
  it("returns the UTC instant for a Z value", () => {
    expect(parseConversionTime("2026-10-08T14:30:00Z")?.toISOString()).toBe(
      "2026-10-08T14:30:00.000Z",
    )
  })

  it("applies a positive and a negative offset", () => {
    expect(
      parseConversionTime("2026-10-08T14:30:00+07:00")?.toISOString(),
    ).toBe("2026-10-08T07:30:00.000Z")
    expect(
      parseConversionTime("2026-10-08T14:30:00-05:30")?.toISOString(),
    ).toBe("2026-10-08T20:00:00.000Z")
  })

  it("drops fractional seconds", () => {
    expect(parseConversionTime("2026-10-08T14:30:00.999Z")?.getTime()).toBe(
      Date.UTC(2026, 9, 8, 14, 30, 0),
    )
  })

  it("rolls the date across an offset boundary", () => {
    expect(
      parseConversionTime("2026-01-01T00:30:00+01:00")?.toISOString(),
    ).toBe("2025-12-31T23:30:00.000Z")
  })

  it("returns null for a missing zone or an impossible date", () => {
    expect(parseConversionTime("2026-10-08T14:30:00")).toBeNull()
    expect(parseConversionTime("2026-02-30T10:00:00Z")).toBeNull()
  })
})

describe("hasRfc3339Shape", () => {
  it("accepts the shape even for a date that does not exist", () => {
    expect(hasRfc3339Shape("2026-02-30T10:00:00Z")).toBe(true)
    expect(isRfc3339WithZone("2026-02-30T10:00:00Z")).toBe(false)
  })

  it.each([
    "2026-10-08T14:30:00",
    "2026-10-08",
    "not a date",
  ])("rejects %j", (value) => {
    expect(hasRfc3339Shape(value)).toBe(false)
  })
})

describe("googleAdsConversionErrorCodes", () => {
  it("has a unique google_ads_ code per reason, including the option codes", () => {
    const codes = Object.values(googleAdsConversionErrorCodes)

    expect(new Set(codes).size).toBe(codes.length)
    expect(codes.every((code) => code.startsWith("google_ads_"))).toBe(true)
    expect(googleAdsConversionErrorCodes).toMatchObject({
      invalidConsentConfig: "google_ads_invalid_consent_config",
      invalidConsentValue: "google_ads_invalid_consent_value",
      invalidConversionTime: "google_ads_invalid_conversion_time",
      missingDedupId: "google_ads_missing_dedup_id",
      invalidDedupId: "google_ads_invalid_dedup_id",
    })
  })
})

describe("isGoogleAdsMatchTemplate", () => {
  it.each([
    "{{email}}",
    "{{ phone }}",
    "{{custom_work_email}}",
    `{{${"a".repeat(196)}}}`,
  ])("accepts %s", (value) => {
    expect(isGoogleAdsMatchTemplate(value)).toBe(true)
  })

  it.each([
    "",
    "off",
    "contact",
    "11690032856629248",
    "jane@example.com",
    "+84901234567",
    "{{}}",
    "mail {{email}}",
    "{{email}} ",
    "{{email}}{{phone}}",
    "{{a{{b}}}}",
    `{{${"a".repeat(197)}}}`,
  ])("refuses %j", (value) => {
    expect(isGoogleAdsMatchTemplate(value)).toBe(false)
  })
})

describe("real-world starter messages and refs", () => {
  const AT = new Date("2026-10-08T00:00:00Z")
  const CLICK = "Cj0KCQiAabcdefghij_-KLMN"
  const hide = (value: object) => encode(JSON.stringify(value))

  it.each([
    ["at the start", `${hide({ gclid: CLICK })}Hello`, "Hello"],
    ["at the end", `Hello${hide({ gclid: CLICK })}`, "Hello"],
    ["inside the text", `Hel${hide({ gclid: CLICK })}lo`, "Hello"],
    ["between emoji", `😀${hide({ gclid: CLICK })}👍`, "😀👍"],
    [
      "with the visible text edited",
      `${hide({ gclid: CLICK })}other words`,
      "other words",
    ],
    ["with no visible text left", hide({ gclid: CLICK }), ""],
    [
      "with unknown extra keys",
      `${hide({ gclid: CLICK, gad_source: 1 })}Hi`,
      "Hi",
    ],
  ])("captures the click %s and keeps only the visible text", (_name, text, visible) => {
    const result = extractInvisibleGoogleClick(text, AT)
    expect(result.googleReferral?.gclid).toBe(CLICK)
    expect(result.text).toBe(visible)
  })

  it("keeps gclid when a payload carries both ids, and reads ids sent as strings", () => {
    const result = extractInvisibleGoogleClick(
      `${hide({ gclid: CLICK, gbraid: "BBBBBBBBBBBB", campaignid: "12", adid: "9" })}Hi`,
      AT,
    )
    expect(result.googleReferral).toMatchObject({
      gclid: CLICK,
      gbraid: null,
      googleCampaignId: "12",
      googleAdId: "9",
    })
  })

  it.each([
    ["truncated JSON", encode(JSON.stringify({ gclid: CLICK }).slice(0, -3))],
    ["a too-short id", hide({ gclid: "abc" })],
    ["a numeric id", hide({ gclid: 12_345_678_901_234 })],
    ["a JSON array", encode("[1,2]")],
  ])("leaves the text untouched for %s", (_name, hidden) => {
    const text = `${hidden}Hi`
    const result = extractInvisibleGoogleClick(text, AT)
    expect(result.googleReferral).toBeNull()
    expect(result.text).toBe(text)
  })

  it.each([
    ["metadata before the id", `k1:v1,gclid:${CLICK}`],
    ["upper-case keys", `GCLID:${CLICK},CampaignId:1`],
    ["spaces around pairs", `gclid: ${CLICK} , campaignid: 7`],
    ["URL-encoded separators", `gclid:${CLICK}%2Ccampaignid%3A1`],
    ["a bare id with no metadata", `gclid:${CLICK}`],
  ])("reads a Messenger ref with %s", (_name, ref) => {
    const result = consumeGoogleClickRef(ref, AT)
    expect(result.googleReferral?.gclid).toBe(CLICK)
    expect(result.ref).toBeNull()
  })

  it.each([
    ["a semicolon-separated ref", `gclid:${CLICK};campaignid:1`],
    ["an empty id", "gclid:"],
    ["a raw legacy id", CLICK],
    ["a reflink", "f_abc123"],
  ])("keeps %s as a normal ref", (_name, ref) => {
    const result = consumeGoogleClickRef(ref, AT)
    expect(result.googleReferral).toBeNull()
    expect(result.ref).toBe(ref)
  })
})
