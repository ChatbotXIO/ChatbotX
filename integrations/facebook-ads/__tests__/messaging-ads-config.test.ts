import { describe, expect, test } from "vitest"
import {
  buildCorrelationName,
  buildPromotedObject,
  MESSAGING_AD_CHANNELS,
  messagingAdConfigByChannel,
  operationIdNameFilter,
} from "../src/messaging-ads/constants"
import {
  enforceSpecialAdCategoryTargeting,
  isRestrictedSpecialAdCategory,
} from "../src/messaging-ads/special-ad-category"
import type { MessagingAdGender } from "../src/messaging-ads/types"

describe("messagingAdConfigByChannel", () => {
  test.each(
    MESSAGING_AD_CHANNELS,
  )("has a complete config entry for %s", (channel) => {
    const config = messagingAdConfigByChannel[channel]
    expect(config.destinationType).toBeTruthy()
    expect(config.ctaType).toBeTruthy()
    expect(config.ctaAppDestination).toBeTruthy()
    expect(typeof config.needsInstagramActor).toBe("boolean")
  })

  test("only instagram needs an instagram_actor_id", () => {
    expect(messagingAdConfigByChannel.instagram.needsInstagramActor).toBe(true)
    expect(messagingAdConfigByChannel.messenger.needsInstagramActor).toBe(false)
    expect(messagingAdConfigByChannel.whatsapp.needsInstagramActor).toBe(false)
  })

  test("only whatsapp promotes a page + whatsapp number", () => {
    expect(messagingAdConfigByChannel.whatsapp.promotedObjectKind).toBe(
      "pageAndWhatsappNumber",
    )
    expect(messagingAdConfigByChannel.messenger.promotedObjectKind).toBe(
      "pageOnly",
    )
    expect(messagingAdConfigByChannel.instagram.promotedObjectKind).toBe(
      "pageOnly",
    )
  })
})

describe("buildPromotedObject", () => {
  test("messenger/instagram build a page-only promoted object", () => {
    expect(buildPromotedObject("messenger", { pageId: "pg_1" })).toEqual({
      page_id: "pg_1",
    })
    expect(buildPromotedObject("instagram", { pageId: "pg_1" })).toEqual({
      page_id: "pg_1",
    })
  })

  test("whatsapp includes the phone number", () => {
    expect(
      buildPromotedObject("whatsapp", {
        pageId: "pg_1",
        whatsappPhoneNumber: "15550001234",
      }),
    ).toEqual({ page_id: "pg_1", whatsapp_phone_number: "15550001234" })
  })

  test("whatsapp without a phone number throws", () => {
    expect(() => buildPromotedObject("whatsapp", { pageId: "pg_1" })).toThrow()
  })
})

describe("correlation marker helpers", () => {
  test("buildCorrelationName embeds the operationId", () => {
    expect(buildCorrelationName("My Campaign", "op_123")).toBe(
      "My Campaign [cbx:op_123]",
    )
  })

  test("operationIdNameFilter produces a Graph CONTAIN filter", () => {
    const filter = JSON.parse(operationIdNameFilter("op_123"))
    expect(filter).toEqual([
      { field: "name", operator: "CONTAIN", value: "[cbx:op_123]" },
    ])
  })
})

describe("special ad category enforcement", () => {
  test("NONE does not restrict targeting", () => {
    expect(isRestrictedSpecialAdCategory(["NONE"])).toBe(false)
    const targeting = {
      geo_locations: { countries: ["US"] },
      age_min: 21,
      age_max: 45,
      genders: [1] as MessagingAdGender[],
    }
    expect(enforceSpecialAdCategoryTargeting(targeting, ["NONE"])).toEqual(
      targeting,
    )
  })

  test.each([
    "HOUSING",
    "EMPLOYMENT",
    "CREDIT",
  ] as const)("%s strips age/gender targeting server-side", (category) => {
    expect(isRestrictedSpecialAdCategory([category])).toBe(true)
    const targeting = {
      geo_locations: { countries: ["US"] },
      age_min: 21,
      age_max: 45,
      genders: [1, 2] as MessagingAdGender[],
    }
    const result = enforceSpecialAdCategoryTargeting(targeting, [category])
    expect(result).toEqual({ geo_locations: { countries: ["US"] } })
    expect(result).not.toHaveProperty("age_min")
    expect(result).not.toHaveProperty("age_max")
    expect(result).not.toHaveProperty("genders")
  })
})
