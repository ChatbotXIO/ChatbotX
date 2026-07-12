import { beforeEach, describe, expect, test, vi } from "vitest"

const { mockConversationFindBy, mockFindMemberWithUserByWorkspaceIdAndUserId } =
  vi.hoisted(() => ({
    mockConversationFindBy: vi.fn(),
    mockFindMemberWithUserByWorkspaceIdAndUserId: vi.fn(),
  }))

vi.mock("@chatbotx.io/business", () => ({
  conversationService: {
    findBy: mockConversationFindBy,
  },
  workspaceMemberService: {
    findWithUserByWorkspaceIdAndUserId:
      mockFindMemberWithUserByWorkspaceIdAndUserId,
  },
}))

vi.mock("@chatbotx.io/database/client", () => ({
  db: {
    query: {
      inboxTeamModel: {
        findFirst: vi.fn(),
      },
    },
  },
}))

const { resolveAssigneeEmail, resolveAssigneeId, resolveAssigneeName } =
  await import("../src/helpers/assigned")

describe("assigned field helpers", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockConversationFindBy.mockResolvedValue({
      assignedUserId: "user-1",
    })
    mockFindMemberWithUserByWorkspaceIdAndUserId.mockResolvedValue({
      userId: "user-1",
      user: {
        id: "user-1",
        name: "Ada",
        email: "ada@example.com",
      },
    })
  })

  test("resolves assigned admin fields from the current conversation assignee", async () => {
    await expect(resolveAssigneeName("contact-1", "workspace-1")).resolves.toBe(
      "Ada",
    )
    await expect(
      resolveAssigneeEmail("contact-1", "workspace-1"),
    ).resolves.toBe("ada@example.com")
    await expect(resolveAssigneeId("contact-1", "workspace-1")).resolves.toBe(
      "user-1",
    )

    expect(mockConversationFindBy).toHaveBeenCalledWith({
      where: { contactId: "contact-1", workspaceId: "workspace-1" },
    })
    expect(mockFindMemberWithUserByWorkspaceIdAndUserId).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      userId: "user-1",
    })
  })

  test("returns null when the assigned user is no longer a workspace member", async () => {
    mockFindMemberWithUserByWorkspaceIdAndUserId.mockResolvedValue(undefined)

    await expect(
      resolveAssigneeName("contact-1", "workspace-1"),
    ).resolves.toBeNull()
    await expect(
      resolveAssigneeEmail("contact-1", "workspace-1"),
    ).resolves.toBeNull()
    await expect(
      resolveAssigneeId("contact-1", "workspace-1"),
    ).resolves.toBeNull()
  })

  test("does not fall back to email when the assigned user's name is null", async () => {
    mockFindMemberWithUserByWorkspaceIdAndUserId.mockResolvedValue({
      userId: "user-1",
      user: {
        id: "user-1",
        name: null,
        email: "ada@example.com",
      },
    })

    await expect(
      resolveAssigneeName("contact-1", "workspace-1"),
    ).resolves.toBeNull()
    await expect(
      resolveAssigneeEmail("contact-1", "workspace-1"),
    ).resolves.toBe("ada@example.com")
  })
})
