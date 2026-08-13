import type { MessageSeenPayload } from "@chatbotx.io/flow-config"
import { beforeEach, describe, expect, test, vi } from "vitest"

const findManySpy =
  vi.fn<(args: { where: Record<string, unknown> }) => Promise<unknown[]>>()
const executeSpy = vi.fn<(query: string) => Promise<unknown>>()

function sql(strings: TemplateStringsArray, ...values: unknown[]): string {
  return strings.reduce(
    (acc, part, index) =>
      `${acc}${part}${index < values.length ? String(values[index]) : ""}`,
    "",
  )
}

sql.identifier = (value: string) => `"${value}"`
sql.join = (values: unknown[], separator: string) => values.join(separator)

vi.mock("@chatbotx.io/database/client", () => ({
  db: {
    query: {
      contactsOnBroadcastsModel: { findMany: findManySpy },
    },
    execute: executeSpy,
  },
  sql,
}))

vi.mock("@chatbotx.io/database/partials", () => ({
  channelTypes: { enum: { whatsapp: "whatsapp" } },
}))

vi.mock("../src/repositories/postgres", () => ({
  broadcastStatsRepository: {
    getBatchStats: vi.fn(),
    getContactIdsPage: vi.fn(),
    getContacts: vi.fn(),
    getStats: vi.fn(),
    updateClickedBulk: vi.fn(),
    updateFailedBulk: vi.fn(),
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
  findManySpy.mockReset()
  executeSpy.mockReset().mockResolvedValue(undefined)
})

describe("BroadcastAnalyticsService", () => {
  test("sets seenAt only when a broadcast contact is seen (no deliveredAt write)", async () => {
    findManySpy
      .mockResolvedValueOnce([
        {
          broadcastId: "broadcast-1",
          contactId: "contact-1",
          contactInboxId: "contact-inbox-1",
          broadcast: { id: "broadcast-1", workspaceId: "workspace-1" },
        },
      ])
      .mockResolvedValueOnce([
        {
          broadcastId: "broadcast-1",
          contactInboxId: "contact-inbox-1",
        },
      ])
    const { broadcastAnalyticsService } = await import(
      "../src/services/broadcast-analytics.service"
    )

    await broadcastAnalyticsService.onSeen([seenPayload])

    const query = executeSpy.mock.calls[0][0]
    expect(query).toContain('"seenAt" = CASE')
    // A read receipt only updates seenAt; deliveredAt is owned by the send/delivery path.
    expect(query).not.toContain('"deliveredAt"')
    expect(query).toContain("broadcast-1")
    expect(query).toContain("contact-inbox-1")
  })
})
