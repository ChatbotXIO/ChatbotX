// @vitest-environment node

import { describe, expect, test } from "vitest"
import {
  adsAnalyticsPublicRequest,
  getCtwaFunnelPublicRequest,
  listChannelAdAccountsPublicRequest,
} from "@/features/ads/schema/public"

const RANGE = { from: "2026-08-01", to: "2026-08-07" }
const FUNNEL_RANGE = { since: "2026-08-01", until: "2026-08-07" }

describe("public integrationIds (several integrations of one channel)", () => {
  test("ad-accounts accepts a comma-separated list or an array and keeps the single id", () => {
    expect(
      listChannelAdAccountsPublicRequest.parse({ integrationIds: "10,11" })
        .integrationIds,
    ).toEqual(["10", "11"])
    expect(
      listChannelAdAccountsPublicRequest.parse({
        integrationIds: ["10"],
        integrationId: "9",
      }),
    ).toMatchObject({ integrationIds: ["10"], integrationId: "9" })
  })

  test("analytics overview carries the list through (not stripped) and needs a channel", () => {
    expect(
      adsAnalyticsPublicRequest.parse({
        ...RANGE,
        channel: "messenger",
        integrationIds: "10,11",
      }).integrationIds,
    ).toEqual(["10", "11"])
    expect(
      adsAnalyticsPublicRequest.safeParse({ ...RANGE, integrationIds: "10" })
        .success,
    ).toBe(false)
  })

  test("funnel carries the list through and needs a channel", () => {
    expect(
      getCtwaFunnelPublicRequest.parse({
        ...FUNNEL_RANGE,
        channel: "messenger",
        integrationIds: "10,11",
      }).integrationIds,
    ).toEqual(["10", "11"])
    expect(
      getCtwaFunnelPublicRequest.safeParse({
        ...FUNNEL_RANGE,
        integrationIds: "10",
      }).success,
    ).toBe(false)
  })

  test.each([
    ["non-numeric id", "10,abc"],
    ["more than 200 ids", Array.from({ length: 201 }, (_, i) => `${i + 1}`)],
  ])("rejects %s", (_label, integrationIds) => {
    expect(
      adsAnalyticsPublicRequest.safeParse({
        ...RANGE,
        channel: "messenger",
        integrationIds,
      }).success,
    ).toBe(false)
  })

  test("is exclusive with allChannels", () => {
    expect(
      adsAnalyticsPublicRequest.safeParse({
        ...RANGE,
        allChannels: true,
        channel: "messenger",
        integrationIds: "10",
      }).success,
    ).toBe(false)
  })

  test("an empty value means no list (the single-id behaviour is unchanged)", () => {
    expect(
      adsAnalyticsPublicRequest.parse({
        ...RANGE,
        channel: "messenger",
        integrationMessengerId: "9",
        integrationIds: "",
      }),
    ).toMatchObject({ integrationMessengerId: "9" })
  })
})
