import { describe, expect, test } from "vitest"
import {
  buildMessagingAdsDashboardPath,
  buildMessagingAdsToolPath,
  MESSAGING_ADS_TOOL_INTEGRATION_PARAM,
  MESSAGING_ADS_TOOL_ROUTE_BASE,
} from "@/features/ads-campaign/lib/tool-path"

describe("buildMessagingAdsToolPath", () => {
  test("returns the workspace root tool path when no channel is given", () => {
    const path = buildMessagingAdsToolPath({ workspaceId: "ws_1" })

    expect(path).toBe("/space/ws_1/messaging-ads")
  })

  test("returns the channel tab path when only a channel is given", () => {
    const path = buildMessagingAdsToolPath({
      workspaceId: "ws_1",
      channel: "whatsapp",
    })

    expect(path).toBe("/space/ws_1/messaging-ads/whatsapp")
  })

  test("appends an integration query param when channel and integrationId are given", () => {
    const path = buildMessagingAdsToolPath({
      workspaceId: "ws_1",
      channel: "messenger",
      integrationId: "im_1",
    })

    expect(path).toBe("/space/ws_1/messaging-ads/messenger?integration=im_1")
  })

  test("URL-encodes an integration id that contains reserved characters", () => {
    const path = buildMessagingAdsToolPath({
      workspaceId: "ws_1",
      channel: "instagram",
      integrationId: "ii 1/2&3",
    })

    expect(path).toBe(
      "/space/ws_1/messaging-ads/instagram?integration=ii+1%2F2%263",
    )
  })

  test("ignores integrationId when channel is not given", () => {
    const path = buildMessagingAdsToolPath({
      workspaceId: "ws_1",
      integrationId: "im_1",
    })

    expect(path).toBe("/space/ws_1/messaging-ads")
  })
})

describe("buildMessagingAdsDashboardPath", () => {
  test("builds the ads dashboard path with a channelAccount query param", () => {
    const path = buildMessagingAdsDashboardPath({
      workspaceId: "ws_1",
      channel: "whatsapp",
      integrationId: "iw_1",
    })

    expect(path).toBe("/space/ws_1/dashboard/ads/whatsapp?channelAccount=iw_1")
  })

  test("URL-encodes an integration id that contains reserved characters", () => {
    const path = buildMessagingAdsDashboardPath({
      workspaceId: "ws_1",
      channel: "instagram",
      integrationId: "ii 1/2&3",
    })

    expect(path).toBe(
      "/space/ws_1/dashboard/ads/instagram?channelAccount=ii+1%2F2%263",
    )
  })
})

describe("exported constants", () => {
  test("MESSAGING_ADS_TOOL_INTEGRATION_PARAM is the literal query param name", () => {
    expect(MESSAGING_ADS_TOOL_INTEGRATION_PARAM).toBe("integration")
  })

  test("MESSAGING_ADS_TOOL_ROUTE_BASE is the literal route segment", () => {
    expect(MESSAGING_ADS_TOOL_ROUTE_BASE).toBe("messaging-ads")
  })
})
