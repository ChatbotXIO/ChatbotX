import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  findByUncached: vi.fn(),
  listPermissionsByUserIds: vi.fn(),
  findByIdForWorkspace: vi.fn(),
}))

vi.mock("../src/conversation/service", () => ({
  conversationService: { findByUncached: mocks.findByUncached },
}))

vi.mock("../src/workspace-member/service", () => ({
  workspaceMemberService: {
    listPermissionsByUserIds: mocks.listPermissionsByUserIds,
  },
}))

vi.mock("@chatbotx.io/database/repositories", () => ({
  whatsappCallRepository: {
    findByIdForWorkspace: mocks.findByIdForWorkspace,
  },
}))

const {
  canCallConversation,
  canCallConversationForMember,
  canReadCall,
  isCallHistoryAdmin,
  isOwnCall,
  loadCallEligibilityMember,
} = await import("../src/whatsapp-call/call-access-service")

const WORKSPACE_ID = "workspace-1"
const USER_ID = "user-1"
const CONVERSATION_ID = "conversation-1"

beforeEach(() => {
  vi.clearAllMocks()
  mocks.findByUncached.mockResolvedValue(undefined)
  mocks.listPermissionsByUserIds.mockResolvedValue([])
  mocks.findByIdForWorkspace.mockResolvedValue(undefined)
})

describe("canCallConversation — fresh, uncached reads", () => {
  test("reads the conversation UNCACHED (findByUncached, not findBy/findByOrFail)", async () => {
    mocks.listPermissionsByUserIds.mockResolvedValue([
      { userId: USER_ID, permissions: { superAdmin: true } },
    ])
    mocks.findByUncached.mockResolvedValue({
      id: CONVERSATION_ID,
      assignedUserId: null,
      assignedInboxTeamId: null,
    })

    await canCallConversation({
      workspaceId: WORKSPACE_ID,
      conversationId: CONVERSATION_ID,
      userId: USER_ID,
    })

    expect(mocks.findByUncached).toHaveBeenCalledWith({
      where: { id: CONVERSATION_ID, workspaceId: WORKSPACE_ID },
    })
  })

  test("reads permissions bounded to exactly the requesting user id", async () => {
    mocks.listPermissionsByUserIds.mockResolvedValue([
      { userId: USER_ID, permissions: { superAdmin: true } },
    ])
    mocks.findByUncached.mockResolvedValue({
      id: CONVERSATION_ID,
      assignedUserId: null,
      assignedInboxTeamId: null,
    })

    await canCallConversation({
      workspaceId: WORKSPACE_ID,
      conversationId: CONVERSATION_ID,
      userId: USER_ID,
    })

    expect(mocks.listPermissionsByUserIds).toHaveBeenCalledWith({
      workspaceId: WORKSPACE_ID,
      userIds: [USER_ID],
    })
  })

  test("denies a user with no WorkspaceMember row (not a member)", async () => {
    mocks.listPermissionsByUserIds.mockResolvedValue([])
    mocks.findByUncached.mockResolvedValue({
      id: CONVERSATION_ID,
      assignedUserId: null,
      assignedInboxTeamId: null,
    })

    const allowed = await canCallConversation({
      workspaceId: WORKSPACE_ID,
      conversationId: CONVERSATION_ID,
      userId: USER_ID,
    })

    expect(allowed).toBe(false)
  })

  test("cross-workspace ids are denied (permissions projection scoped to the given workspaceId returns nothing)", async () => {
    mocks.listPermissionsByUserIds.mockResolvedValue([])
    mocks.findByUncached.mockResolvedValue(undefined)

    const allowed = await canCallConversation({
      workspaceId: "other-workspace",
      conversationId: CONVERSATION_ID,
      userId: USER_ID,
    })

    expect(allowed).toBe(false)
    expect(mocks.listPermissionsByUserIds).toHaveBeenCalledWith({
      workspaceId: "other-workspace",
      userIds: [USER_ID],
    })
  })
})

