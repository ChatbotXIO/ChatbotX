// @vitest-environment node
import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  assertCurrentUserCanAccessChatbot: vi.fn(),
  countAudience: vi.fn(),
  listAudiencePreview: vi.fn(),
}))

vi.mock("@/lib/auth/utils", () => ({
  assertCurrentUserCanAccessChatbot: mocks.assertCurrentUserCanAccessChatbot,
}))

vi.mock("@chatbotx.io/business", () => ({
  broadcastService: {
    countAudience: mocks.countAudience,
    listAudiencePreview: mocks.listAudiencePreview,
  },
}))

const { countContactInboxes, listAudienceInboxesPreview } = await import(
  "../src/features/contacts/queries/list-contact-inboxes.queries"
)

beforeEach(() => {
  mocks.assertCurrentUserCanAccessChatbot.mockResolvedValue(undefined)
  mocks.countAudience.mockReset()
  mocks.countAudience.mockResolvedValue(12)
  mocks.listAudiencePreview.mockReset()
  mocks.listAudiencePreview.mockResolvedValue([])
})

describe("countContactInboxes", () => {
  test("authorizes the workspace and delegates broadcast audience counting", async () => {
    const contactFilter = {
      operator: "and" as const,
      conditions: [
        {
          field: "fullName" as const,
          operator: "contains" as const,
          value: "Ada",
        },
      ],
    }

    const result = await countContactInboxes({
      workspaceId: "ws-1",
      channels: ["messenger"],
      integrationWhatsappId: "wa-1",
      integrationMessengerId: "messenger-1",
      contactFilter,
      subaction: "messengerActiveContacts",
    })

    expect(result).toEqual({ total: 12 })
    expect(mocks.assertCurrentUserCanAccessChatbot).toHaveBeenCalledWith("ws-1")
    expect(mocks.countAudience).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      channels: ["messenger"],
      integrationWhatsappId: "wa-1",
      integrationMessengerId: "messenger-1",
      contactFilter,
      canViewEmailAndPhone: undefined,
      subaction: "messengerActiveContacts",
      restrictToAssignedUserId: undefined,
    })
  })

  test("forwards assigned-contact scope to broadcast audience counting", async () => {
    await countContactInboxes(
      {
        workspaceId: "ws-1",
        channels: ["messenger"],
      },
      {
        canViewEmailAndPhone: false,
        restrictToAssignedUserId: "user-1",
      },
    )

    expect(mocks.countAudience).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      channels: ["messenger"],
      integrationWhatsappId: undefined,
      integrationMessengerId: undefined,
      contactFilter: undefined,
      canViewEmailAndPhone: false,
      subaction: undefined,
      restrictToAssignedUserId: "user-1",
    })
  })

  test("forwards assigned-contact scope to audience preview listing", async () => {
    const result = await listAudienceInboxesPreview(
      {
        workspaceId: "ws-1",
        channels: ["messenger"],
        page: 2,
        perPage: 10,
      },
      {
        canViewEmailAndPhone: false,
        restrictToAssignedUserId: "user-1",
      },
    )

    expect(result).toEqual({ data: [] })
    expect(mocks.listAudiencePreview).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      channels: ["messenger"],
      integrationWhatsappId: undefined,
      integrationMessengerId: undefined,
      contactFilter: undefined,
      canViewEmailAndPhone: false,
      subaction: undefined,
      page: 2,
      perPage: 10,
      restrictToAssignedUserId: "user-1",
    })
  })

  test("maps audience preview contact creation time to the stats dialog timestamp", async () => {
    mocks.listAudiencePreview.mockResolvedValue([
      {
        contactId: "contact-1",
        contactInboxId: "contact-inbox-1",
        firstName: "Ada",
        lastName: "Lovelace",
        fullName: "Ada Lovelace",
        avatar: null,
        createdAt: new Date("2026-01-01T10:00:00.000Z"),
        channel: "messenger",
        conversationId: "conversation-1",
      },
    ])

    const result = await listAudienceInboxesPreview({
      workspaceId: "ws-1",
      channels: ["messenger"],
    })

    expect(result).toEqual({
      data: [
        {
          contactId: "contact-1",
          contactInboxId: "contact-inbox-1",
          firstName: "Ada",
          lastName: "Lovelace",
          fullName: "Ada Lovelace",
          avatar: null,
          occurredAt: "2026-01-01T10:00:00.000Z",
          channel: "messenger",
          conversationId: "conversation-1",
        },
      ],
    })
  })
})
