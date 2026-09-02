import { describe, expect, test } from "vitest"
import {
  NO_INTEGRATIONS_EMPTY_STATE,
  resolveMessagingAdsToolEmptyState,
  UNSUPPORTED_INTEGRATIONS_EMPTY_STATE,
} from "@/features/ads-campaign/lib/tool-empty-state"
import type { MessagingAdsToolIntegration } from "@/features/ads-campaign/queries/tool-integrations"

const integration = (id: string, name = id): MessagingAdsToolIntegration => ({
  id,
  name,
})

describe("resolveMessagingAdsToolEmptyState", () => {
  test("returns null when the channel has at least one integration, even when hasUnsupportedIntegrations is true", () => {
    const result = resolveMessagingAdsToolEmptyState({
      channel: "instagram",
      integrations: [integration("ig-1")],
      hasUnsupportedIntegrations: true,
    })

    expect(result).toBeNull()
  })

  test("returns the instagram entry of UNSUPPORTED_INTEGRATIONS_EMPTY_STATE when instagram has no integrations and reports unsupported ones", () => {
    const result = resolveMessagingAdsToolEmptyState({
      channel: "instagram",
      integrations: [],
      hasUnsupportedIntegrations: true,
    })

    expect(result?.descriptionKey).toBe(
      "metaConversions.unsupportedExplanation",
    )
    expect(result?.ctaKey).toBe("metaConversions.connectViaFacebook")
    expect(result?.titleKey).toBeNull()
    expect(result?.href("ws1")).toBe(
      "/channels/create?channel=instagram-facebook&workspaceId=ws1",
    )
  })

  test("returns NO_INTEGRATIONS_EMPTY_STATE for instagram with no integrations and hasUnsupportedIntegrations false", () => {
    const result = resolveMessagingAdsToolEmptyState({
      channel: "instagram",
      integrations: [],
      hasUnsupportedIntegrations: false,
    })

    expect(result).toEqual(NO_INTEGRATIONS_EMPTY_STATE)
  })

  test.each([
    "whatsapp",
    "messenger",
  ] as const)("returns the generic state for %s with no integrations regardless of hasUnsupportedIntegrations", (channel) => {
    const resultWithFlagTrue = resolveMessagingAdsToolEmptyState({
      channel,
      integrations: [],
      hasUnsupportedIntegrations: true,
    })
    const resultWithFlagFalse = resolveMessagingAdsToolEmptyState({
      channel,
      integrations: [],
      hasUnsupportedIntegrations: false,
    })

    expect(resultWithFlagTrue).toEqual(NO_INTEGRATIONS_EMPTY_STATE)
    expect(resultWithFlagFalse).toEqual(NO_INTEGRATIONS_EMPTY_STATE)
  })

  test("generic state's href and keys are clickToMessageAds.empty.*", () => {
    expect(NO_INTEGRATIONS_EMPTY_STATE.href("ws1")).toBe(
      "/space/ws1/settings/channels",
    )
    expect(NO_INTEGRATIONS_EMPTY_STATE.titleKey).toBe(
      "clickToMessageAds.empty.title",
    )
    expect(NO_INTEGRATIONS_EMPTY_STATE.descriptionKey).toBe(
      "clickToMessageAds.empty.description",
    )
    expect(NO_INTEGRATIONS_EMPTY_STATE.ctaKey).toBe(
      "clickToMessageAds.empty.cta",
    )
  })

  test("UNSUPPORTED_INTEGRATIONS_EMPTY_STATE only declares an instagram entry today", () => {
    expect(Object.keys(UNSUPPORTED_INTEGRATIONS_EMPTY_STATE)).toEqual([
      "instagram",
    ])
  })
})