describe("canCallConversation — H1: unresolvable conversation must fail closed", () => {
  test("superAdmin is DENIED when the conversation cannot be resolved (missing conversation) — never fail-open", async () => {
    mocks.findByUncached.mockResolvedValue(undefined)
    mocks.listPermissionsByUserIds.mockResolvedValue([
      { userId: USER_ID, permissions: { superAdmin: true } },
    ])

    const allowed = await canCallConversation({
      workspaceId: WORKSPACE_ID,
      conversationId: CONVERSATION_ID,
      userId: USER_ID,
    })

    expect(allowed).toBe(false)
  })

  test("a contacts-permission member is DENIED when the conversation cannot be resolved — never fail-open", async () => {
    mocks.findByUncached.mockResolvedValue(undefined)
    mocks.listPermissionsByUserIds.mockResolvedValue([
      { userId: USER_ID, permissions: { contacts: true } },
    ])

    const allowed = await canCallConversation({
      workspaceId: WORKSPACE_ID,
      conversationId: CONVERSATION_ID,
      userId: USER_ID,
    })

    expect(allowed).toBe(false)
  })

  test("a superAdmin member is DENIED for a conversation id that belongs to a different workspace", async () => {
    // `findByUncached` is scoped by `workspaceId` — a conversation that
    // exists, but not in THIS workspace, resolves to `undefined` exactly
    // like a deleted one.
    mocks.findByUncached.mockResolvedValue(undefined)
    mocks.listPermissionsByUserIds.mockResolvedValue([
      { userId: USER_ID, permissions: { superAdmin: true } },
    ])

    const allowed = await canCallConversation({
      workspaceId: WORKSPACE_ID,
      conversationId: "conversation-in-another-workspace",
      userId: USER_ID,
    })

    expect(allowed).toBe(false)
    expect(mocks.findByUncached).toHaveBeenCalledWith({
      where: {
        id: "conversation-in-another-workspace",
        workspaceId: WORKSPACE_ID,
      },
    })
  })
})

describe("canCallConversation — D3 rule table (isEligibleForConversationCall)", () => {
  test("contacts permission allowed regardless of assignment (conversation resolves)", async () => {
    mocks.findByUncached.mockResolvedValue({
      id: CONVERSATION_ID,
      assignedUserId: "someone-else",
      assignedInboxTeamId: null,
    })
    mocks.listPermissionsByUserIds.mockResolvedValue([
      { userId: USER_ID, permissions: { contacts: true } },
    ])

    const allowed = await canCallConversation({
      workspaceId: WORKSPACE_ID,
      conversationId: CONVERSATION_ID,
      userId: USER_ID,
    })

    expect(allowed).toBe(true)
  })

  test("onlyAssignedContacts allowed only when individually assigned to them", async () => {
    mocks.findByUncached.mockResolvedValue({
      id: CONVERSATION_ID,
      assignedUserId: USER_ID,
      assignedInboxTeamId: null,
    })
    mocks.listPermissionsByUserIds.mockResolvedValue([
      { userId: USER_ID, permissions: { onlyAssignedContacts: true } },
    ])

    const allowed = await canCallConversation({
      workspaceId: WORKSPACE_ID,
      conversationId: CONVERSATION_ID,
      userId: USER_ID,
    })

    expect(allowed).toBe(true)
  })

  test("onlyAssignedContacts denied when assigned to someone else", async () => {
    mocks.findByUncached.mockResolvedValue({
      id: CONVERSATION_ID,
      assignedUserId: "someone-else",
      assignedInboxTeamId: null,
    })
    mocks.listPermissionsByUserIds.mockResolvedValue([
      { userId: USER_ID, permissions: { onlyAssignedContacts: true } },
    ])

    const allowed = await canCallConversation({
      workspaceId: WORKSPACE_ID,
      conversationId: CONVERSATION_ID,
      userId: USER_ID,
    })

    expect(allowed).toBe(false)
  })

  test("onlyAssignedContacts denied when the conversation is unassigned (no auto-claim by probing)", async () => {
    mocks.findByUncached.mockResolvedValue({
      id: CONVERSATION_ID,
      assignedUserId: null,
      assignedInboxTeamId: null,
    })
    mocks.listPermissionsByUserIds.mockResolvedValue([
      { userId: USER_ID, permissions: { onlyAssignedContacts: true } },
    ])

    const allowed = await canCallConversation({
      workspaceId: WORKSPACE_ID,
      conversationId: CONVERSATION_ID,
      userId: USER_ID,
    })

    expect(allowed).toBe(false)
  })

  test("member with no matching calling permission is denied", async () => {
    mocks.findByUncached.mockResolvedValue({
      id: CONVERSATION_ID,
      assignedUserId: null,
      assignedInboxTeamId: null,
    })
    mocks.listPermissionsByUserIds.mockResolvedValue([
      { userId: USER_ID, permissions: { flows: true } },
    ])

    const allowed = await canCallConversation({
      workspaceId: WORKSPACE_ID,
      conversationId: CONVERSATION_ID,
      userId: USER_ID,
    })

    expect(allowed).toBe(false)
  })
})

