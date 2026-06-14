// @vitest-environment node
import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  assertCurrentUserCanAccessChatbot: vi.fn(),
  inboxFindMany: vi.fn(),
  count: vi.fn(),
  relationsFilterToSQL: vi.fn(),
}))

vi.mock("@/lib/auth/utils", () => ({
  assertCurrentUserCanAccessChatbot: mocks.assertCurrentUserCanAccessChatbot,
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
    query: {
      inboxModel: {
        findMany: mocks.inboxFindMany,
      },
    },
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
  mocks.inboxFindMany.mockResolvedValue([{ id: "inbox-1" }])
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
    // RED today: generateWhere only keeps inboxId and drops contactFilter.
    // The fixed query should add RAW/EXISTS/contactId-IN/contact-rooted predicate.
    expect(hasKeyDeep(where, new Set(["RAW", "contactId", "Contact"]))).toBe(
      true,
    )
  })
})
