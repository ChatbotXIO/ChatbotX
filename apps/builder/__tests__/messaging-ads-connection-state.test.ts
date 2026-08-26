import { describe, expect, test, vi } from "vitest"

// ---------------------------------------------------------------------------
// checkMessagingAdsConnectionState — the per-integration connection state
// each channel's capi/page.tsx fetches server-side and passes to
// `MessagingAdsBox`. Replaces the old workspace-only
// `checkAdsCampaignPrerequisites` (v3 correction #5): a workspace with N
// integrations of the same channel can have a DIFFERENT connection state per
// integration, since auth is per-integration.
// ---------------------------------------------------------------------------

const mocks = vi.hoisted(() => ({
  findForIntegration: vi.fn(),
}))

vi.mock("@chatbotx.io/business", () => ({
  messagingAdsConnectionService: {
    findForIntegration: mocks.findForIntegration,
  },
}))

const { checkMessagingAdsConnectionState } = await import(
  "@/features/ads-campaign/queries"
)

describe("checkMessagingAdsConnectionState", () => {
  test("reports not connected and no reconnect needed when there is no connection row", async () => {
    mocks.findForIntegration.mockResolvedValue(null)

    const result = await checkMessagingAdsConnectionState({
      workspaceId: "ws_1",
      channel: "whatsapp",
      integrationId: "iw_1",
    })

    expect(result).toEqual({ connected: false, reconnectNeeded: false })
  })

  test("reports connected when the connection is active", async () => {
    mocks.findForIntegration.mockResolvedValue({
      id: "conn_1",
      status: "active",
    })

    const result = await checkMessagingAdsConnectionState({
      workspaceId: "ws_1",
      channel: "messenger",
      integrationId: "im_1",
    })

    expect(result).toEqual({ connected: true, reconnectNeeded: false })
  })

  test("reports reconnectNeeded (not connected) when the connection is flagged invalid", async () => {
    mocks.findForIntegration.mockResolvedValue({
      id: "conn_1",
      status: "invalid",
    })

    const result = await checkMessagingAdsConnectionState({
      workspaceId: "ws_1",
      channel: "instagram",
      integrationId: "ii_1",
    })

    expect(result).toEqual({ connected: false, reconnectNeeded: true })
  })
})