describe("loadCallEligibilityMember + canCallConversationForMember — M3: preload-once path", () => {
  test("loadCallEligibilityMember reads permissions bounded to exactly the requesting user id", async () => {
    mocks.listPermissionsByUserIds.mockResolvedValue([
      { userId: USER_ID, permissions: { superAdmin: true } },
    ])

    const member = await loadCallEligibilityMember({
      workspaceId: WORKSPACE_ID,
      userId: USER_ID,
    })

    expect(member).toEqual({
      userId: USER_ID,
      permissions: { superAdmin: true },
    })
    expect(mocks.listPermissionsByUserIds).toHaveBeenCalledWith({
      workspaceId: WORKSPACE_ID,
      userIds: [USER_ID],
    })
  })

  test("loadCallEligibilityMember returns null for a non-member", async () => {
    mocks.listPermissionsByUserIds.mockResolvedValue([])

    const member = await loadCallEligibilityMember({
      workspaceId: WORKSPACE_ID,
      userId: USER_ID,
    })

    expect(member).toBeNull()
  })

  test("canCallConversationForMember denies without reading the conversation when member is null (no permissions fetch either — preloaded)", async () => {
    const allowed = await canCallConversationForMember({
      member: null,
      workspaceId: WORKSPACE_ID,
      conversationId: CONVERSATION_ID,
    })

    expect(allowed).toBe(false)
    expect(mocks.findByUncached).not.toHaveBeenCalled()
    expect(mocks.listPermissionsByUserIds).not.toHaveBeenCalled()
  })

  test("canCallConversationForMember denies when the conversation cannot be resolved, even for superAdmin (H1 parity)", async () => {
    mocks.findByUncached.mockResolvedValue(undefined)

    const allowed = await canCallConversationForMember({
      member: { userId: USER_ID, permissions: { superAdmin: true } },
      workspaceId: WORKSPACE_ID,
      conversationId: CONVERSATION_ID,
    })

    expect(allowed).toBe(false)
  })

  test("canCallConversationForMember applies the same D3 rule as canCallConversation, without re-fetching permissions", async () => {
    mocks.findByUncached.mockResolvedValue({
      id: CONVERSATION_ID,
      assignedUserId: USER_ID,
      assignedInboxTeamId: null,
    })

    const allowed = await canCallConversationForMember({
      member: { userId: USER_ID, permissions: { onlyAssignedContacts: true } },
      workspaceId: WORKSPACE_ID,
      conversationId: CONVERSATION_ID,
    })

    expect(allowed).toBe(true)
    expect(mocks.listPermissionsByUserIds).not.toHaveBeenCalled()
  })
})

const CALL_ID = "call-1"
const OTHER_USER_ID = "user-2"

