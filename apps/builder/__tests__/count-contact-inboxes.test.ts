// @vitest-environment node
import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  assertCurrentUserCanAccessChatbot: vi.fn(),
  countAudience: vi.fn(),
}))

vi.mock("@/lib/auth/utils", () => ({
  assertCurrentUserCanAccessChatbot: mocks.assertCurrentUserCanAccessChatbot,
}))

vi.mock("@chatbotx.io/business", () => ({
  broadcastService: {
    countAudience: mocks.countAudience,
  },
}))

const { countContactInboxes } = await import(
  "../src/features/contacts/queries/list-contact-inboxes.queries"
)

beforeEach(() => {
  mocks.assertCurrentUserCanAccessChatbot.mockResolvedValue(undefined)
  mocks.countAudience.mockReset()
  mocks.countAudience.mockResolvedValue(12)
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
      subaction: "messengerActiveContacts",
    })
  })
})
