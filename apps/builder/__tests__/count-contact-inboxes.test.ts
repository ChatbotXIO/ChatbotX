// @vitest-environment node
import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  assertCurrentUserCanAccessChatbot: vi.fn(),
  resolveBroadcastInboxIds: vi.fn(),
  count: vi.fn(),
  relationsFilterToSQL: vi.fn(),
}))

vi.mock("@/lib/auth/utils", () => ({
  assertCurrentUserCanAccessChatbot: mocks.assertCurrentUserCanAccessChatbot,
}))

vi.mock("@chatbotx.io/business", () => ({
  inboxService: {
    resolveBroadcastInboxIds: mocks.resolveBroadcastInboxIds,
  },
}))

vi.mock("@chatbotx.io/database/schema", () => ({
  contactInboxModel: {
    id: "ContactInbox.id",
    inboxId: "ContactInbox.inboxId",
    contactId: "ContactInbox.contactId",
  },
}))

vi.mock("@chatbotx.io/database/client", () => ({
  db: {
    $count: mocks.count,
  },
  relationsFilterToSQL: mocks.relationsFilterToSQL,
}))

const { countContactInboxes } = await import(
  "../src/features/contacts/queries/list-contact-inboxes.queries"
)

const hasKeyDeep = (value: unknown, keys: Set<string>): boolean => {
  if (!value || typeof value !== "object") {
    return false
  }
  return Object.entries(value).some(
    ([key, child]) => keys.has(key) || hasKeyDeep(child, keys),
  )
}

beforeEach(() => {
  mocks.assertCurrentUserCanAccessChatbot.mockResolvedValue(undefined)
  mocks.resolveBroadcastInboxIds.mockResolvedValue(["inbox-1"])
  mocks.count.mockResolvedValue(2)
  mocks.relationsFilterToSQL.mockImplementation((_model, where) => ({
    renderedFromWhere: where,
  }))
})

describe("countContactInboxes", () => {
  test("applies contactFilter to the inbox-rooted preview count", async () => {
    await countContactInboxes({
      workspaceId: "ws-1",
      channels: ["messenger"],
      integrationWhatsappId: "wa-1",
      contactFilter: {
        operator: "and",
        conditions: [
          {
            field: "fullName",
            operator: "contains",
            value: "Ada",
          },
        ],
      },
    })

    const where = mocks.relationsFilterToSQL.mock.calls[0]?.[1]

    expect(where).toEqual(
      expect.objectContaining({
        inboxId: { in: ["inbox-1"] },
      }),
    )
    expect(hasKeyDeep(where, new Set(["RAW", "contactId", "Contact"]))).toBe(
      true,
    )
    expect(mocks.resolveBroadcastInboxIds).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      channels: ["messenger"],
      integrationWhatsappId: "wa-1",
    })
  })

  test("passes all requested channels to the broadcast inbox resolver", async () => {
    await countContactInboxes({
      workspaceId: "ws-1",
      channels: ["messenger", "whatsapp"],
    })

    expect(mocks.resolveBroadcastInboxIds).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      channels: ["messenger", "whatsapp"],
      integrationWhatsappId: undefined,
    })
  })
})