const callRow = (
  overrides: Partial<{
    answeredByUserId: string | null
    initiatedByUserId: string | null
    conversationId: string
  }> = {},
) => ({
  id: CALL_ID,
  answeredByUserId: null,
  initiatedByUserId: null,
  conversationId: CONVERSATION_ID,
  ...overrides,
})

describe("isCallHistoryAdmin (plan D4)", () => {
  test("superAdmin is history admin", () => {
    expect(isCallHistoryAdmin({ superAdmin: true })).toBe(true)
  })
  test("analytics is history admin", () => {
    expect(isCallHistoryAdmin({ analytics: true })).toBe(true)
  })
  test("plain contacts is NOT history admin", () => {
    expect(isCallHistoryAdmin({ contacts: true })).toBe(false)
  })
  test("no permissions is NOT history admin", () => {
    expect(isCallHistoryAdmin({})).toBe(false)
  })
})

describe("isOwnCall", () => {
  test("true when the member answered the call", () => {
    expect(
      isOwnCall(
        { userId: USER_ID, permissions: {} },
        callRow({ answeredByUserId: USER_ID }),
      ),
    ).toBe(true)
  })
  test("true when the member initiated the call", () => {
    expect(
      isOwnCall(
        { userId: USER_ID, permissions: {} },
        callRow({ initiatedByUserId: USER_ID }),
      ),
    ).toBe(true)
  })
  test("false for someone else's call", () => {
    expect(
      isOwnCall(
        { userId: USER_ID, permissions: {} },
        callRow({ answeredByUserId: OTHER_USER_ID }),
      ),
    ).toBe(false)
  })
})

