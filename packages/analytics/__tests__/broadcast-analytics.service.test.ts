import type { MessageSeenPayload } from "@chatbotx.io/flow-config"
import { beforeEach, describe, expect, test, vi } from "vitest"

const getUnreadBroadcastsWithWorkspace = vi.fn()
const getUnreadBroadcastsForContactInboxes = vi.fn()
const updateOccurredAtBulk = vi.fn()

vi.mock("@chatbotx.io/database/partials", () => ({
  channelTypes: { enum: { whatsapp: "whatsapp" } },
}))

vi.mock("../src/repositories/postgres", () => ({
  broadcastStatsRepository: {
    getBatchStats: vi.fn(),
    getContactIdsPage: vi.fn(),
    getContacts: vi.fn(),
    getStats: vi.fn(),
    getUnreadBroadcastsForContactInboxes,
    getUnreadBroadcastsWithWorkspace,
    updateClickedBulk: vi.fn(),
    updateFailedBulk: vi.fn(),
    updateOccurredAtBulk,
  },
}))

const seenPayload = {
  context: {
    workspaceId: "workspace-1",
    contactInboxId: "contact-inbox-1",
  },
  metadata: {},
  occurredAt: new Date("2026-07-21T00:00:00.000Z"),
} as unknown as MessageSeenPayload

beforeEach(() => {
  vi.resetModules()
  getUnreadBroadcastsWithWorkspace.mockReset()
  getUnreadBroadcastsForContactInboxes.mockReset()
  updateOccurredAtBulk.mockReset().mockResolvedValue(undefined)
})

describe("BroadcastAnalyticsService", () => {
  test("sets seenAt only when a broadcast contact is seen (no deliveredAt write)", async () => {
    getUnreadBroadcastsWithWorkspace.mockResolvedValueOnce([
      {
        broadcastId: "broadcast-1",
        contactId: "contact-1",
        contactInboxId: "contact-inbox-1",
        broadcast: { id: "broadcast-1", workspaceId: "workspace-1" },
      },
    ])
    getUnreadBroadcastsForContactInboxes.mockResolvedValueOnce([
      {
        broadcastId: "broadcast-1",
        contactInboxId: "contact-inbox-1",
      },
    ])
    const { broadcastAnalyticsService } = await import(
      "../src/services/broadcast-analytics.service"
    )

    await broadcastAnalyticsService.onSeen([seenPayload])

    expect(updateOccurredAtBulk).toHaveBeenCalledTimes(1)
    const [items, updateField] = updateOccurredAtBulk.mock.calls[0]
    // A read receipt only updates seenAt; deliveredAt is owned by the send/delivery path.
    expect(updateField).toBe("seenAt")
    expect(items).toEqual([
      expect.objectContaining({
        broadcastId: "broadcast-1",
        contactInboxId: "contact-inbox-1",
      }),
    ])
  })
})