describe("canReadCall — scope matrix (plan D4)", () => {
  // C1 fix: `canReadCall` takes the caller's ALREADY-RESOLVED member
  // (`{ userId, permissions }`), never a bare `userId` it would re-resolve
  // via `WorkspaceMember` itself — that re-resolution is exactly what denied
  // a platform support session (synthetic membership, no real
  // `WorkspaceMember` row, AGENTS.md invariant #19) for all four artifact
  // actions. Every test in this describe block therefore asserts
  // `mocks.listPermissionsByUserIds` is NEVER called by `canReadCall` — the
  // regression guard.

  test("denies when the call cannot be resolved in this workspace (non-admin member, row rule needs the call)", async () => {
    mocks.findByIdForWorkspace.mockResolvedValue(undefined)

    const allowed = await canReadCall({
      workspaceId: WORKSPACE_ID,
      whatsappCallId: CALL_ID,
      member: { userId: USER_ID, permissions: { contacts: true } },
      scope: "history",
    })

    expect(allowed).toBe(false)
  })

  test("a preloaded synthetic superAdmin member (platform support session) reads without any WorkspaceMember row — C1 regression guard", async () => {
    // No `WorkspaceMember` row exists for this user at all — exactly a
    // support session's synthetic membership. `canReadCall` must never try
    // to re-resolve one.
    mocks.findByIdForWorkspace.mockResolvedValue(
      callRow({ answeredByUserId: OTHER_USER_ID }),
    )

    const allowed = await canReadCall({
      workspaceId: WORKSPACE_ID,
      whatsappCallId: CALL_ID,
      member: { userId: USER_ID, permissions: { superAdmin: true } },
      scope: "artifact",
    })

    expect(allowed).toBe(true)
    expect(mocks.listPermissionsByUserIds).not.toHaveBeenCalled()
  })

  test("superAdmin reads ANY call under either scope without a conversation lookup or a member-permissions read", async () => {
    mocks.findByIdForWorkspace.mockResolvedValue(
      callRow({ answeredByUserId: OTHER_USER_ID }),
    )

    const allowed = await canReadCall({
      workspaceId: WORKSPACE_ID,
      whatsappCallId: CALL_ID,
      member: { userId: USER_ID, permissions: { superAdmin: true } },
      scope: "history",
    })

    expect(allowed).toBe(true)
    expect(mocks.findByUncached).not.toHaveBeenCalled()
    expect(mocks.listPermissionsByUserIds).not.toHaveBeenCalled()
  })

  test("analytics-only reads any call (same as superAdmin), short-circuiting before the call/conversation reads", async () => {
    mocks.findByIdForWorkspace.mockResolvedValue(
      callRow({ answeredByUserId: OTHER_USER_ID }),
    )

    const allowed = await canReadCall({
      workspaceId: WORKSPACE_ID,
      whatsappCallId: CALL_ID,
      member: { userId: USER_ID, permissions: { analytics: true } },
      scope: "artifact",
    })

    expect(allowed).toBe(true)
    expect(mocks.listPermissionsByUserIds).not.toHaveBeenCalled()
  })

  describe("history scope — contacts agent", () => {
    test("own answered call in any conversation: allowed", async () => {
      mocks.findByIdForWorkspace.mockResolvedValue(
        callRow({ answeredByUserId: USER_ID }),
      )
      mocks.findByUncached.mockResolvedValue({
        id: CONVERSATION_ID,
        assignedUserId: null,
        assignedInboxTeamId: null,
      })

      expect(
        await canReadCall({
          workspaceId: WORKSPACE_ID,
          whatsappCallId: CALL_ID,
          member: { userId: USER_ID, permissions: { contacts: true } },
          scope: "history",
        }),
      ).toBe(true)
    })

    test("own initiated call: allowed", async () => {
      mocks.findByIdForWorkspace.mockResolvedValue(
        callRow({ initiatedByUserId: USER_ID }),
      )
      mocks.findByUncached.mockResolvedValue({
        id: CONVERSATION_ID,
        assignedUserId: null,
        assignedInboxTeamId: null,
      })

      expect(
        await canReadCall({
          workspaceId: WORKSPACE_ID,
          whatsappCallId: CALL_ID,
          member: { userId: USER_ID, permissions: { contacts: true } },
          scope: "history",
        }),
      ).toBe(true)
    })

    test("someone else's call: denied", async () => {
      mocks.findByIdForWorkspace.mockResolvedValue(
        callRow({ answeredByUserId: OTHER_USER_ID }),
      )
      mocks.findByUncached.mockResolvedValue({
        id: CONVERSATION_ID,
        assignedUserId: null,
        assignedInboxTeamId: null,
      })

      expect(
        await canReadCall({
          workspaceId: WORKSPACE_ID,
          whatsappCallId: CALL_ID,
          member: { userId: USER_ID, permissions: { contacts: true } },
          scope: "history",
        }),
      ).toBe(false)
    })
  })

  describe("history scope — onlyAssignedContacts agent", () => {
    test("own call in a conversation assigned to them: allowed", async () => {
      mocks.findByIdForWorkspace.mockResolvedValue(
        callRow({ answeredByUserId: USER_ID }),
      )
      mocks.findByUncached.mockResolvedValue({
        id: CONVERSATION_ID,
        assignedUserId: USER_ID,
        assignedInboxTeamId: null,
      })

      expect(
        await canReadCall({
          workspaceId: WORKSPACE_ID,
          whatsappCallId: CALL_ID,
          member: {
            userId: USER_ID,
            permissions: { onlyAssignedContacts: true },
          },
          scope: "history",
        }),
      ).toBe(true)
    })

    test("own call in an UNASSIGNED conversation: denied (D3, no auto-claim)", async () => {
      mocks.findByIdForWorkspace.mockResolvedValue(
        callRow({ answeredByUserId: USER_ID }),
      )
      mocks.findByUncached.mockResolvedValue({
        id: CONVERSATION_ID,
        assignedUserId: null,
        assignedInboxTeamId: null,
      })

      expect(
        await canReadCall({
          workspaceId: WORKSPACE_ID,
          whatsappCallId: CALL_ID,
          member: {
            userId: USER_ID,
            permissions: { onlyAssignedContacts: true },
          },
          scope: "history",
        }),
      ).toBe(false)
    })

    test("own call in a conversation assigned to SOMEONE ELSE: denied", async () => {
      mocks.findByIdForWorkspace.mockResolvedValue(
        callRow({ answeredByUserId: USER_ID }),
      )
      mocks.findByUncached.mockResolvedValue({
        id: CONVERSATION_ID,
        assignedUserId: OTHER_USER_ID,
        assignedInboxTeamId: null,
      })

      expect(
        await canReadCall({
          workspaceId: WORKSPACE_ID,
          whatsappCallId: CALL_ID,
          member: {
            userId: USER_ID,
            permissions: { onlyAssignedContacts: true },
          },
          scope: "history",
        }),
      ).toBe(false)
    })
  })

  describe("artifact scope — no own-call restriction, only D3 conversation eligibility", () => {
    test("contacts agent may read ANY call's artifacts in any conversation", async () => {
      mocks.findByIdForWorkspace.mockResolvedValue(
        callRow({ answeredByUserId: OTHER_USER_ID }),
      )
      mocks.findByUncached.mockResolvedValue({
        id: CONVERSATION_ID,
        assignedUserId: null,
        assignedInboxTeamId: null,
      })

      expect(
        await canReadCall({
          workspaceId: WORKSPACE_ID,
          whatsappCallId: CALL_ID,
          member: { userId: USER_ID, permissions: { contacts: true } },
          scope: "artifact",
        }),
      ).toBe(true)
    })

    test("onlyAssignedContacts agent denied artifacts for a call in an unassigned conversation", async () => {
      mocks.findByIdForWorkspace.mockResolvedValue(
        callRow({ answeredByUserId: OTHER_USER_ID }),
      )
      mocks.findByUncached.mockResolvedValue({
        id: CONVERSATION_ID,
        assignedUserId: OTHER_USER_ID,
        assignedInboxTeamId: null,
      })

      expect(
        await canReadCall({
          workspaceId: WORKSPACE_ID,
          whatsappCallId: CALL_ID,
          member: {
            userId: USER_ID,
            permissions: { onlyAssignedContacts: true },
          },
          scope: "artifact",
        }),
      ).toBe(false)
    })

    test("onlyAssignedContacts agent allowed artifacts for a call in their own assigned conversation", async () => {
      mocks.findByIdForWorkspace.mockResolvedValue(
        callRow({ answeredByUserId: OTHER_USER_ID }),
      )
      mocks.findByUncached.mockResolvedValue({
        id: CONVERSATION_ID,
        assignedUserId: USER_ID,
        assignedInboxTeamId: null,
      })

      expect(
        await canReadCall({
          workspaceId: WORKSPACE_ID,
          whatsappCallId: CALL_ID,
          member: {
            userId: USER_ID,
            permissions: { onlyAssignedContacts: true },
          },
          scope: "artifact",
        }),
      ).toBe(true)
    })

    test("member with neither contacts nor onlyAssignedContacts nor admin: denied", async () => {
      mocks.findByIdForWorkspace.mockResolvedValue(
        callRow({ answeredByUserId: USER_ID }),
      )
      mocks.findByUncached.mockResolvedValue({
        id: CONVERSATION_ID,
        assignedUserId: null,
        assignedInboxTeamId: null,
      })

      expect(
        await canReadCall({
          workspaceId: WORKSPACE_ID,
          whatsappCallId: CALL_ID,
          member: { userId: USER_ID, permissions: {} },
          scope: "artifact",
        }),
      ).toBe(false)
    })
  })

  test("scopes call findByIdForWorkspace WITHIN the workspace (defense-in-depth)", async () => {
    mocks.findByIdForWorkspace.mockResolvedValue(callRow())

    await canReadCall({
      workspaceId: WORKSPACE_ID,
      whatsappCallId: CALL_ID,
      member: { userId: USER_ID, permissions: { onlyAssignedContacts: true } },
      scope: "artifact",
    })

    expect(mocks.findByIdForWorkspace).toHaveBeenCalledWith(
      CALL_ID,
      WORKSPACE_ID,
    )
  })
})
